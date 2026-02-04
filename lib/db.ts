import pg from "pg";
const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var __gtiPool: pg.Pool | undefined;
}

export function getPgPool(): pg.Pool {
  if (global.__gtiPool) return global.__gtiPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  global.__gtiPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return global.__gtiPool;
}
