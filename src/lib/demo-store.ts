import { randomUUID } from "node:crypto";
import type { GameSnapshot, Profile, RoundAnswer } from "@/lib/types";

type DemoProfile = Profile & { normalizedName: string };
type DemoGame = {
  id: string;
  code: string;
  status: "waiting" | "active" | "finished";
  secondsPerRound: number;
  targetScore: number;
  currentRound: number;
  currentCountryCode: string | null;
  roundStartedAt: string | null;
  roundEndsAt: string | null;
  hostProfileId: string;
  winnerProfileId: string | null;
  players: Map<string, { score: number; joinedAt: string }>;
  answers: Map<number, RoundAnswer[]>;
  usedCountryCodes: string[];
};

type DemoDatabase = {
  profiles: Map<string, DemoProfile>;
  profilesByName: Map<string, string>;
  games: Map<string, DemoGame>;
};

declare global {
  var __flaggenfieberDemo: DemoDatabase | undefined;
}

export const demoDb: DemoDatabase =
  globalThis.__flaggenfieberDemo ?? {
    profiles: new Map(),
    profilesByName: new Map(),
    games: new Map(),
  };

if (process.env.NODE_ENV !== "production") globalThis.__flaggenfieberDemo = demoDb;

export function demoProfile(displayName: string, normalizedName: string) {
  const existingId = demoDb.profilesByName.get(normalizedName);
  if (existingId) return demoDb.profiles.get(existingId)!;
  const profile: DemoProfile = {
    id: randomUUID(),
    displayName,
    normalizedName,
    lifetimePoints: 0,
    gamesPlayed: 0,
    victories: 0,
  };
  demoDb.profiles.set(profile.id, profile);
  demoDb.profilesByName.set(normalizedName, profile.id);
  return profile;
}

export function demoSnapshot(game: DemoGame, profileId: string): GameSnapshot {
  const me = demoDb.profiles.get(profileId);
  if (!me || !game.players.has(profileId)) throw new Error("Du bist diesem Spiel nicht beigetreten.");
  const players = [...game.players.entries()]
    .map(([id, state]) => ({ ...demoDb.profiles.get(id)!, ...state }))
    .sort((a, b) => b.score - a.score || a.joinedAt.localeCompare(b.joinedAt));
  return {
    mode: "demo",
    serverTime: new Date().toISOString(),
    isHost: game.hostProfileId === profileId,
    me,
    game: {
      id: game.id,
      code: game.code,
      status: game.status,
      secondsPerRound: game.secondsPerRound,
      targetScore: game.targetScore,
      currentRound: game.currentRound,
      currentCountryCode: game.currentCountryCode,
      roundStartedAt: game.roundStartedAt,
      roundEndsAt: game.roundEndsAt,
      hostProfileId: game.hostProfileId,
      winnerProfileId: game.winnerProfileId,
    },
    players,
    answers: game.answers.get(game.currentRound) ?? [],
  };
}

export type { DemoGame };
