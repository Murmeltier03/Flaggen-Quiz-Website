export type Profile = {
  id: string;
  displayName: string;
  avatarId: string;
  lifetimePoints: number;
  gamesPlayed: number;
  victories: number;
};

export type LeaderboardEntry = Pick<
  Profile,
  "id" | "displayName" | "avatarId" | "lifetimePoints" | "gamesPlayed" | "victories"
>;

export type GamePlayer = Profile & {
  score: number;
  joinedAt: string;
};

export type RoundAnswer = {
  profileId: string;
  displayName: string;
  avatarId: string;
  rank: number;
  points: number;
  speedPercent: number;
  reactionMs: number;
  submittedAt: string;
};

export type GameStatus = "waiting" | "active" | "finished";

export type AnswerSubmissionResult = {
  correct: boolean;
  expired: boolean;
  duplicate: boolean;
  answer: RoundAnswer | null;
  playerScore: number | null;
  gameStatus: GameStatus | null;
  winnerProfileId: string | null;
  serverTime: string;
};

export type GameSnapshot = {
  mode: "demo" | "supabase";
  serverTime: string;
  isHost: boolean;
  me: Profile;
  game: {
    id: string;
    code: string;
    status: GameStatus;
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
