/** Next.js startup hook: raise max listeners to hide a harmless next-dev warning. */
import { EventEmitter } from "node:events";

export function register() {
  // next dev gzip-compresses large RSC payloads and can attach many
  // 'drain' listeners on one Gzip stream. Harmless; this hides the warning.
  EventEmitter.defaultMaxListeners = 25;
}
