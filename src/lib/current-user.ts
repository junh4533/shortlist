/** Resolve the signed-in user from the session cookie. */
import { redirect } from "next/navigation";
import { getSessionUser } from "./auth/session";

/** Signed-in email, including accounts still waiting for approval. */
export async function getOptionalUserId(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.email ?? null;
}

/** Approved user id. Pending and anonymous requests throw. */
export async function getCurrentUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user?.betaAccess) throw new Error("Missing authenticated user");
  return user.email;
}

/** Pages that need an approved account. */
export async function requireApprovedUser(): Promise<string> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.betaAccess) redirect("/pending");
  return user.email;
}
