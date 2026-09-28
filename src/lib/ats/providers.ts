/** Supported applicant tracking systems (single source of truth for provider ids). */
export const ATS_PROVIDERS = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "recruitee",
  "bamboohr",
] as const;

export type AtsProvider = (typeof ATS_PROVIDERS)[number];

export function isAtsProvider(value: string): value is AtsProvider {
  return (ATS_PROVIDERS as readonly string[]).includes(value);
}
