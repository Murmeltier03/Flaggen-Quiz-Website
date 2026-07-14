import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ServiceError } from "@/lib/game-service";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Bitte prüfe deine Eingaben." }, { status: 400 });
  }
  if (error instanceof ServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Etwas ist schiefgelaufen." }, { status: 500 });
}
