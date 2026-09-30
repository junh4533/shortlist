/** Load KEY=value lines from .env.dev when not on Vercel; never overrides existing env. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadEnvDev(cwd = process.cwd()) {
  if (process.env.VERCEL) return;
  const filePath = path.join(cwd, ".env.dev");
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
