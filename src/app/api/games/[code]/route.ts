import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getSnapshot, ServiceError } from "@/lib/game-service";
import { getPlayerId } from "@/lib/player-cookie";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const profileId = await getPlayerId();
    if (!profileId) throw new ServiceError("Bitte gib zuerst deinen Namen ein.", 401);
    const { code } = await context.params;
    const snapshot = await getSnapshot(profileId, code);
    return NextResponse.json(snapshot);
  } catch (error) {
    return apiError(error);
  }
}
