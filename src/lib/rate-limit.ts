/** Per-user write limits stored in SQLite. Throws when the window is full. */
import { sql } from "drizzle-orm";
import { getDb } from "./db";

export class RateLimitError extends Error {
  constructor(message = "Too many updates. Wait a minute and try again.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function rateLimit(userId: string, bucket: string, limit: number, windowMs: number) {
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const db = getDb();
  const [row] = await db.all<{ count: number; window_start: number }>(sql`
    SELECT count, window_start FROM rate_limits WHERE user_id = ${userId} AND bucket = ${bucket}`);
  const count = row && Number(row.window_start) === windowStart ? Number(row.count) + 1 : 1;
  if (count > limit) throw new RateLimitError();
  await db.run(sql`
    INSERT INTO rate_limits (user_id, bucket, window_start, count) VALUES (${userId}, ${bucket}, ${windowStart}, ${count})
    ON CONFLICT (user_id, bucket) DO UPDATE SET window_start = ${windowStart}, count = ${count}`);
}
