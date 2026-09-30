/** Waiting room for accounts that exist but are not approved yet. */
import { redirect } from "next/navigation";
import { logOut } from "../auth-actions";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pending approval" };

export default async function PendingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.betaAccess) redirect("/jobs");

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Pending approval</h1>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {user.name}, your account ({user.email}) is waiting for approval. You can log in, but Shortlist stays closed
        until an admin turns on access.
      </p>
      <form action={logOut}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
