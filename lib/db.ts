import pg from "pg";
const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var __gtiPool: pg.Pool | undefined;
}

/**
 * Returns a singleton Pool in a Node.js runtime.
 * IMPORTANT: Do not throw at module scope (breaks Next/Vercel build).
 */
export function getPgPool(): pg.Pool {
  if (global.__gtiPool) return global.__gtiPool;

  const connectionString = process.env.DATABASE_URL;

  // Only validate when actually used at runtime
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
