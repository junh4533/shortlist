/** Fetch Greenhouse / Lever / Ashby JSON APIs and map them into one job shape. */
import type { AtsProvider } from "./config";
import { stripHtml } from "./html";
import { inferRemote, parseSalaryFromText } from "./match";

export type FetchedJob = {
  externalId: string;
  title: string;
  department: string | null;
  location: string | null;
  cleanText: string;
  url: string;
  isRemote: boolean | null;
  workplaceType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryUnknown: boolean;
  postedAt: string | null;
  updatedAt: string | null;
};

type FetchOk = { ok: true; jobs: FetchedJob[] };
type FetchDead = { ok: false; reason: "dead" | "error"; status?: number };
export type FetchResult = FetchOk | FetchDead;

const DEFAULT_TIMEOUT_MS = 20_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Public JSON URL for one company's career board. */
export function boardUrl(provider: AtsProvider, slug: string) {
  if (provider === "greenhouse") {
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  }
  if (provider === "lever") {
    return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  }
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;
}

/** GET JSON with a 20s timeout. 429 retries (Retry-After or 1/2/4/8s). 404 → no body. */
async function getJson(url: string, userAgent: string, attempt = 0): Promise<{
  status: number;
  data: unknown;
} | { status: number; data: null }> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent,
    },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (response.status === 429 && attempt < 4) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter)
      ? retryAfter * 1000
      : 1000 * 2 ** attempt;
    await sleep(waitMs);
    return getJson(url, userAgent, attempt + 1);
  }

  if (response.status === 404) {
    return { status: 404, data: null };
  }

  if (!response.ok) {
    return { status: response.status, data: null };
  }

  return { status: response.status, data: await response.json() };
}

/** Prefer salary from the ATS payload; otherwise scrape $ / k ranges from title+text. */
function withSalary(
  job: Omit<FetchedJob, "salaryMin" | "salaryMax" | "salaryUnknown">,
  structuredMin?: number | null,
  structuredMax?: number | null,
): FetchedJob {
  const fromText = parseSalaryFromText(`${job.title} ${job.cleanText}`);
  const salaryMin = structuredMin ?? fromText.min;
  const salaryMax = structuredMax ?? fromText.max;
  return {
    ...job,
    salaryMin,
    salaryMax,
    salaryUnknown: salaryMin == null && salaryMax == null,
  };
}

/** Greenhouse `{ jobs: [...] }` → FetchedJob[]. Null if the payload is the wrong shape. */
function mapGreenhouse(data: unknown): FetchedJob[] | null {
  if (!data || typeof data !== "object" || !("jobs" in data)) return null;
  const jobs = (data as { jobs: unknown }).jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const job = raw as Record<string, unknown>;
    const title = String(job.title ?? "");
    const content = stripHtml(typeof job.content === "string" ? job.content : "");
    const location =
      job.location && typeof job.location === "object" && "name" in job.location
        ? String((job.location as { name: unknown }).name ?? "")
        : null;
    const departments = Array.isArray(job.departments)
      ? job.departments
          .map((dept) =>
            dept && typeof dept === "object" && "name" in dept
              ? String((dept as { name: unknown }).name)
              : "",
          )
          .filter(Boolean)
          .join(", ")
      : null;
    const mapped = {
      externalId: String(job.id ?? ""),
      title,
      department: departments,
      location,
      cleanText: content,
      url: String(job.absolute_url ?? ""),
      isRemote: inferRemote(location, content),
      workplaceType: inferRemote(location, content) ? "remote" : null,
      postedAt: typeof job.first_published === "string" ? job.first_published : null,
      updatedAt: typeof job.updated_at === "string" ? job.updated_at : null,
    };
    if (!mapped.externalId || !mapped.title || !mapped.url) return [];
    return [withSalary(mapped)];
  });
}

