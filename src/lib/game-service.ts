import { randomInt, randomUUID } from "node:crypto";
import { avatarIdForSeed } from "@/data/avatars";
import countries from "@/data/countries.json";
import {
  demoDb,
  demoProfile,
  demoSnapshot,
  leastUsedDemoAvatarId,
  type DemoGame,
} from "@/lib/demo-store";
import { hasSupabase, supabaseAdmin } from "@/lib/supabase-admin";
import { cleanDisplayName, normalizeName } from "@/lib/text";
import type {
  AnswerSubmissionResult,
  GameSnapshot,
  GameStatus,
  LeaderboardEntry,
  Profile,
  RoundAnswer,
} from "@/lib/types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class ServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function gameCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    avatarId: String(row.avatar_id ?? avatarIdForSeed(String(row.normalized_name ?? row.display_name))),
    lifetimePoints: Number(row.lifetime_points ?? 0),
    gamesPlayed: Number(row.games_played ?? 0),
    victories: Number(row.victories ?? 0),
  };
}

function parseGameStatus(value: unknown): GameStatus | null {
  return value === "waiting" || value === "active" || value === "finished" ? value : null;
}

function reactionTier(reactionMs: number) {
  if (reactionMs <= 3_000) return { speedPercent: 100, points: 10 };
  if (reactionMs <= 6_000) return { speedPercent: 80, points: 8 };
  if (reactionMs <= 9_000) return { speedPercent: 60, points: 6 };
  if (reactionMs <= 12_000) return { speedPercent: 40, points: 4 };
  return { speedPercent: 20, points: 2 };
}

function firstRpcRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function requireAdmin() {
  if (!supabaseAdmin) throw new ServiceError("Supabase ist nicht konfiguriert.", 503);
  return supabaseAdmin;
}

export async function getOrCreateProfile(rawName: string) {
  const displayName = cleanDisplayName(rawName);
  const normalizedName = normalizeName(displayName);
  if (displayName.length < 2) throw new ServiceError("Bitte gib mindestens zwei Zeichen ein.");

  if (!hasSupabase) return demoProfile(displayName, normalizedName);
  const db = requireAdmin();
  const { data, error } = await db
    .rpc("create_or_get_profile", {
      p_display_name: displayName,
      p_normalized_name: normalizedName,
    })
    .single();
  if (error) throw new ServiceError(error.message, 500);
  if (!data) throw new ServiceError("Das Spielerprofil konnte nicht angelegt werden.", 500);
  return mapProfile(data as Record<string, unknown>);
}

export async function getProfile(profileId: string) {
  if (!hasSupabase) {
    const profile = demoDb.profiles.get(profileId) ?? null;
    if (profile && !profile.avatarId) profile.avatarId = leastUsedDemoAvatarId();
    return profile;
  }
  const { data, error } = await requireAdmin().from("profiles").select("*").eq("id", profileId).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return data ? mapProfile(data) : null;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!hasSupabase) {
    return [...demoDb.profiles.values()]
      .sort(
        (left, right) =>
          right.lifetimePoints - left.lifetimePoints ||
          right.victories - left.victories ||
          left.displayName.localeCompare(right.displayName, "de"),
      )
      .map(({ id, displayName, avatarId, lifetimePoints, gamesPlayed, victories }) => ({
        id,
        displayName,
        avatarId,
        lifetimePoints,
        gamesPlayed,
        victories,
      }));
  }

  const { data, error } = await requireAdmin()
    .from("profiles")
    .select("id, display_name, avatar_id, lifetime_points, games_played, victories, created_at")
    .order("lifetime_points", { ascending: false })
    .order("victories", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new ServiceError(error.message, 500);
  return (data ?? []).map(mapProfile);
}

