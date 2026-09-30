/** /onboarding: animated questionnaire, resume import, or config file → review. */
import { sql } from "drizzle-orm";
import { blankPreferences } from "@/lib/config";
import { requireApprovedUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireApprovedUser();
  const rows = await getDb()
    .select({ location: jobs.location })
    .from(jobs)
    .where(sql`${jobs.closedAt} IS NULL AND ${jobs.location} IS NOT NULL`)
    .groupBy(jobs.location)
    .orderBy(sql`count(*) DESC`)
    .limit(300);

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <OnboardingForm
        initial={blankPreferences()}
        locationSuggestions={rows.map((row) => row.location!).filter(Boolean)}
      />
    </div>
  );
}
