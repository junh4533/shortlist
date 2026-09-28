/** Resolve the user id for the current request ("local" until auth exists). */
export async function getCurrentUserId(): Promise<string> {
  return "local";
}
