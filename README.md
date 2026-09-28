# jb

Personal multi-ATS job search: discovers company boards on public applicant tracking systems, caches their postings in SQLite, ranks them against your search preferences, and tracks application status in a Next.js table.

## Getting started

```powershell
npm install
npm run fetch-datasets   # download third-party slug lists into datasets/
npm run ingest           # import companies, fetch boards, store jobs
npm run dev              # http://localhost:3000
```

See [COMMANDS.md](COMMANDS.md) for the recurring workflow.

## License and data

The code in this repository is MIT-licensed (see [LICENSE](LICENSE)).

Job postings belong to the employers that published them; the app links back to each original apply page. Third-party datasets used for company discovery keep their own licenses and are not committed to this repository; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `src/lib/sources/manifest.ts`.
