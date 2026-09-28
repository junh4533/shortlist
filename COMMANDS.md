# Regular commands

Run these from `C:\Users\junh4\Desktop\jb`. Edit filters anytime in `search.config.yaml` and refresh the UI — no crawl needed for that.

## Weekly (fresh job listings)

```powershell
npm run ingest
```

Re-fetches public Greenhouse / Lever / Ashby boards that are still `unknown` or `error`. Skips boards already marked live or dead.

After the first full pass, most boards are live/dead, so a weekly run only picks up **new slugs** (from a harvest) and retries errors. To refresh jobs on boards you already crawled:

```powershell
npm run ingest -- --force
```

`--force` re-checks every tracked board. That can take hours (last full pass was ~18k boards / ~30 minutes of useful work, longer if you force everything).

Then browse:

```powershell
npm run dev
```

Open http://localhost:3000 — close it when you are done. Nothing needs to stay running.

## When a new Common Crawl index appears (~every 1–2 months)

Check [index.commoncrawl.org](https://index.commoncrawl.org/) for a newer `CC-MAIN-*` than last time (you last used **CC-MAIN-2026-30**, July 2026).

```powershell
npm run harvest-cc
npm run ingest
```

1. `harvest-cc` — queries the **latest** CDX index for career-board URLs, extracts slugs, inserts only companies not already in `data/jobs.db`. Writes `datasets/commoncrawl_new_slugs.json`.
2. `ingest` — fetches jobs for those new `unknown` boards.

Optional:

```powershell
npm run harvest-cc -- --dry-run
npm run harvest-cc -- --provider ashby --max-pages 3
npm run harvest-cc -- --crawl CC-MAIN-2026-25
```

Do **not** harvest every week. It does not update job text; it only finds new company slugs.

## Rare / one-off

| Command | What it does |
| --- | --- |
| `npm run import-companies` | Reloads LastRound CSV + aggregator JSON into `companies`. Safe to re-run; does not delete harvest slugs. |
| `npm run ingest -- --limit 50` | Fetch at most 50 unchecked boards (smoke test). |
| `npm run ingest -- --provider greenhouse` | One ATS only. |
| `npm run ingest -- --verify-only --limit 100` | Mark live/dead, do not store jobs. |
| `npm run harvest-cc -- --provider lever` | Retry Lever if the CDX index 504’d. |
| `npm run dedupe-jobs` | Delete extra rows that share the same apply URL (keeps newest). |

## What you can ignore on a schedule

- `search.config.yaml` edits — take effect on the next page load.
- Application status in the UI — stored in SQLite; ingest does not wipe it.
- Postgres, cron, Docker — not used. Optional later: Windows Task Scheduler for `npm run ingest` if the PC is on.
