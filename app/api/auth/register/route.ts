import { NextResponse } from "next/server";
import { getPgPool } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { name, email, password } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const pool = getPgPool();
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
    email.toLowerCase(),
  ]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
    [name, email.toLowerCase(), hash]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
