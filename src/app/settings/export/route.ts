/** GET /settings/export: download the current user's preferences as YAML. */
import { stringify } from "yaml";
import { getCurrentUserId } from "@/lib/current-user";
import { getUserPreferences } from "@/lib/preferences-store";

export async function GET() {
  const preferences = await getUserPreferences(await getCurrentUserId());
  return new Response(stringify(preferences), {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="search.preferences.yaml"',
    },
  });
}
