/** Create the admin account once, without resetting an existing password. */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { hashPassword } from "./password";

export const ADMIN_EMAIL = "junh4533@gmail.com";

export async function ensureAdmin(log = false) {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (existing) return;
  const password = process.env.ADMIN_PASSWORD?.trim() || randomBytes(9).toString("base64url");
  const now = new Date().toISOString();
  await db.insert(users).values({
    email: ADMIN_EMAIL,
    name: "Jun Huang",
    passwordHash: await hashPassword(password),
    betaAccess: true,
    role: "admin",
    createdAt: now,
  });
  if (log) {
    console.log(`Admin login created for ${ADMIN_EMAIL}`);
    console.log(`Password: ${password}`);
    console.log("Save this password. It is not stored in the repo.");
  }
}
