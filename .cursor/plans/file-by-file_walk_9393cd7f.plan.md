---
name: File-by-file walk
overview: "A pipeline-order walk through every source file in plain language: what the file is for, which functions to name, and what to skip unless they ask."
todos:
  - id: rehearse-order
    content: "Practice pipeline order: YAML → ingest/ats → schema → matchJob → page; skip harvest unless asked"
    status: pending
  - id: rehearse-fns
    content: For ats/match/ingest, say fetchBoard, mapPool, matchJob ok vs rankScore, title-only store
    status: pending
isProject: false
---

# Explain each file (plain language)

Do this **after the architecture diagram**. Open files in this order so the story stays: rules → download → save → score → table.

**How to talk about a file:** one sentence (“this file does X”), then **one function** if they lean in. Do not read helpers (`sleep`, `includesAny`). Skip [`src/instrumentation.ts`](src/instrumentation.ts) unless asked (hides a Next warning).

---

## 1. Rules (not the database)

**[`search.config.yaml`](search.config.yaml)** — Your search preferences in a text file (titles, pay, skills, location). The website **re-reads this on refresh**. Changing **titles** needs ingest to **store** new role types; pay/skills/location/age do not.

**[`src/lib/config.ts`](src/lib/config.ts)** — Loads that YAML. `loadSearchConfig` also **checks the shape** (Zod) so a typo fails immediately instead of silently matching nothing.

---

## 2. Finding companies (phone book)

**[`src/lib/csv.ts`](src/lib/csv.ts)** — Reads the LastRound spreadsheet and the three slug JSON files. `readAllCompanySources` is “give me every company name we know.” No internet.

**[`datasets/`](datasets/)** — Not code. CSV + JSON are **other people’s lists**. [`commoncrawl_new_slugs.json`](datasets/commoncrawl_new_slugs.json) is **your** last harvest log (often empty).

**Only if they ask — harvest**

- [`scripts/harvest-cc.ts`](scripts/harvest-cc.ts) — Command to look up new slugs.
- [`src/lib/common-crawl.ts`](src/lib/common-crawl.ts) — Talks to Common Crawl’s URL index. `extractSlug` pulls `acorns` out of a URL; `harvestPrefix` pages through results politely.

---

## 3. Download listings (the interesting backend)

**[`scripts/ingest.ts`](scripts/ingest.ts)** — Command you run in the terminal (`npm run ingest`). **Not** the website.

- `importCompanies` — Put slugs into the **companies** table (`unknown` until checked).
- `ingestBoards` — For each board (by default only unknown/error): call the API, mark live/dead, **save jobs whose title matches YAML**.
- `main` — Flags: `--force`, `--limit`, `--import-only`.

**[`src/lib/ats.ts`](src/lib/ats.ts)** — Actual HTTP.

- `boardUrl` — Builds the JSON URL for one company.
- `getJson` — Downloads it; waits and retries if the site says slow down (429).
- `mapGreenhouse` / `mapLever` / `mapAshby` — Translate three formats into one job.
- `fetchBoard` — URL + download + mapper. Dead vs error.
- `mapPool` — Up to **6 boards at a time**.

**[`src/lib/html.ts`](src/lib/html.ts)** — `stripHtml` (Cheerio): Greenhouse HTML → plain words.

---

## 4. Database

**[`src/lib/db/schema.ts`](src/lib/db/schema.ts)** — Names of the three tables in TypeScript: company boards, cached jobs, application status (separate so crawl cannot wipe Applied).

**[`src/lib/db/index.ts`](src/lib/db/index.ts)** — Opens `data/jobs.db`. `openSqlite` / `getDb` create tables if missing. `dedupeJobsByUrl` is the cleanup used by the tiny CLI below.

**[`scripts/dedupe-jobs.ts`](scripts/dedupe-jobs.ts)** — One-off: delete extra rows that are the **same posting under two keys** (URL aliases). Upsert already unique per board+id; this is the leftover twins.

**[`src/lib/url.ts`](src/lib/url.ts)** — `normalizeJobUrl` (clean tracking junk). `jobCollapseKey` (same Greenhouse id → one identity; **not** Greenhouse vs Lever). `listingCollapseKey` (same board + title + location for the UI).

---

## 5. Score and list (when you open the site)

**[`src/lib/match.ts`](src/lib/match.ts)** — YAML applied in TypeScript, **not SQL**.

- `titleMatches` — ingest + UI.
- `locationMatches` / `payMatches` — UI.
- `matchJob` — **`ok`** = show/hide; **`rankScore`** = sort (title 40, skills, pay listed, seniority, recency).

**[`src/lib/jobs-query.ts`](src/lib/jobs-query.ts)** — `listMatchedJobs`: load **all** cached jobs, `matchJob`, collapse twins, sort. Search box / status filter happen here too. `jobCounts` for the header.

**[`src/lib/constants.ts`](src/lib/constants.ts)** — Applied / Interviewing labels and colors.

---

## 6. Website

**[`src/app/layout.tsx`](src/app/layout.tsx)** — Fonts and page title. Every page wraps this.

**[`src/app/page.tsx`](src/app/page.tsx)** — The **only** screen (`/`). Server Component: reads the DB every visit (`force-dynamic`). Table, sort links, search form.

**[`src/app/status-select.tsx`](src/app/status-select.tsx)** — The dropdown (runs in the **browser**). `localStatus` remembers your click until refresh finishes.

**[`src/app/actions.ts`](src/app/actions.ts)** — `updateJobStatus`: save Applied to SQLite; copy onto same-board twins. This is **not** crawling.

---

## 7. What not to walk unless asked

`globals.css`, `next.config.ts` (`better-sqlite3` must stay outside the bundle), `package.json` scripts (`dev`, `ingest`, `harvest-cc`, `dedupe-jobs`).

---

## Rehearsal (10 minutes)

Say the file name, the one-liner, stop. If they say “go deeper,” name **one** function from the list above. Timebox: ingest + `ats.ts` + `schema.ts` + `matchJob` + `page.tsx`. That is the whole product.
