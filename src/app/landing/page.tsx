/** Legacy `/landing` → `/welcome` (logged-in users then continue to `/jobs`). */
import { redirect } from "next/navigation";

export default function LandingRedirectPage() {
  redirect("/welcome");
}
