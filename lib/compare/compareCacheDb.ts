import { getPgClient } from "../db";

export type CachedOutput = {
  teaser: string;
  article_markdown: string;
  facts_sidebar: string[];
};

export async function getCompareCache(cacheKey: string): Promise<CachedOutput | null> {
  const client = getPgClient();
  await client.connect();
  try {
    const { rows } = await client.query(
      `select output, expires_at
       from public.compare_cache
       where cache_key = $1
       limit 1`,
      [cacheKey]
    );

    if (!rows.length) return null;
    const row = rows[0];

    if (!row.expires_at || new Date(row.expires_at) <= new Date()) return null;
    return row.output as CachedOutput;
  } finally {
    await client.end();
  }
}

export async function upsertCompareCache(args: {
  cacheKey: string;
  tripASlug: string;
  tripBSlug: string;
  dataVersion: string; // ISO string
  expiresAt: Date;
  output: CachedOutput;
}) {
  const client = getPgClient();
  await client.connect();
  try {
    await client.query(
      `insert into public.compare_cache
        (cache_key, trip_a_slug, trip_b_slug, data_version, created_at, updated_at, expires_at, output)
       values
        ($1, $2, $3, $4, now(), now(), $5, $6::jsonb)
       on conflict (cache_key) do update set
        trip_a_slug = excluded.trip_a_slug,
        trip_b_slug = excluded.trip_b_slug,
        data_version = excluded.data_version,
        updated_at = now(),
        expires_at = excluded.expires_at,
        output = excluded.output`,
      [
        args.cacheKey,
        args.tripASlug,
        args.tripBSlug,
        args.dataVersion,
        args.expiresAt.toISOString(),
        JSON.stringify(args.output),
      ]
    );
  } finally {
    await client.end();
  }
}
