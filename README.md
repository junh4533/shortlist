# jb

Personal multi-ATS job search. Company boards are discovered from public datasets and crawls, jobs are cached in SQLite (or Turso), ranked against each user's preferences, and application status is tracked in a Next.js table.

## Setup

```powershell
npm install
copy .env.example .env.local
npm run fetch-datasets
npm run migrate
npm run import-companies
npm run ingest -- --limit 40
npm run dev
```

Open http://localhost:3000. Preferences are edited at `/settings`. `search.config.yaml` is only the default template for a new user.

Leave `BASIC_AUTH_USERS` empty on your own machine. Set it (`name:longpassword,friend:otherpassword`) before sharing a deployed site.

## Recurring commands

| When | Command |
| --- | --- |
| New postings on known boards | `npm run ingest -- --force` |
| New company slugs from Common Crawl | `npm run harvest -- --source cc --backfill 1` then `npm run ingest` |
| Hacker News / GitHub job lists | `npm run harvest -- --source hn --months 1` and `--source github` |
| Careers-page crawl | `npm run load-seed-domains` then `npm run crawl-careers -- --tier 0` |
| SERP gap-fill | `npm run harvest-serp -- --provider serper --max-queries 50` |

Do not harvest Common Crawl every week. It finds slugs, not job text.

## Deploy (free tiers)

1. Create a Turso database and set `DATABASE_URL=libsql://...` and `DATABASE_AUTH_TOKEN`.
2. `npm run migrate` against Turso, then `TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run copy-to-turso` while `DATABASE_URL` still points at the local file.
3. Import the repo on Vercel Hobby. Set `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `BASIC_AUTH_USERS`, `REVALIDATE_SECRET`.
4. Add the same database secrets plus `APP_URL` and `REVALIDATE_SECRET` to GitHub Actions. `.github/workflows/ingest.yml` runs daily and `harvest.yml` runs weekly.

This repository cannot create the Turso database or the Vercel project for you.

## License and data

The code is MIT-licensed ([LICENSE](LICENSE)). Job postings belong to employers. Dataset licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and on `/about`.
