import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { ServiceError, startRound } from "@/lib/game-service";
import { getPlayerId } from "@/lib/player-cookie";

const startSchema = z.object({
  expectedRound: z.number().int().min(0).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const profileId = await getPlayerId();
    if (!profileId) throw new ServiceError("Bitte gib zuerst deinen Namen ein.", 401);
    const { code } = await context.params;
    const payload = startSchema.parse(await request.json().catch(() => ({})));
    const snapshot = await startRound(profileId, code, payload.expectedRound);
    return NextResponse.json(snapshot);
  } catch (error) {
    return apiError(error);
  }
}
