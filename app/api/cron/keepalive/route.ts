import { NextResponse } from "next/server";
import { getPgPool } from "../../../../lib/db";

// Daily Vercel cron (see vercel.json). Two jobs:
// 1. Keeps the Supabase free-tier project from auto-pausing after 7 idle days.
// 2. Purges expired compare_cache rows (lookups already ignore them).
// Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pool = getPgPool();
  const { rowCount } = await pool.query(
    `delete from public.compare_cache where expires_at < now()`
  );
  const { rows } = await pool.query(
    `select count(*)::int as n from public.compare_cache`
  );

  return NextResponse.json({
    ok: true,
    expiredDeleted: rowCount ?? 0,
    compareCacheRows: rows[0]?.n ?? 0,
    at: new Date().toISOString(),
  });
}
