/** Session cookie backed by the sessions table. */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

export type SessionUser = {
  email: string;
  name: string;
  role: "admin" | "user";
  betaAccess: boolean;
};

export async function createSession(email: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await getDb().insert(sessions).values({ token, email, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    secure: Boolean(process.env.VERCEL),
  });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.token, token));
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!session || session.expiresAt < new Date().toISOString()) {
    if (session) await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }
  const [user] = await db.select().from(users).where(eq(users.email, session.email)).limit(1);
  if (!user) return null;
  return {
    email: user.email,
    name: user.name,
    role: user.role === "admin" ? "admin" : "user",
    betaAccess: user.betaAccess,
  };
}
