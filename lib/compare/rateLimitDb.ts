import { getPgPool } from "../db";

export async function rateLimitPerMinute(ip: string, limit: number) {
  const pool = getPgPool();

  // current window = start of current minute
  const now = new Date();
  now.setSeconds(0, 0);

  // Atomic increment using INSERT ... ON CONFLICT ... DO UPDATE
  const { rows } = await pool.query(
    `insert into public.compare_rate_limit (ip, window_start, count, updated_at)
     values ($1, $2, 1, now())
     on conflict (ip, window_start)
     do update
       set count = public.compare_rate_limit.count + 1,
           updated_at = now()
     returning count`,
    [ip, now.toISOString()]
  );

  const count = rows?.[0]?.count ?? 1;

  if (count > limit) {
    // retry after remaining seconds in the current minute
    const retryAfter = 60 - new Date().getSeconds();
    return { allowed: false, retryAfterSeconds: retryAfter, count };
  }

  return { allowed: true, retryAfterSeconds: 0, count };
}
