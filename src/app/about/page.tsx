/** /about: where company and job data comes from. */
import Link from "next/link";
import { DATASETS } from "@/lib/sources/manifest";

export const metadata = { title: "Data sources" };

export default function AboutPage() {
  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm">
          <Link href="/" className="underline">
            ← Jobs
          </Link>
        </p>
        <h1 className="mt-4 text-2xl font-semibold">Data sources</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-700">
          This app links to each employer&apos;s original apply page. Descriptions shown here are short excerpts used
          for matching. To request a removal, open an issue on the project repository.
        </p>
        <ul className="mt-6 flex flex-col gap-4 text-sm">
          {DATASETS.filter((entry) => entry.dest || entry.usage === "reference").map((entry) => (
            <li key={entry.id} className="rounded-lg border border-zinc-200 bg-white p-4">
              <a className="font-medium underline" href={entry.homepage}>
                {entry.name}
              </a>
              <p className="mt-1 text-zinc-600">
                {entry.license}
                {entry.verified ? "" : " (not fully verified)"} · {entry.usage}
                {entry.attributionRequired ? " · attribution required" : ""}
              </p>
              {entry.note ? <p className="mt-1 text-zinc-500">{entry.note}</p> : null}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
