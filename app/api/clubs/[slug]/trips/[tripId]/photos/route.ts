import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";
import { getClubTripById, addTripPhoto } from "@/lib/clubTrips";
import { isStorageConfigured, objectExists, publicUrl } from "@/lib/storage";
import { UUID_RE, MAX_FILES, isOwnPhotoPath } from "./limits";

export const runtime = "nodejs";

/**
 * Step 2 of the photo upload: record objects the browser has already uploaded.
 *
 * This route used to take the files themselves as multipart. It doesn't anymore —
 * Vercel rejects a body over ~4.5 MB before the function runs, which killed any
 * batch of two or three phone photos while working locally. The bytes now go
 * straight to Supabase via a signed URL (see ../photos/upload-url) and only the
 * resulting paths land here.
 *
 * Because the client supplies the paths, each one is checked twice: it must look
 * like a path we minted for this trip, and the object must actually be in the
 * bucket. Owner/admin only.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string; tripId: string }> }) {
  try {
    const { slug, tripId } = await ctx.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    if (!UUID_RE.test(tripId)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const pool = getPgPool();
    const club = await getClubBySlug(slug, pool);
    if (!club) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const viewer = await getClubViewer(club.id, session.user.id, pool);
    if (!canManage(viewer)) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const trip = await getClubTripById(club.id, tripId, pool);
    if (!trip) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (!isStorageConfigured()) {
      return NextResponse.json(
        { error: "Photo uploads aren't set up yet. Add the Supabase Storage bucket and keys." },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => null)) as { paths?: unknown } | null;
    const paths = Array.isArray(body?.paths) ? body.paths : null;
    if (!paths || paths.length === 0) {
      return NextResponse.json({ error: "Choose at least one photo." }, { status: 400 });
    }
    if (paths.length > MAX_FILES) {
      return NextResponse.json({ error: `Up to ${MAX_FILES} photos at a time.` }, { status: 400 });
    }
    if (!paths.every((p) => isOwnPhotoPath(p, tripId))) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const created = [];
    for (const path of paths as string[]) {
      if (!(await objectExists(path))) {
        return NextResponse.json(
          { error: "That upload didn't finish. Try again." },
          { status: 409 }
        );
      }
      created.push(await addTripPhoto(tripId, path, publicUrl(path), session.user.id, pool));
    }

    return NextResponse.json({ photos: created }, { status: 201 });
  } catch (err) {
    console.error("[clubs/trips/:id/photos] record error:", err);
    return NextResponse.json({ error: "Could not save the photos. Try again." }, { status: 500 });
  }
}
