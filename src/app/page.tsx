/** `/`: send logged-in users onward, everyone else to the landing page. */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/welcome");
  if (!user.betaAccess) redirect("/pending");
  redirect("/jobs");
}
