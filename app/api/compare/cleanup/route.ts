import { NextResponse } from "next/server";
import { getPgClient } from "../../../../lib/db";

export async function POST(req: Request) {
  // Simple shared-secret protection
  const secret = req.headers.get("x-cleanup-secret");
  if (!process.env.CACHE_CLEANUP_SECRET || secret !== process.env.CACHE_CLEANUP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = getPgClient();
  const { rowCount } = await client.query(
    `delete from public.compare_cache where expires_at < now()`
  );
  return NextResponse.json({ deleted: rowCount ?? 0 });
}
