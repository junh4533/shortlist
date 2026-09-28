/** YAML filters: keep/drop a job and compute rankScore. Used at ingest (title) and on page load (full match). */
import type { SearchConfig } from "./config";

export type NormalizedJob = {
	title: string;
	location: string | null;
	cleanText: string;
	isRemote: boolean | null;
	workplaceType: string | null;
	salaryMin: number | null;
	salaryMax: number | null;
	salaryUnknown: boolean;
	postedAt?: string | null;
	updatedAt?: string | null;
};

export type MatchResult = {
	ok: boolean;
	titleMatched: boolean;
	locationMatched: boolean;
	payMatched: boolean;
	skillsMatched: string[];
	rankScore: number;
};

function includesAny(haystack: string, needles: string[]) {
	return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

function includesLocationToken(haystack: string, needle: string) {
	const normalized = needle.toLowerCase().trim();
	if (!normalized) return false;
	if (normalized.length <= 3) {
		const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
	}
	return haystack.includes(normalized);
}

function includesAnyLocation(haystack: string, needles: string[]) {
	return needles.some((needle) => includesLocationToken(haystack, needle));
}

function containsPhrase(haystack: string, phrase: string) {
	const normalized = phrase.toLowerCase().trim();
	if (!normalized) return false;
	const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

export function textExcluded(
	title: string,
	description: string,
	config: SearchConfig,
) {
	const haystack = `${title}\n${description}`;
	return config.exclude_phrases.some((phrase) =>
		containsPhrase(haystack, phrase),
	);
}

function skillPatterns(name: string, aliases: Record<string, string[]>) {
	const key = name.toLowerCase().replace(/[^a-z0-9.+#]/g, "");
	const extra = aliases[key] ?? aliases[name.toLowerCase()] ?? [];
	return [name, ...extra].map((item) => item.toLowerCase());
}

function countSkillHits(
	haystack: string,
	names: string[],
	aliases: Record<string, string[]>,
) {
	const hits: string[] = [];
	for (const name of names) {
		const patterns = skillPatterns(name, aliases);
		if (includesAny(haystack, patterns)) hits.push(name);
	}
	return hits;
}

function seniorityPatterns(name: string, aliases: Record<string, string[]>) {
	const extra = aliases[name] ?? aliases[name.toLowerCase()] ?? [];
	return [name, ...extra];
}

function preferEntries(
	prefer: SearchConfig["seniority"]["prefer"] | undefined,
): { name: string; weight: number }[] {
	if (!prefer) return [];
	if (Array.isArray(prefer)) {
		return prefer.map((name, index) => ({
			name,
			weight: prefer.length - index,
		}));
	}
	return Object.entries(prefer).map(([name, weight]) => ({ name, weight }));
}

function preferNames(
	prefer: SearchConfig["seniority"]["prefer"] | string[] | undefined,
) {
	if (!prefer) return [];
	if (Array.isArray(prefer)) return prefer;
	return preferEntries(prefer).map((entry) => entry.name);
}

function bestPreferWeight(
	hits: string[],
	prefer: SearchConfig["seniority"]["prefer"],
) {
	const weights = new Map(
		preferEntries(prefer).map((entry) => [entry.name, entry.weight]),
	);
	let best = 0;
	for (const hit of hits) {
		best = Math.max(best, weights.get(hit) ?? 0);
	}
	return best;
}

const UNLEVELED_KEYS = new Set(["unleveled", "none", "unspecified"]);

function seniorityHits(
	haystack: string,
	names: string[] | Record<string, number> | undefined,
	aliases: Record<string, string[]>,
) {
	return preferNames(names).filter((name) => {
		if (UNLEVELED_KEYS.has(name)) return false;
		return seniorityPatterns(name, aliases).some((pattern) =>
			containsPhrase(haystack, pattern),
		);
	});
}

function explicitLevelMarkers(config: SearchConfig) {
	const names = [
		...preferNames(config.seniority.prefer).filter(
			(name) => !UNLEVELED_KEYS.has(name),
		),
		...config.seniority.exclude,
	];
	return names.flatMap((name) =>
		seniorityPatterns(name, config.seniority.aliases),
	);
}

function isUnleveledTitle(title: string, config: SearchConfig) {
	return !explicitLevelMarkers(config).some((marker) =>
		containsPhrase(title, marker),
	);
}

function unleveledPreferKey(config: SearchConfig) {
	return preferNames(config.seniority.prefer).find((name) =>
		UNLEVELED_KEYS.has(name),
	);
}

/** Ingest + UI: title must hit include phrases and not hit exclude/seniority-exclude. */
export function titleMatches(title: string, config: SearchConfig) {
	const value = title.toLowerCase();
	if (config.titles.exclude.some((phrase) => containsPhrase(title, phrase))) {
		return false;
	}
	if (
		seniorityHits(title, config.seniority.exclude, config.seniority.aliases)
			.length
	) {
		return false;
	}
	if (config.seniority.require_in_title) {
		const hits = seniorityHits(
			title,
			preferNames(config.seniority.prefer),
			config.seniority.aliases,
		);
		const unleveledOk =
			Boolean(unleveledPreferKey(config)) && isUnleveledTitle(title, config);
		if (hits.length === 0 && !unleveledOk) return false;
	}
	return includesAny(value, config.titles.include);
}

const NON_US_LOCATION_PHRASES = [
	"united kingdom",
	"uk",
	"england",
	"scotland",
	"wales",
	"ireland",
	"london",
	"europe",
	"european",
	"emea",
	"eu",
	"apac",
	"asia",
	"latam",
	"latin america",
	"south america",
	"central america",
	"india",
	"canada",
	"toronto",
	"vancouver",
	"mexico",
	"australia",
	"germany",
	"france",
	"spain",
	"italy",
	"netherlands",
	"sweden",
	"norway",
	"denmark",
	"finland",
	"espoo",
	"portugal",
	"lisbon",
	"poland",
	"brazil",
	"japan",
	"singapore",
	"israel",
	"uae",
	"dubai",
	"switzerland",
	"austria",
	"belgium",
	"czechia",
	"czech republic",
	"bolivia",
	"colombia",
	"costa rica",
	"peru",
	"chile",
	"argentina",
	"ecuador",
	"uruguay",
	"paraguay",
	"venezuela",
	"guatemala",
	"honduras",
	"nicaragua",
	"panama",
	"el salvador",
	"dominican republic",
	"egypt",
	"nigeria",
	"kenya",
	"south africa",
	"ghana",
	"morocco",
	"pakistan",
	"bangladesh",
	"philippines",
	"vietnam",
	"thailand",
	"indonesia",
	"malaysia",
	"taiwan",
	"south korea",
	"korea",
	"china",
	"hong kong",
	"ukraine",
	"romania",
	"hungary",
	"greece",
	"turkey",
	"serbia",
];

const US_LOCATION_PHRASES = [
	"united states",
	"usa",
	"u.s.",
	"u.s.a.",
	"us-only",
	"us only",
	"us-based",
	"us based",
	"america",
	"alabama",
	"alaska",
	"arizona",
	"arkansas",
	"california",
	"colorado",
	"connecticut",
	"delaware",
	"florida",
	"georgia",
	"hawaii",
	"idaho",
	"illinois",
	"indiana",
	"iowa",
	"kansas",
	"kentucky",
	"louisiana",
	"maine",
	"maryland",
	"massachusetts",
	"michigan",
	"minnesota",
	"mississippi",
	"missouri",
	"montana",
	"nebraska",
	"nevada",
	"new hampshire",
	"new jersey",
	"new mexico",
	"new york",
	"north carolina",
	"north dakota",
	"ohio",
	"oklahoma",
	"oregon",
	"pennsylvania",
	"rhode island",
	"south carolina",
	"south dakota",
	"tennessee",
	"texas",
	"utah",
	"vermont",
	"virginia",
	"washington",
	"west virginia",
	"wisconsin",
	"wyoming",
	"district of columbia",
	"nyc",
	"manhattan",
	"brooklyn",
	"queens",
	"bronx",
	"flushing",
	"jersey city",
	"hoboken",
	"newark",
];

function isNonUsLocation(location: string, extraExclude: string[]) {
	return [...NON_US_LOCATION_PHRASES, ...extraExclude].some((phrase) =>
		containsPhrase(location, phrase),
	);
}

function hasUsLocationSignal(location: string, include: string[]) {
	const tokens = [
		...US_LOCATION_PHRASES,
		...include.filter((token) => token.toLowerCase() !== "remote"),
	];
	return (
		tokens.some((phrase) => containsPhrase(location, phrase)) ||
		/\bus\b/.test(location)
	);
}

function isRemoteOnlyLabel(location: string) {
	return /^(remote|anywhere|worldwide|global)([\s,/-]+(remote|anywhere|worldwide|global))?$/i.test(
		location.trim(),
	);
}

function geoIncludes(location: string, include: string[]) {
	return includesAnyLocation(
		location,
		include.filter((token) => token.toLowerCase() !== "remote"),
	);
}

/** Remote vs hybrid vs onsite vs US-only. Hybrid/onsite must match geo include tokens (NYC area). */
export function locationMatches(job: NormalizedJob, config: SearchConfig) {
	const loc = (job.location ?? "").toLowerCase();
	const workplace = (job.workplaceType ?? "").toLowerCase();
	if (includesAnyLocation(loc, config.locations.exclude)) return false;
	if (
		config.locations.us_only &&
		isNonUsLocation(loc, config.locations.exclude)
	) {
		return false;
	}

	const hybrid = workplace === "hybrid" || /\bhybrid\b/.test(loc);
	const onsite =
		workplace === "onsite" || workplace === "on-site" || workplace === "office";
	const remoteOnly =
		workplace === "remote" ||
		(/\bremote\b/.test(loc) && !hybrid && !onsite) ||
		(job.isRemote === true && !hybrid && !onsite);

	// Hybrid / office jobs must match NYC-area tokens. Do not treat Ashby's
	// isRemote flag as a free pass when the office is Espoo, Valencia, etc.
	if (hybrid) {
		return (
			config.locations.hybrid_ok && geoIncludes(loc, config.locations.include)
		);
	}
	if (onsite) {
		return (
			config.locations.onsite_ok && geoIncludes(loc, config.locations.include)
		);
	}
	if (remoteOnly) {
		if (!config.locations.remote_ok) return false;
		if (!config.locations.us_only) return true;
		if (!loc.trim() || isRemoteOnlyLabel(loc)) return true;
		return hasUsLocationSignal(loc, config.locations.include);
	}
	if (!config.locations.onsite_ok) return false;
	return geoIncludes(loc, config.locations.include);
}

/** Drop if listed max is too low or listed min is above YAML max. Unknown salary can still pass. */
export function payMatches(job: NormalizedJob, config: SearchConfig) {
	const listedMin = job.salaryMin ?? job.salaryMax;
	const listedMax = job.salaryMax ?? job.salaryMin;
	if (listedMin == null || listedMax == null) {
		return !config.pay.require_listed_salary;
	}
	if (listedMax <= config.pay.min_usd + config.pay.min_max_buffer_usd)
		return false;
	if (listedMin > config.pay.max_usd) return false;
	return true;
}

/** Up to recency_bonus for a job posted today; decays to 0 at max_age_days. */
export function recencyScore(
	postedAt: string | null | undefined,
	updatedAt: string | null | undefined,
	config: SearchConfig,
) {
	const maxBonus = config.freshness.recency_bonus;
	if (!maxBonus) return 0;
	const raw = postedAt ?? updatedAt;
	if (!raw) return 0;
	const posted = new Date(raw).getTime();
	if (Number.isNaN(posted)) return 0;
	const ageDays = Math.max(0, (Date.now() - posted) / 86_400_000);
	const windowDays =
		config.freshness.max_age_days > 0 ? config.freshness.max_age_days : 30;
	if (ageDays >= windowDays) return 0;
	return Math.round(maxBonus * (1 - ageDays / windowDays));
}

/** `ok` = hard filters (title/location/pay/skills/phrases). `rankScore` = sort weights only. */
export function matchJob(
	job: NormalizedJob,
	config: SearchConfig,
): MatchResult {
	const haystack = `${job.title}\n${job.cleanText}`.toLowerCase();
	const titleMatched = titleMatches(job.title, config);
	const locationMatched = locationMatches(job, config);
	const payMatched = payMatches(job, config);
	const phraseExcluded = textExcluded(job.title, job.cleanText, config);
	const requiredHits = countSkillHits(
		haystack,
		config.skills.required,
		config.skills.aliases,
	);
	const preferredHits = countSkillHits(
		haystack,
		config.skills.preferred,
		config.skills.aliases,
	);
	const bonusHits = countSkillHits(
		haystack,
		config.skills.bonus,
		config.skills.aliases,
	);

	const requiredOk =
		config.skills.required.length === 0 ||
		requiredHits.length === config.skills.required.length;
	const preferredOk = preferredHits.length >= config.skills.min_preferred_hits;
	const ok =
		titleMatched &&
		locationMatched &&
		payMatched &&
		requiredOk &&
		preferredOk &&
		!phraseExcluded;

	const preferredSeniorityInTitle = seniorityHits(
		job.title,
		preferNames(config.seniority.prefer),
		config.seniority.aliases,
	);
	const unleveledKey = unleveledPreferKey(config);
	if (unleveledKey && isUnleveledTitle(job.title, config)) {
		preferredSeniorityInTitle.push(unleveledKey);
	}
	const preferredSeniorityInText = seniorityHits(
		job.cleanText.slice(0, 800),
		preferNames(config.seniority.prefer),
		config.seniority.aliases,
	);
	const seniorityWeight = preferredSeniorityInTitle.length
		? bestPreferWeight(preferredSeniorityInTitle, config.seniority.prefer)
		: bestPreferWeight(preferredSeniorityInText, config.seniority.prefer);
	const seniorityScore = preferredSeniorityInTitle.length
		? seniorityWeight * 10
		: seniorityWeight * 4;

	const trackHitsInTitle = seniorityHits(
		job.title,
		preferNames(config.titles.prefer),
		config.titles.aliases,
	);
	const trackHitsInText = seniorityHits(
		job.cleanText.slice(0, 800),
		preferNames(config.titles.prefer),
		config.titles.aliases,
	);
	const trackWeight = trackHitsInTitle.length
		? bestPreferWeight(trackHitsInTitle, config.titles.prefer)
		: bestPreferWeight(trackHitsInText, config.titles.prefer);
	const trackScore = trackHitsInTitle.length
		? trackWeight * 10
		: trackWeight * 4;

	const rankScore =
		(titleMatched ? 40 : 0) +
		preferredHits.length * 8 +
		bonusHits.length * 3 +
		(job.salaryUnknown ? 0 : 5) +
		seniorityScore +
		trackScore +
		recencyScore(job.postedAt, job.updatedAt, config);

	return {
		ok,
		titleMatched,
		locationMatched,
		payMatched,
		skillsMatched: [...preferredHits, ...bonusHits],
		rankScore,
	};
}

export function inferRemote(location: string | null, text: string) {
	const loc = (location ?? "").toLowerCase();
	if (/\bhybrid\b/.test(loc) || /\bonsite\b|\bon-site\b/.test(loc))
		return false;
	if (/\bremote\b/.test(loc) || /\bwork from home\b/.test(loc)) return true;
	const head = text.slice(0, 400).toLowerCase();
	return /\b(fully remote|remote-first|work from home)\b/.test(head);
}

export function parseSalaryFromText(text: string) {
	const matches = [
		...text.matchAll(
			/\$\s?(\d{2,3}(?:,\d{3})|\d{3})(?:\s*[-–to]+\s*\$?\s?(\d{2,3}(?:,\d{3})|\d{3}))?/gi,
		),
		...text.matchAll(/(\d{2,3})\s*k(?:\s*[-–to]+\s*(\d{2,3})\s*k)?/gi),
	];

	let min: number | null = null;
	let max: number | null = null;
	for (const match of matches) {
		const rawA = match[1].replace(/,/g, "");
		const rawB = match[2]?.replace(/,/g, "");
		let a = Number(rawA);
		let b = rawB ? Number(rawB) : a;
		if (a < 1000) a *= 1000;
		if (b < 1000) b *= 1000;
		if (a < 40000 || a > 500000) continue;
		min = min == null ? a : Math.min(min, a);
		max = max == null ? b : Math.max(max, b);
	}
	return { min, max };
}
