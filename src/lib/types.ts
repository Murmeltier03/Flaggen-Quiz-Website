export type Profile = {
  id: string;
  displayName: string;
  lifetimePoints: number;
  gamesPlayed: number;
  victories: number;
};

export type GamePlayer = Profile & {
  score: number;
  joinedAt: string;
};

export type RoundAnswer = {
  profileId: string;
  displayName: string;
  rank: number;
  points: number;
  submittedAt: string;
};

export type GameSnapshot = {
  mode: "demo" | "supabase";
  serverTime: string;
  isHost: boolean;
  me: Profile;
  game: {
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
  };
  players: GamePlayer[];
  answers: RoundAnswer[];
};
