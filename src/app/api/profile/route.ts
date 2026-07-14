import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getOrCreateProfile, getProfile, ServiceError } from "@/lib/game-service";
import { getPlayerId, setPlayerCookie } from "@/lib/player-cookie";

const profileSchema = z.object({ name: z.string().min(2).max(40) });

export async function GET() {
  try {
    const playerId = await getPlayerId();
    if (!playerId) throw new ServiceError("Kein Spielerprofil gefunden.", 401);
    const profile = await getProfile(playerId);
    if (!profile) throw new ServiceError("Spielerprofil nicht gefunden.", 404);
    return NextResponse.json({ profile });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = profileSchema.parse(await request.json());
    const profile = await getOrCreateProfile(body.name);
    await setPlayerCookie(profile.id);
    return NextResponse.json({ profile });
  } catch (error) {
    return apiError(error);
  }
}
