/** Adapter registry: one entry per supported ATS, plus a provider-agnostic fetchBoard. */
import { ashby } from "./ashby";
import { bamboohr } from "./bamboohr";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import type { AtsProvider } from "./providers";
import { recruitee } from "./recruitee";
import { smartrecruiters } from "./smartrecruiters";
import type { AtsAdapter, FetchContext, FetchResult } from "./types";
import { workable } from "./workable";

export const ADAPTERS: Record<AtsProvider, AtsAdapter> = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  workable,
  recruitee,
  bamboohr,
};

/** Fetch and map one board. Unexpected exceptions become "error" so the board is retried next run. */
export async function fetchBoard(
  provider: AtsProvider,
  slug: string,
  ctx: FetchContext,
): Promise<FetchResult> {
  try {
    return await ADAPTERS[provider].fetchBoard(slug, ctx);
  } catch {
    return { ok: false, reason: "error" };
  }
}

export function boardUrl(provider: AtsProvider, slug: string) {
  return ADAPTERS[provider].boardUrl(slug);
}

export { ATS_PROVIDERS, isAtsProvider, type AtsProvider } from "./providers";
export type { AtsAdapter, FetchContext, FetchedJob, FetchResult } from "./types";
