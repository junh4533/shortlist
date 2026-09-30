/** Root layout: fonts, metadata, and the HTML shell. */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSessionUser } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/preferences-store";
import { AppChrome } from "./app-chrome";
import { ThemeInit } from "./theme-init";
import { UndoToast } from "./undo-toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shortlist",
  description: "A short list of jobs that fit — from company ATS boards",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  let hasSavedConfig = false;
  if (user?.betaAccess) {
    const profile = await getUserProfile(user.email);
    hasSavedConfig = profile.onboarded;
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <ThemeInit />
        <AppChrome hasSavedConfig={hasSavedConfig} loggedIn={Boolean(user)} />
        <div className="flex-1">{children}</div>
        <UndoToast />
        <footer className="border-t border-zinc-200 px-4 py-3 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <a className="underline" href="/about">
            Data sources
          </a>
          . Job postings belong to their employers.
        </footer>
      </body>
    </html>
  );
}
