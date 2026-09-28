/** /settings: edit search preferences in the browser instead of search.config.yaml. */
import Link from "next/link";
import { sql } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { getUserPreferences } from "@/lib/preferences-store";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

/** Most common location strings among open jobs, for autocomplete. */
async function locationSuggestions() {
  const rows = await getDb()
    .select({ location: jobs.location })
    .from(jobs)
    .where(sql`${jobs.closedAt} IS NULL AND ${jobs.location} IS NOT NULL`)
    .groupBy(jobs.location)
    .orderBy(sql`count(*) DESC`)
    .limit(300);
  return rows.map((row) => row.location!).filter(Boolean);
}

export default async function SettingsPage() {
  const userId = await getCurrentUserId();
  const [preferences, locations] = await Promise.all([getUserPreferences(userId), locationSuggestions()]);
  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Search settings</h1>
            <p className="mt-1 text-sm text-zinc-600">Changes apply to your job table as soon as you save.</p>
          </div>
          <Link href="/" className="text-sm text-zinc-700 underline underline-offset-2">
            ← Back to jobs
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <SettingsForm initial={preferences} locationSuggestions={locations} />
      </main>
    </div>
  );
}
