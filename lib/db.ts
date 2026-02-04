import pg from "pg";
const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var __gtiPool: pg.Pool | undefined;
}

/**
 * Preferred: returns singleton Pool.
 */
export function getPgPool(): pg.Pool {
  if (global.__gtiPool) return global.__gtiPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it in Vercel Project Settings → Environment Variables (Production)."
    );
  }

  global.__gtiPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return global.__gtiPool;
}

/**
 * Backwards-compat alias for existing route code.
 * (Those routes currently import getPgClient)
 */
export const getPgClient = getPgPool;
