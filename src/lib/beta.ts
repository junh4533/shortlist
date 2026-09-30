/** Beta allowlist: emails in beta_emails may use a cookie instead of basic auth. */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { betaEmails } from "./db/schema";

export const BETA_COOKIE = "beta_email";

export function normalizeBetaEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function isBetaEmail(email: string): Promise<boolean> {
  const normalized = normalizeBetaEmail(email);
  if (!normalized || !normalized.includes("@")) return false;
  const [row] = await getDb().select().from(betaEmails).where(eq(betaEmails.email, normalized)).limit(1);
  return Boolean(row);
}
