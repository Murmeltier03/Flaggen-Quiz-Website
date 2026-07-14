import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "flaggenfieber_player";
const secret = process.env.PLAYER_COOKIE_SECRET || "local-demo-cookie-secret-change-me";

function sign(payload: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export async function setPlayerCookie(profileId: string) {
  const signature = sign(profileId);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${profileId}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function getPlayerId() {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const profileId = value.slice(0, separator);
  const received = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(sign(profileId));
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return profileId;
}
