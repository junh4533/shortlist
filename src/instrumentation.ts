/** Next.js startup hook: apply local migrations and raise max listeners to hide a harmless next-dev warning. */
import { EventEmitter } from "node:events";

export async function register() {
  // next dev gzip-compresses large RSC payloads and can attach many
  // 'drain' listeners on one Gzip stream. Harmless; this hides the warning.
  EventEmitter.defaultMaxListeners = 25;

  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { isLocalDatabase, migrate } = await import("./lib/db");
  // Remote databases are migrated by scripts/CI, where the .sql files exist on disk.
  if (isLocalDatabase()) await migrate();
}
