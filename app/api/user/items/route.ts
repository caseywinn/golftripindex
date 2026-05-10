import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ items: [] });
  }
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT item_type AS "itemType", item_id AS "itemId", status
     FROM user_items
     WHERE user_id = $1`,
    [session.user.id]
  );
  return NextResponse.json({ items: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemType, itemId, status } = await req.json();

  if (!itemType || !itemId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const pool = getPgPool();

  if (status === null || status === undefined) {
    await pool.query(
      `DELETE FROM user_items
       WHERE user_id = $1 AND item_type = $2 AND item_id = $3`,
      [session.user.id, itemType, itemId]
    );
  } else if (status === "wishlist" || status === "played") {
    await pool.query(
      `INSERT INTO user_items (user_id, item_type, item_id, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, item_type, item_id)
       DO UPDATE SET status = EXCLUDED.status, created_at = now()`,
      [session.user.id, itemType, itemId, status]
    );
  } else {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
