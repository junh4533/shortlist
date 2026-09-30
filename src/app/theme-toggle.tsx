"use client";

/** Theme toggle, Quickstart questionnaire entry, and settings. Theme is stored in localStorage on <html>. */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Moon, Settings, Sun } from "lucide-react";
import { logOut } from "./auth-actions";

type Theme = "light" | "dark";

const iconButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

const textButton =
  "inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

const iconClass = "size-4 shrink-0 stroke-current text-current";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function HeaderActions({
  hasSavedConfig = false,
  loggedIn = false,
}: {
  hasSavedConfig?: boolean;
  loggedIn?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const onSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  const onOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const [dark, setDark] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    if (!confirmOpen) return;
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirmOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  function toggleTheme() {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("theme", next);
    setDark(next === "dark");
  }

  function startQuickstart() {
    if (hasSavedConfig && !onOnboarding) {
      setConfirmOpen(true);
      return;
    }
    router.push("/onboarding");
  }

  function confirmQuickstart() {
    setConfirmOpen(false);
    router.push("/onboarding");
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={startQuickstart}
        aria-current={onOnboarding ? "page" : undefined}
        className={`${textButton} ${onOnboarding ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : ""}`}
      >
        Quickstart
      </button>
      <Link
        href="/settings"
        aria-label="Settings"
        aria-current={onSettings ? "page" : undefined}
        className={`${iconButton} ${onSettings ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : ""}`}
      >
        <Settings className={iconClass} aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        className={iconButton}
      >
        <Sun className={`hidden dark:block ${iconClass}`} aria-hidden="true" />
        <Moon className={`dark:hidden ${iconClass}`} aria-hidden="true" />
      </button>
      {loggedIn ? (
        <form action={logOut}>
          <button type="submit" className={textButton}>
            Log out
          </button>
        </form>
      ) : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 dark:bg-black/70"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setConfirmOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              Replace your search settings?
            </h2>
            <p id={descId} className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Quickstart will walk you through the questionnaire again and regenerate your search
              preferences. Your current settings will be replaced when you finish.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmQuickstart}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