export async function createGame(profileId: string, secondsPerRound: number, targetScore: number) {
  if (secondsPerRound < 8 || secondsPerRound > 45) throw new ServiceError("Die Rundendauer muss zwischen 8 und 45 Sekunden liegen.");
  if (targetScore < 100 || targetScore > 500) throw new ServiceError("Das Punkteziel muss zwischen 100 und 500 liegen.");

  if (!hasSupabase) {
    let code = gameCode();
    while (demoDb.games.has(code)) code = gameCode();
    const game: DemoGame = {
      id: randomUUID(),
      code,
      status: "waiting",
      secondsPerRound,
      targetScore,
      currentRound: 0,
      currentCountryCode: null,
      roundStartedAt: null,
      roundEndsAt: null,
      hostProfileId: profileId,
      winnerProfileId: null,
      players: new Map([[profileId, { score: 0, joinedAt: new Date().toISOString() }]]),
      answers: new Map(),
      usedCountryCodes: [],
    };
    demoDb.games.set(code, game);
    return code;
  }

  const db = requireAdmin();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = gameCode();
    const { data, error } = await db
      .from("games")
      .insert({ code, host_profile_id: profileId, seconds_per_round: secondsPerRound, target_score: targetScore })
      .select("id, code")
      .single();
    if (error?.code === "23505") continue;
    if (error) throw new ServiceError(error.message, 500);
    const { error: joinError } = await db.from("game_players").insert({ game_id: data.id, profile_id: profileId });
    if (joinError) throw new ServiceError(joinError.message, 500);
    return data.code as string;
  }
  throw new ServiceError("Es konnte kein eindeutiger Spielcode erstellt werden.", 500);
}

export async function joinGame(profileId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!hasSupabase) {
    const game = demoDb.games.get(code);
    if (!game) throw new ServiceError("Diesen Spielcode gibt es nicht.", 404);
    if (game.status === "finished") throw new ServiceError("Dieses Spiel ist bereits beendet.");
    if (!demoDb.profiles.has(profileId)) throw new ServiceError("Bitte gib zuerst deinen Namen ein.", 401);
    if (!game.players.has(profileId)) game.players.set(profileId, { score: 0, joinedAt: new Date().toISOString() });
    return code;
  }

  const db = requireAdmin();
  const { data: game, error } = await db.from("games").select("id, status").eq("code", code).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!game) throw new ServiceError("Diesen Spielcode gibt es nicht.", 404);
  if (game.status === "finished") throw new ServiceError("Dieses Spiel ist bereits beendet.");
  const { error: joinError } = await db
    .from("game_players")
    .upsert({ game_id: game.id, profile_id: profileId }, { onConflict: "game_id,profile_id", ignoreDuplicates: true });
  if (joinError) throw new ServiceError(joinError.message, 500);
  return code;
}

export async function getSnapshot(profileId: string, rawCode: string): Promise<GameSnapshot> {
  const code = rawCode.toUpperCase();
  if (!hasSupabase) {
    const game = demoDb.games.get(code);
    if (!game) throw new ServiceError("Spiel nicht gefunden.", 404);
    return demoSnapshot(game, profileId);
  }

  const db = requireAdmin();
  const { data: game, error } = await db.from("games").select("*").eq("code", code).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!game) throw new ServiceError("Spiel nicht gefunden.", 404);
  const [membershipResult, playersResult, answersResult] = await Promise.all([
    db
      .from("game_players")
      .select("profile_id")
      .eq("game_id", game.id)
      .eq("profile_id", profileId)
      .maybeSingle(),
    db
      .from("game_players")
      .select("profile_id, score, joined_at")
      .eq("game_id", game.id)
      .order("score", { ascending: false }),
    db
      .from("round_answers")
      .select("profile_id, rank, points_awarded, speed_percent, reaction_ms, submitted_at")
      .eq("game_id", game.id)
      .eq("round_no", game.current_round)
      .order("rank"),
  ]);
  if (membershipResult.error) throw new ServiceError(membershipResult.error.message, 500);
  const membership = membershipResult.data;
  if (!membership) throw new ServiceError("Du bist diesem Spiel nicht beigetreten.", 403);
  if (playersResult.error) throw new ServiceError(playersResult.error.message, 500);
  if (answersResult.error) throw new ServiceError(answersResult.error.message, 500);
  const playerRows = playersResult.data;
  const profileIds = (playerRows ?? []).map((row) => row.profile_id);
  const { data: profiles, error: profileError } = await db.from("profiles").select("*").in("id", profileIds);
  if (profileError) throw new ServiceError(profileError.message, 500);
  const profileMap = new Map((profiles ?? []).map((row) => [row.id, mapProfile(row)]));
  const players = (playerRows ?? []).map((row) => ({
    ...profileMap.get(row.profile_id)!,
    score: row.score,
    joinedAt: row.joined_at,
  }));
  const me = profileMap.get(profileId);
  if (!me) throw new ServiceError("Profil nicht gefunden.", 404);
  const gameStatus = parseGameStatus(game.status);
  if (!gameStatus) throw new ServiceError("Das Spiel hat einen ungültigen Status.", 500);

  return {
    mode: "supabase",
    serverTime: new Date().toISOString(),
    isHost: game.host_profile_id === profileId,
    me,
    game: {
      id: game.id,
      code: game.code,
      status: gameStatus,
      secondsPerRound: game.seconds_per_round,
      targetScore: game.target_score,
      currentRound: game.current_round,
      currentCountryCode: game.current_country_code,
      roundStartedAt: game.round_started_at,
      roundEndsAt: game.round_ends_at,
      hostProfileId: game.host_profile_id,
      winnerProfileId: game.winner_profile_id,
    },
    players,
    answers: (answersResult.data ?? []).map((row) => ({
      profileId: row.profile_id,
      displayName: profileMap.get(row.profile_id)?.displayName ?? "Spieler",
      avatarId: profileMap.get(row.profile_id)?.avatarId ?? "fox",
      rank: row.rank,
      points: row.points_awarded,
      speedPercent: row.speed_percent,
      reactionMs: row.reaction_ms,
      submittedAt: row.submitted_at,
    })),
  };
}

