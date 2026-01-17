import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import pg from "pg";
const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Check .env.local");
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const insert = await client.query(
  `insert into public.rooms (slug) values ($1) returning *`,
  [`local-smoke-${Date.now()}`]
);

const room = insert.rows[0];

const read = await client.query(`select * from public.rooms where id = $1`, [
  room.id,
]);

console.log({ inserted: room, readBack: read.rows[0] });

await client.end();
