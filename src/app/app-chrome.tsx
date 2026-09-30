"use client";

/** App header (logo + Quickstart/settings/theme). Hidden on the marketing landing. */
import { usePathname } from "next/navigation";
import { Logo } from "./components/logo";
import { HeaderActions } from "./theme-toggle";

export function AppChrome({ hasSavedConfig, loggedIn }: { hasSavedConfig: boolean; loggedIn: boolean }) {
  const pathname = usePathname();
  if (pathname === "/welcome" || pathname === "/landing" || pathname === "/login" || pathname === "/pending") {
    return null;
  }

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <Logo href="/jobs" size="sm" />
      <HeaderActions hasSavedConfig={hasSavedConfig} loggedIn={loggedIn} />
    </div>
  );
}
