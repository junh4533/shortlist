"use server";

/** Sign up, log in, and log out against the users table. */
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearSession, createSession } from "@/lib/auth/session";

export type AuthResult = { ok: true } | { ok: false; message: string };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function signUp(input: { name: string; email: string; password: string }): Promise<AuthResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;
  if (name.length < 1) return { ok: false, message: "Enter your name." };
  if (!email.includes("@") || email.includes(" ")) return { ok: false, message: "Enter a valid email." };
  if (password.length < 8) return { ok: false, message: "Use at least 8 characters." };

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { ok: false, message: "An account with that email already exists. Log in." };

  await db.insert(users).values({
    email,
    name,
    passwordHash: await hashPassword(password),
    betaAccess: false,
    role: "user",
    createdAt: new Date().toISOString(),
  });
  await createSession(email);
  redirect("/pending");
}

export async function logIn(input: { email: string; password: string }): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    return { ok: false, message: "Email or password is wrong." };
  }
  await createSession(email);
  if (!user.betaAccess) redirect("/pending");
  redirect("/jobs");
}

export async function logOut() {
  await clearSession();
  redirect("/welcome");
}