export async function startRound(profileId: string, rawCode: string, expectedRound?: number) {
  const code = rawCode.toUpperCase();
  if (!hasSupabase) {
    const game = demoDb.games.get(code);
    if (!game) throw new ServiceError("Spiel nicht gefunden.", 404);
    if (game.hostProfileId !== profileId) throw new ServiceError("Nur der Host kann eine Runde starten.", 403);
    if (game.status === "finished") return demoSnapshot(game, profileId);
    if (expectedRound !== undefined && game.currentRound !== expectedRound) return demoSnapshot(game, profileId);
    if (game.roundEndsAt && new Date(game.roundEndsAt).getTime() > Date.now()) return demoSnapshot(game, profileId);
    let available = countries.filter((country) => !game.usedCountryCodes.includes(country.code));
    if (!available.length) {
      game.usedCountryCodes = [];
      available = [...countries];
    }
    const country = available[randomInt(available.length)];
    const startedAt = new Date();
    game.status = "active";
    game.currentRound += 1;
    game.currentCountryCode = country.code;
    game.roundStartedAt = startedAt.toISOString();
    game.roundEndsAt = new Date(startedAt.getTime() + game.secondsPerRound * 1000).toISOString();
    game.answers.set(game.currentRound, []);
    game.usedCountryCodes.push(country.code);
    return demoSnapshot(game, profileId);
  }

  const db = requireAdmin();
  const { data: game, error } = await db
    .from("games")
    .select("id, host_profile_id, status, current_round")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!game) throw new ServiceError("Spiel nicht gefunden.", 404);
  if (game.host_profile_id !== profileId) throw new ServiceError("Nur der Host kann eine Runde starten.", 403);
  if (game.status === "finished") return getSnapshot(profileId, code);
  if (expectedRound !== undefined && game.current_round !== expectedRound) return getSnapshot(profileId, code);
  const { data: usedRows, error: usedError } = await db.from("rounds").select("country_code").eq("game_id", game.id);
  if (usedError) throw new ServiceError(usedError.message, 500);
  const used = new Set((usedRows ?? []).map((row) => row.country_code));
  const available = countries.filter((country) => !used.has(country.code));
  const pool = available.length ? available : countries;
  const country = pool[randomInt(pool.length)];
  const { error: startError } = await db.rpc("start_game_round", {
    p_game_code: code,
    p_profile_id: profileId,
    p_country_code: country.code,
    p_expected_round: expectedRound ?? game.current_round,
  });
  if (startError) throw new ServiceError(startError.message, 400);
  return getSnapshot(profileId, code);
}

