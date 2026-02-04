import { getPgPool } from "../db";

type UpsertArgs = {
  cacheKey: string;
  tripASlug: string;
  tripBSlug: string;
  dataVersion: string;
  expiresAt: Date | null; // null = never expires
  output: any;
};

export async function getCompareCache(cacheKey: string) {
  const pool = getPgPool();
  const r = await pool.query(
    `select output
     from public.compare_cache
     where cache_key = $1
       and (expires_at is null or expires_at > now())
     limit 1`,
    [cacheKey]
  );
  return r.rows[0]?.output ?? null;
}

export async function upsertCompareCache(args: UpsertArgs) {
  const pool = getPgPool();
  await pool.query(
    `insert into public.compare_cache
      (cache_key, trip_a_slug, trip_b_slug, data_version, expires_at, output, updated_at)
     values ($1,$2,$3,$4,$5,$6, now())
     on conflict (cache_key)
     do update set
       output = excluded.output,
       expires_at = excluded.expires_at,
       updated_at = now()`,
    [
      args.cacheKey,
      args.tripASlug,
      args.tripBSlug,
      args.dataVersion,
      args.expiresAt,
      args.output,
    ]
  );
}
