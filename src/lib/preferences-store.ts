/** Per-user search preferences in user_profiles; new users start from the search.config.yaml template. */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { loadDefaultPreferences, userPreferencesSchema, type UserPreferences } from "./config";
import { getDb, withBusyRetry } from "./db";
import { userProfiles } from "./db/schema";

/** The user who owned the YAML file before per-user storage; their profile starts onboarded. */
const LOCAL_USER = "local";

export type UserProfile = { preferences: UserPreferences; onboarded: boolean };

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const db = getDb();
  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (row) {
    const parsed = userPreferencesSchema.safeParse(JSON.parse(row.preferences));
    if (parsed.success) return { preferences: parsed.data, onboarded: row.onboarded };
  }
  const preferences = loadDefaultPreferences();
  const onboarded = userId === LOCAL_USER;
  await withBusyRetry(() =>
    db
      .insert(userProfiles)
      .values({
        userId,
        preferences: JSON.stringify(preferences),
        onboarded,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { preferences: JSON.stringify(preferences), updatedAt: new Date().toISOString() },
      }),
  );
  return { preferences, onboarded };
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  return (await getUserProfile(userId)).preferences;
}

export async function saveUserPreferences(
  userId: string,
  preferences: UserPreferences,
  options: { onboarded?: boolean } = {},
) {
  const value = JSON.stringify(userPreferencesSchema.parse(preferences));
  const now = new Date().toISOString();
  await withBusyRetry(() =>
    getDb()
      .insert(userProfiles)
      .values({ userId, preferences: value, onboarded: options.onboarded ?? true, updatedAt: now })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          preferences: value,
          updatedAt: now,
          ...(options.onboarded === undefined ? {} : { onboarded: options.onboarded }),
        },
      }),
  );
}

/** Stable hash of a preferences object, for cache keys. */
export function preferencesHash(preferences: UserPreferences) {
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value as object)
              .sort()
              .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
          )
        : value;
  return createHash("sha1").update(JSON.stringify(stable(preferences))).digest("hex").slice(0, 16);
}
