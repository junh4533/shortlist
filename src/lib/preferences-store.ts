/** Load a user's search preferences (the YAML default template until per-user storage exists). */
import { loadDefaultPreferences, type UserPreferences } from "./config";

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  void userId;
  return loadDefaultPreferences();
}
