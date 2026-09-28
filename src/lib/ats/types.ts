/** Shared shapes for ATS adapters: one normalized job, a fetch result, and the adapter contract. */
import type { AtsProvider } from "./providers";

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

export type FetchContext = {
  userAgent: string;
  /** Adapters that need a second request per job only fetch details when this returns true. */
  withDetails: (title: string) => boolean;
  /** True if this board has been live before; some APIs return 200 + empty for unknown slugs. */
  previouslyLive?: boolean;
};

export type AtsAdapter = {
  provider: AtsProvider;
  /** Human-facing board URL. */
  boardUrl(slug: string): string;
  fetchBoard(slug: string, ctx: FetchContext): Promise<FetchResult>;
};
