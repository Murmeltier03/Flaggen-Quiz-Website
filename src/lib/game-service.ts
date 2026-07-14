import { randomInt, randomUUID } from "node:crypto";
import { avatarIdForSeed, avatarIds } from "@/data/avatars";
import countries from "@/data/countries.json";
import { demoDb, demoProfile, demoSnapshot, type DemoGame } from "@/lib/demo-store";
import { hasSupabase, supabaseAdmin } from "@/lib/supabase-admin";
import { cleanDisplayName, normalizeName } from "@/lib/text";
import type { GameSnapshot, Profile } from "@/lib/types";

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
  const { data: existing, error: selectError } = await db
    .from("profiles")
    .select("*")
    .eq("normalized_name", normalizedName)
    .maybeSingle();
  if (selectError) throw new ServiceError(selectError.message, 500);
  if (existing) return mapProfile(existing);

  const { data, error } = await db
    .from("profiles")
    .insert({
      display_name: displayName,
      normalized_name: normalizedName,
      avatar_id: avatarIds[randomInt(avatarIds.length)],
    })
    .select("*")
    .single();
  if (error?.code === "23505") return getOrCreateProfile(displayName);
  if (error) throw new ServiceError(error.message, 500);
  return mapProfile(data);
}

export async function getProfile(profileId: string) {
  if (!hasSupabase) {
    const profile = demoDb.profiles.get(profileId) ?? null;
    if (profile && !profile.avatarId) profile.avatarId = avatarIds[randomInt(avatarIds.length)];
    return profile;
  }
  const { data, error } = await requireAdmin().from("profiles").select("*").eq("id", profileId).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return data ? mapProfile(data) : null;
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
  const { data: membership } = await db
    .from("game_players")
    .select("profile_id")
    .eq("game_id", game.id)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!membership) throw new ServiceError("Du bist diesem Spiel nicht beigetreten.", 403);

  const { data: playerRows, error: playerError } = await db
    .from("game_players")
    .select("profile_id, score, joined_at")
    .eq("game_id", game.id)
    .order("score", { ascending: false });
  if (playerError) throw new ServiceError(playerError.message, 500);
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

  const { data: answerRows, error: answerError } = await db
    .from("round_answers")
    .select("profile_id, rank, points_awarded, submitted_at")
    .eq("game_id", game.id)
    .eq("round_no", game.current_round)
    .order("rank");
  if (answerError) throw new ServiceError(answerError.message, 500);

  return {
    mode: "supabase",
    serverTime: new Date().toISOString(),
    isHost: game.host_profile_id === profileId,
    me,
    game: {
      id: game.id,
      code: game.code,
      status: game.status,
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
    answers: (answerRows ?? []).map((row) => ({
      profileId: row.profile_id,
      displayName: profileMap.get(row.profile_id)?.displayName ?? "Spieler",
      avatarId: profileMap.get(row.profile_id)?.avatarId ?? "fox",
      rank: row.rank,
      points: row.points_awarded,
      submittedAt: row.submitted_at,
    })),
  };
}

export async function startRound(profileId: string, rawCode: string) {
  const code = rawCode.toUpperCase();
  if (!hasSupabase) {
    const game = demoDb.games.get(code);
    if (!game) throw new ServiceError("Spiel nicht gefunden.", 404);
    if (game.hostProfileId !== profileId) throw new ServiceError("Nur der Host kann eine Runde starten.", 403);
    if (game.status === "finished") throw new ServiceError("Das Spiel ist bereits beendet.");
    if (game.roundEndsAt && new Date(game.roundEndsAt).getTime() > Date.now()) throw new ServiceError("Die aktuelle Runde läuft noch.");
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
  const { data: game, error } = await db.from("games").select("*").eq("code", code).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!game) throw new ServiceError("Spiel nicht gefunden.", 404);
  if (game.host_profile_id !== profileId) throw new ServiceError("Nur der Host kann eine Runde starten.", 403);
  if (game.status === "finished") throw new ServiceError("Das Spiel ist bereits beendet.");
  if (game.round_ends_at && new Date(game.round_ends_at).getTime() > Date.now()) throw new ServiceError("Die aktuelle Runde läuft noch.");
  const { data: usedRows } = await db.from("rounds").select("country_code").eq("game_id", game.id);
  const used = new Set((usedRows ?? []).map((row) => row.country_code));
  const available = countries.filter((country) => !used.has(country.code));
  const pool = available.length ? available : countries;
  const country = pool[randomInt(pool.length)];
  const roundNo = game.current_round + 1;
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + game.seconds_per_round * 1000);
  const { error: roundError } = await db.from("rounds").insert({
    game_id: game.id,
    round_no: roundNo,
    country_code: country.code,
    started_at: startedAt.toISOString(),
    ends_at: endsAt.toISOString(),
  });
  if (roundError) throw new ServiceError(roundError.message, 500);
  const { error: updateError } = await db
    .from("games")
    .update({
      status: "active",
      current_round: roundNo,
      current_country_code: country.code,
      round_started_at: startedAt.toISOString(),
      round_ends_at: endsAt.toISOString(),
    })
    .eq("id", game.id);
  if (updateError) throw new ServiceError(updateError.message, 500);
  return getSnapshot(profileId, code);
}

export async function submitAnswer(profileId: string, rawCode: string, countryCode: string) {
  const code = rawCode.toUpperCase();
  if (!hasSupabase) {
    const game = demoDb.games.get(code);
    if (!game) throw new ServiceError("Spiel nicht gefunden.", 404);
    if (!game.players.has(profileId)) throw new ServiceError("Du bist nicht im Spiel.", 403);
    if (!game.currentCountryCode || game.status !== "active") throw new ServiceError("Es läuft gerade keine Runde.");
    if (!game.roundEndsAt || new Date(game.roundEndsAt).getTime() <= Date.now()) return { correct: false, expired: true };
    if (game.currentCountryCode !== countryCode) return { correct: false, expired: false };
    const answers = game.answers.get(game.currentRound) ?? [];
    const existing = answers.find((answer) => answer.profileId === profileId);
    if (existing) return { correct: true, answer: existing };
    const rank = answers.length + 1;
    const points = Math.max(1, 11 - rank);
    const answer = {
      profileId,
      displayName: demoDb.profiles.get(profileId)?.displayName ?? "Spieler",
      avatarId: demoDb.profiles.get(profileId)?.avatarId ?? "fox",
      rank,
      points,
      submittedAt: new Date().toISOString(),
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
    return { correct: true, answer };
  }

  const db = requireAdmin();
  const { data: game, error } = await db.from("games").select("*").eq("code", code).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!game) throw new ServiceError("Spiel nicht gefunden.", 404);
  const { data: membership } = await db
    .from("game_players")
    .select("profile_id")
    .eq("game_id", game.id)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!membership) throw new ServiceError("Du bist nicht im Spiel.", 403);
  if (!game.round_ends_at || new Date(game.round_ends_at).getTime() <= Date.now()) return { correct: false, expired: true };
  if (game.current_country_code !== countryCode) return { correct: false, expired: false };
  const { data, error: insertError } = await db
    .from("round_answers")
    .insert({ game_id: game.id, round_no: game.current_round, profile_id: profileId, country_code: countryCode })
    .select("rank, points_awarded, submitted_at")
    .single();
  if (insertError?.code === "23505") return { correct: true, duplicate: true };
  if (insertError) throw new ServiceError(insertError.message, 400);
  return { correct: true, answer: data };
}
