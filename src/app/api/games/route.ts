import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { createGame, ServiceError } from "@/lib/game-service";
import { getPlayerId } from "@/lib/player-cookie";

const settingsSchema = z.object({
  secondsPerRound: z.number().int().min(8).max(45),
  targetScore: z.number().int().min(100).max(500),
});

export async function POST(request: Request) {
  try {
    const profileId = await getPlayerId();
    if (!profileId) throw new ServiceError("Bitte gib zuerst deinen Namen ein.", 401);
    const settings = settingsSchema.parse(await request.json());
    const code = await createGame(profileId, settings.secondsPerRound, settings.targetScore);
    return NextResponse.json({ code });
  } catch (error) {
    return apiError(error);
  }
}
