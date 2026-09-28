/** /onboarding: first-visit wizard for users without saved preferences. */
import { sql } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { getUserPreferences } from "@/lib/preferences-store";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const userId = await getCurrentUserId();
  const [preferences, rows] = await Promise.all([
    getUserPreferences(userId),
    getDb()
      .select({ location: jobs.location })
      .from(jobs)
      .where(sql`${jobs.closedAt} IS NULL AND ${jobs.location} IS NOT NULL`)
      .groupBy(jobs.location)
      .orderBy(sql`count(*) DESC`)
      .limit(300),
  ]);
  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">Set up your job search</h1>
          <p className="mt-1 text-sm text-zinc-600">Five quick steps. Every step can be skipped and changed later in Settings.</p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <OnboardingForm initial={preferences} locationSuggestions={rows.map((row) => row.location!).filter(Boolean)} />
      </main>
    </div>
  );
}
