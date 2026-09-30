"use server";

/** Beta gate for the landing form: check allowlist, set cookie, caller navigates to /onboarding. */
import { cookies } from "next/headers";
import { BETA_COOKIE, isBetaEmail, normalizeBetaEmail } from "@/lib/beta";

export type BetaAccessResult = { ok: true } | { ok: false; message: string };

export async function requestBetaAccess(email: string): Promise<BetaAccessResult> {
  const normalized = normalizeBetaEmail(email);
  if (!normalized || !normalized.includes("@") || normalized.includes(" ")) {
    return { ok: false, message: "Enter a valid email." };
  }
  if (!(await isBetaEmail(normalized))) {
    return { ok: false, message: "That email isn't on the beta list." };
  }
  const jar = await cookies();
  jar.set(BETA_COOKIE, normalized, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
    secure: Boolean(process.env.VERCEL),
  });
  return { ok: true };
}
