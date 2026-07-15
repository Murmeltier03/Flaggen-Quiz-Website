import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getLeaderboard } from "@/lib/game-service";

export async function GET() {
  try {
    const leaderboard = await getLeaderboard();
    return NextResponse.json(
      { leaderboard },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
