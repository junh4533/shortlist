/** Resolve the user id for the current request. "local" when Basic Auth is not configured. */
import { headers } from "next/headers";

export async function getCurrentUserId(): Promise<string> {
  if (!process.env.BASIC_AUTH_USERS?.trim()) return "local";
  const userId = (await headers()).get("x-user-id")?.trim();
  if (!userId) throw new Error("Missing authenticated user");
  return userId;
}
