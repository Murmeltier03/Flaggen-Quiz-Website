import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { ServiceError, submitAnswer } from "@/lib/game-service";
import { getPlayerId } from "@/lib/player-cookie";

const answerSchema = z.object({ countryCode: z.string().regex(/^[a-z]{2}$/) });

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const profileId = await getPlayerId();
    if (!profileId) throw new ServiceError("Bitte gib zuerst deinen Namen ein.", 401);
    const { code } = await context.params;
    const { countryCode } = answerSchema.parse(await request.json());
    const result = await submitAnswer(profileId, code, countryCode);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
