/** HTTP Basic Auth helpers: parse BASIC_AUTH_USERS and compare passwords in constant time. */
import { timingSafeEqual } from "node:crypto";

export type BasicUser = { name: string; password: string };

export function parseBasicUsers(raw: string | undefined): BasicUser[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const index = pair.indexOf(":");
      if (index < 1) return null;
      return { name: pair.slice(0, index).trim(), password: pair.slice(index + 1) };
    })
    .filter((user): user is BasicUser => Boolean(user?.name && user.password));
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Username when the header matches a configured user, otherwise null. */
export function authenticateBasic(header: string | null, users: BasicUser[]): string | null {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return null;
  }
  const index = decoded.indexOf(":");
  if (index < 1) return null;
  const name = decoded.slice(0, index);
  const password = decoded.slice(index + 1);
  const user = users.find((candidate) => candidate.name === name);
  const expected = user?.password ?? users[0]?.password ?? "x";
  return safeEqual(password, expected) && user ? user.name : null;
}
