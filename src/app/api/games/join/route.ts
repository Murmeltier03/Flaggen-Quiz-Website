import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { joinGame, ServiceError } from "@/lib/game-service";
import { getPlayerId } from "@/lib/player-cookie";

const joinSchema = z.object({ code: z.string().trim().min(6).max(6) });

export async function POST(request: Request) {
  try {
    const profileId = await getPlayerId();
    if (!profileId) throw new ServiceError("Bitte gib zuerst deinen Namen ein.", 401);
    const { code } = joinSchema.parse(await request.json());
    const normalizedCode = await joinGame(profileId, code);
    return NextResponse.json({ code: normalizedCode });
  } catch (error) {
    return apiError(error);
  }
}
