import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";
import { deleteTripPhoto } from "@/lib/clubTrips";
import { deleteObject } from "@/lib/storage";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Remove one photo from a trip's recap. Owner/admin only. */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ slug: string; tripId: string; photoId: string }> }
) {
  try {
    const { slug, tripId, photoId } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    if (!UUID_RE.test(tripId) || !UUID_RE.test(photoId)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const pool = getPgPool();
    const club = await getClubBySlug(slug, pool);
    if (!club) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const viewer = await getClubViewer(club.id, session.user.id, pool);
    if (!canManage(viewer)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const removed = await deleteTripPhoto(club.id, tripId, photoId, pool);
    if (!removed) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Row is gone; clear the storage object too (best-effort).
    await deleteObject(removed.path);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[clubs/trips/:id/photos/:photoId] delete error:", err);
    return NextResponse.json({ error: "Could not delete. Try again." }, { status: 500 });
  }
}
