import pg from "pg";
const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var __gtiPool: pg.Pool | undefined;
}

/**
 * Preferred: returns singleton Pool.
 */
function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it in Vercel Project Settings → Environment Variables (Production)."
    );
  }
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function getPgPool(): pg.Pool {
  const p = global.__gtiPool as any;
  if (p && !p.ending && !p.ended) return global.__gtiPool!;
  global.__gtiPool = createPool();
  return global.__gtiPool;
}

/**
 * Backwards-compat alias for existing route code.
 * (Those routes currently import getPgClient)
 */
export const getPgClient = getPgPool;
