"use client";

/** Email and password login. */
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { logIn } from "../auth-actions";
import { Logo } from "../components/logo";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await logIn({ email, password });
      if (result && !result.ok) setError(result.message);
    });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-6 py-16">
      <Logo href="/welcome" size="sm" />
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          aria-label="Email"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          aria-label="Password"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Checking…" : "Log in"}
        </button>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </form>
      <Link href="/welcome" className="text-sm text-zinc-600 underline underline-offset-2 dark:text-zinc-400">
        Sign up for beta
      </Link>
    </div>
  );
}
