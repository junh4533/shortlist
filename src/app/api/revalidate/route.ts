/** POST /api/revalidate: drop the shared job cache after a scheduled ingest. */
import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";

function matches(header: string | null) {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  if (!header || !secret || header.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(secret));
}

export async function POST(request: Request) {
  if (!matches(request.headers.get("x-revalidate-secret"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  revalidateTag("jobs", "max");
  return Response.json({ ok: true });
}
