/** `/welcome`: marketing landing. Always rendered, never redirects. */
import { LandingPage } from "../components/landing";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shortlist" };

export default async function WelcomePage() {
  const user = await getSessionUser();
  const openJobsHref = !user ? "/login" : user.betaAccess ? "/jobs" : "/pending";
  return <LandingPage openJobsHref={openJobsHref} />;
}
