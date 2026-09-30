"use client";

/** Marketing landing: short pitch, feature cards, how it works, beta email gate. */
import Link from "next/link";
import {
	useEffect,
	useId,
	useRef,
	useState,
	useTransition,
	type FormEvent,
} from "react";
import { Building2, FileText, Layers2, ListFilter, type LucideIcon } from "lucide-react";
import { signUp } from "../auth-actions";
import { Logo } from "./logo";

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
	{
		icon: Building2,
		title: "Straight from the employer",
		body: "Pulled from Greenhouse, Lever, Ashby, and more. No staffing spam.",
	},
	{
		icon: ListFilter,
		title: "Ranked by your criteria",
		body: "Recency, title, skills, pay, level, city. Nothing promoted.",
	},
	{
		icon: Layers2,
		title: "One row per opening",
		body: "Duplicates merge. Stale posts drop off.",
	},
	{
		icon: FileText,
		title: "Built from you",
		body: "Answer a few questions or upload a resume. Advanced filters for your next role.",
	},
];

const STEPS: { step: string; title: string; body: string }[] = [
	{
		step: "1",
		title: "Tell us what fits",
		body: "Answer a few questions or upload a resume.",
	},
	{
		step: "2",
		title: "We rank live jobs",
		body: "Fresh openings from company boards, ordered for you.",
	},
	{
		step: "3",
		title: "Track on the row",
		body: "Update your status right on the listing.",
	},
];

const cardClass =
	"flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/80";

export function LandingPage({
	openJobsHref = "/login",
}: {
	openJobsHref?: string;
}) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const titleId = useId();
	const nameRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		nameRef.current?.focus();
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") setOpen(false);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	function openSignup(event: FormEvent) {
		event.preventDefault();
		setError(null);
		setOpen(true);
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		setError(null);
		startTransition(async () => {
			const result = await signUp({ name, email, password });
			if (result && !result.ok) setError(result.message);
		});
	}

	return (
		<div className="relative min-h-full overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(24_24_27/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(24_24_27/0.04)_1px,transparent_1px)] bg-size-[48px_48px] dark:bg-[linear-gradient(to_right,rgb(250_250_250/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(250_250_250/0.04)_1px,transparent_1px)]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute top-[-10%] left-1/2 h-[28rem] w-[40rem] -translate-x-1/2 rounded-full bg-zinc-300/40 blur-3xl dark:bg-zinc-600/20"
			/>

			<header className="relative mx-auto flex max-w-5xl items-center justify-between px-6 py-4 sm:px-10">
				<Logo href={null} size="sm" />
				<Link
					href={openJobsHref}
					className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
				>
					Open jobs
				</Link>
			</header>

			<main className="relative mx-auto flex max-w-5xl flex-col gap-16 px-6 pb-20 pt-8 sm:px-10 sm:pt-12">
				<section className="flex max-w-2xl flex-col gap-5">
					<h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
						A short list of jobs that fit.
					</h1>
					<p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
						Fresh openings from each company&apos;s own ATS, ranked by your
						titles, skills, pay, and city.
					</p>
					<form
						onSubmit={openSignup}
						className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-start"
					>
						<label className="sr-only" htmlFor="beta-email">
							Email
						</label>
						<input
							id="beta-email"
							type="email"
							required
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="you@example.com"
							className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
						/>
						<button
							type="submit"
							className="shrink-0 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
						>
							Sign up for beta
						</button>
					</form>
					<Link
						href="/login"
						className="text-sm text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
					>
						Already have an account? Log in
					</Link>
					{open ? (
						<div
							className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 dark:bg-black/70"
							role="presentation"
							onClick={(event) => {
								if (event.target === event.currentTarget) setOpen(false);
							}}
						>
							<div
								role="dialog"
								aria-modal="true"
								aria-labelledby={titleId}
								className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
							>
								<h2 id={titleId} className="text-lg font-semibold tracking-tight">
									Sign up for beta
								</h2>
								<p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
									Create an account. You can log in right away, and the app opens after approval.
								</p>
								<form onSubmit={submit} className="mt-4 flex flex-col gap-3">
									<input
										ref={nameRef}
										required
										autoComplete="name"
										value={name}
										onChange={(event) => setName(event.target.value)}
										placeholder="Name"
										aria-label="Name"
										className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
									/>
									<input
										type="email"
										required
										autoComplete="email"
										value={email}
										onChange={(event) => setEmail(event.target.value)}
										placeholder="Email"
										aria-label="Email"
										className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
									/>
									<input
										type="password"
										required
										minLength={8}
										autoComplete="new-password"
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										placeholder="Password (8+ characters)"
										aria-label="Password"
										className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
									/>
									{error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
									<div className="mt-1 flex flex-wrap justify-end gap-2">
										<button
											type="button"
											onClick={() => setOpen(false)}
											className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
										>
											Cancel
										</button>
										<button
											type="submit"
											disabled={pending}
											className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
										>
											{pending ? "Creating account…" : "Create account"}
										</button>
									</div>
								</form>
							</div>
						</div>
					) : null}
				</section>

				<section className="grid gap-6 sm:grid-cols-2">
					<div className="flex flex-col gap-2">
						<h2 className="text-lg font-semibold tracking-tight">
							The problem
						</h2>
						<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
							Job hunting is scattered and noisy. Listings are spread across
							platforms, and you track applications in a spreadsheet. Many posts
							are stale, duplicated, or ghost listings.
						</p>
					</div>
					<div className="flex flex-col gap-2">
						<h2 className="text-lg font-semibold tracking-tight">
							The solution
						</h2>
						<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
							One aggregator that pulls fresh listings straight from each
							company&apos;s ATS, like Ashby or Greenhouse. Companies manage
							these posts where they hire, so they&apos;re worth your time.
						</p>
						<p className="text-sm leading-6 text-zinc-800 dark:text-zinc-200">
							Shortlist skips the middlemen. Company, then you.
						</p>
					</div>
				</section>

				<section className="flex flex-col gap-5">
					<h2 className="text-lg font-semibold tracking-tight">What you get</h2>
					<ul className="grid gap-3 sm:grid-cols-2">
						{FEATURES.map(({ icon: Icon, title, body }) => (
							<li key={title} className={cardClass}>
								<span className="inline-flex size-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
									<Icon className="size-4" aria-hidden="true" />
								</span>
								<div className="flex flex-col gap-1">
									<h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
										{title}
									</h3>
									<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
										{body}
									</p>
								</div>
							</li>
						))}
					</ul>
				</section>

				<section className="flex max-w-2xl flex-col gap-5">
					<h2 className="text-lg font-semibold tracking-tight">How it works</h2>
					<ol className="flex flex-col gap-4">
						{STEPS.map(({ step, title, body }) => (
							<li key={step} className="flex gap-4">
								<span
									aria-hidden="true"
									className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
								>
									{step}
								</span>
								<div className="flex min-w-0 flex-col gap-0.5">
									<h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
										{title}
									</h3>
									<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
										{body}
									</p>
								</div>
							</li>
						))}
					</ol>
				</section>
			</main>
		</div>
	);
}
