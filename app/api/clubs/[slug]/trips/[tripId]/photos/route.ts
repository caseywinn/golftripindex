import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";
import { getClubTripById, addTripPhoto } from "@/lib/clubTrips";
import { isStorageConfigured, uploadObject } from "@/lib/storage";

// Buffer + a large multipart body need the Node runtime, not edge.
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per photo
const MAX_FILES = 20;

/** Upload one or more photos to a trip's recap. Owner/admin only. */
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

    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ error: "Choose at least one photo." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Up to ${MAX_FILES} photos at a time.` }, { status: 400 });
    }

    const created = [];
    for (const file of files) {
      const ext = EXT[file.type];
      if (!ext) {
        return NextResponse.json({ error: `"${file.name}" must be a JPG, PNG, or WebP.` }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: `"${file.name}" is over 10 MB.` }, { status: 400 });
      }
      const path = `${tripId}/${crypto.randomUUID()}.${ext}`;
      const { url } = await uploadObject(path, await file.arrayBuffer(), file.type);
      created.push(await addTripPhoto(tripId, path, url, session.user.id, pool));
    }

    return NextResponse.json({ photos: created }, { status: 201 });
  } catch (err) {
    console.error("[clubs/trips/:id/photos] upload error:", err);
    return NextResponse.json({ error: "Could not upload. Try again." }, { status: 500 });
  }
}