/** Lever JSON array → FetchedJob[]. */
function mapLever(data: unknown): FetchedJob[] | null {
  if (!Array.isArray(data)) return null;
  return data.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const job = raw as Record<string, unknown>;
    const categories =
      job.categories && typeof job.categories === "object"
        ? (job.categories as Record<string, unknown>)
        : {};
    const location = categories.location ? String(categories.location) : null;
    const text =
      typeof job.descriptionPlain === "string"
        ? job.descriptionPlain
        : stripHtml(typeof job.description === "string" ? job.description : "");
    const salaryRange =
      job.salaryRange && typeof job.salaryRange === "object"
        ? (job.salaryRange as { min?: number; max?: number })
        : null;
    const mapped = {
      externalId: String(job.id ?? ""),
      title: String(job.text ?? ""),
      department: categories.team ? String(categories.team) : null,
      location,
      cleanText: text,
      url: String(job.hostedUrl ?? job.applyUrl ?? ""),
      isRemote: inferRemote(location, text),
      workplaceType: inferRemote(location, text) ? "remote" : null,
      postedAt:
        typeof job.createdAt === "number"
          ? new Date(job.createdAt).toISOString()
          : typeof job.createdAt === "string"
            ? job.createdAt
            : null,
      updatedAt:
        typeof job.updatedAt === "number"
          ? new Date(job.updatedAt).toISOString()
          : typeof job.updatedAt === "string"
            ? job.updatedAt
            : null,
    };
    if (!mapped.externalId || !mapped.title || !mapped.url) return [];
    return [withSalary(mapped, salaryRange?.min ?? null, salaryRange?.max ?? null)];
  });
}

function ashbyCompensation(job: Record<string, unknown>) {
  const compensation = job.compensation;
  if (!compensation || typeof compensation !== "object") {
    return { min: null, max: null };
  }
  const components =
    "summaryComponents" in compensation &&
    Array.isArray((compensation as { summaryComponents: unknown }).summaryComponents)
      ? (compensation as { summaryComponents: Record<string, unknown>[] })
          .summaryComponents
      : [];
  const salary = components.find(
    (component) =>
      component.compensationType === "Salary" ||
      component.interval === "1 YEAR",
  );
  const min =
    typeof salary?.minValue === "number"
      ? salary.minValue
      : typeof job.compensationTierSummary === "string"
        ? null
        : null;
  const max = typeof salary?.maxValue === "number" ? salary.maxValue : null;
  return { min, max };
}

/** Ashby `{ jobs: [...] }` → FetchedJob[] (skips unlisted postings). */
function mapAshby(data: unknown): FetchedJob[] | null {
  if (!data || typeof data !== "object" || !("jobs" in data)) return null;
  const jobs = (data as { jobs: unknown }).jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const job = raw as Record<string, unknown>;
    if (job.isListed === false) return [];
    const location =
      (typeof job.location === "string" && job.location) ||
      (typeof job.locationName === "string" && job.locationName) ||
      null;
    const text =
      typeof job.descriptionPlain === "string"
        ? job.descriptionPlain
        : stripHtml(
            typeof job.descriptionHtml === "string"
              ? job.descriptionHtml
              : typeof job.description === "string"
                ? job.description
                : "",
          );
    const workplace =
      typeof job.workplaceType === "string" ? job.workplaceType.toLowerCase() : null;
    const remote = workplace === "remote";
    const pay = ashbyCompensation(job);
    const mapped = {
      externalId: String(job.id ?? ""),
      title: String(job.title ?? ""),
      department: typeof job.department === "string" ? job.department : null,
      location,
      cleanText: text,
      url: String(job.jobUrl ?? job.applyUrl ?? ""),
      isRemote: remote,
      workplaceType: workplace,
      postedAt: typeof job.publishedAt === "string" ? job.publishedAt : null,
      updatedAt: typeof job.publishedAt === "string" ? job.publishedAt : null,
    };
    if (!mapped.externalId || !mapped.title || !mapped.url) return [];
    return [withSalary(mapped, pay.min, pay.max)];
  });
}

/** One HTTP call + mapper. 404/bad JSON → dead; timeout/5xx → error (retry next ingest). */
export async function fetchBoard(
  provider: AtsProvider,
  slug: string,
  userAgent: string,
): Promise<FetchResult> {
  const url = boardUrl(provider, slug);
  try {
    const { status, data } = await getJson(url, userAgent);
    if (status === 404 || data == null) {
      return { ok: false, reason: status === 404 ? "dead" : "error", status };
    }
    const jobs =
      provider === "greenhouse"
        ? mapGreenhouse(data)
        : provider === "lever"
          ? mapLever(data)
          : mapAshby(data);
    if (jobs == null) {
      return { ok: false, reason: "dead", status };
    }
    return { ok: true, jobs };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export { mapPool } from "./concurrency";