export async function submitAnswer(
  profileId: string,
  rawCode: string,
  countryCode: string,
): Promise<AnswerSubmissionResult> {
  const code = rawCode.toUpperCase();
  const normalizedCountryCode = countryCode.trim().toLowerCase();
  if (!hasSupabase) {
    const game = demoDb.games.get(code);
    if (!game) throw new ServiceError("Spiel nicht gefunden.", 404);
    if (!game.players.has(profileId)) throw new ServiceError("Du bist nicht im Spiel.", 403);
    const acceptedAt = new Date();
    const serverTime = acceptedAt.toISOString();
    const answers = game.answers.get(game.currentRound) ?? [];
    const existing = answers.find((answer) => answer.profileId === profileId);
    if (existing) {
      return {
        correct: true,
        expired: false,
        duplicate: true,
        answer: existing,
        playerScore: game.players.get(profileId)!.score,
        gameStatus: game.status,
        winnerProfileId: game.winnerProfileId,
        serverTime,
      };
    }
    if (!game.currentCountryCode || game.status !== "active") throw new ServiceError("Es läuft gerade keine Runde.");
    if (!game.roundEndsAt || new Date(game.roundEndsAt).getTime() <= acceptedAt.getTime()) {
      return {
        correct: false,
        expired: true,
        duplicate: false,
        answer: null,
        playerScore: null,
        gameStatus: game.status,
        winnerProfileId: game.winnerProfileId,
        serverTime,
      };
    }
    if (game.currentCountryCode !== normalizedCountryCode) {
      return {
        correct: false,
        expired: false,
        duplicate: false,
        answer: null,
        playerScore: null,
        gameStatus: game.status,
        winnerProfileId: game.winnerProfileId,
        serverTime,
      };
    }
    const rank = answers.length + 1;
    const reactionMs = Math.max(0, acceptedAt.getTime() - new Date(game.roundStartedAt ?? serverTime).getTime());
    const { speedPercent, points } = reactionTier(reactionMs);
    const answer: RoundAnswer = {
      profileId,
      displayName: demoDb.profiles.get(profileId)?.displayName ?? "Spieler",
      avatarId: demoDb.profiles.get(profileId)?.avatarId ?? "fox",
      rank,
      points,
      speedPercent,
      reactionMs,
      submittedAt: serverTime,
    };
    answers.push(answer);
    game.answers.set(game.currentRound, answers);
    const player = game.players.get(profileId)!;
    player.score += points;
    const profile = demoDb.profiles.get(profileId)!;
    profile.lifetimePoints += points;
    if (player.score >= game.targetScore) {
      game.status = "finished";
      game.winnerProfileId = profileId;
      profile.victories += 1;
      for (const id of game.players.keys()) demoDb.profiles.get(id)!.gamesPlayed += 1;
    }
    return {
      correct: true,
      expired: false,
      duplicate: false,
      answer,
      playerScore: player.score,
      gameStatus: game.status,
      winnerProfileId: game.winnerProfileId,
      serverTime,
    };
  }

  const db = requireAdmin();
  const { data, error } = await db.rpc("submit_game_answer", {
    p_game_code: code,
    p_profile_id: profileId,
    p_country_code: normalizedCountryCode,
  });
  if (error) throw new ServiceError(error.message, 400);
  const row = firstRpcRow(data);
  if (!row) throw new ServiceError("Die Antwort konnte nicht ausgewertet werden.", 500);

  const correct = row.is_correct === true;
  let answer: RoundAnswer | null = null;
  if (correct) {
    const rank = nullableNumber(row.answer_rank);
    const points = nullableNumber(row.answer_points);
    const speedPercent = nullableNumber(row.answer_speed_percent);
    const reactionMs = nullableNumber(row.answer_reaction_ms);
    const submittedAt = row.answer_submitted_at ? String(row.answer_submitted_at) : null;
    if (rank === null || points === null || speedPercent === null || reactionMs === null || !submittedAt) {
      throw new ServiceError("Die Serverauswertung war unvollständig.", 500);
    }

    let displayName = row.answer_display_name ? String(row.answer_display_name) : null;
    let avatarId = row.answer_avatar_id ? String(row.answer_avatar_id) : null;
    if (!displayName || !avatarId) {
      const profile = await getProfile(profileId);
      if (!profile) throw new ServiceError("Spielerprofil nicht gefunden.", 404);
      displayName = profile.displayName;
      avatarId = profile.avatarId;
    }
    answer = {
      profileId,
      displayName,
      avatarId,
      rank,
      points,
      speedPercent,
      reactionMs,
      submittedAt,
    };
  }

  return {
    correct,
    expired: row.is_expired === true,
    duplicate: row.is_duplicate === true,
    answer,
    playerScore: nullableNumber(row.player_score),
    gameStatus: parseGameStatus(row.game_status),
    winnerProfileId: row.winner_profile_id ? String(row.winner_profile_id) : null,
    serverTime: String(row.server_time ?? row.answer_submitted_at ?? new Date().toISOString()),
  };
}
