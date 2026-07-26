import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPgPool } from "@/lib/db";
import { getClubBySlug, getClubViewer, canManage } from "@/lib/clubs";
import { getClubTripById } from "@/lib/clubTrips";
import {
  isStorageConfigured,
  createSignedUploadUrl,
  StorageSignError,
  describeSignFailure,
} from "@/lib/storage";
import { UUID_RE, EXT, MAX_BYTES, MAX_FILES, photoPath } from "../limits";

export const runtime = "nodejs";

type Requested = { name?: unknown; type?: unknown; size?: unknown };

/**
 * Step 1 of the photo upload: hand back one signed upload URL per file.
 *
 * Only the file's name, type, and size cross this route — the bytes go straight
 * from the browser to Supabase Storage, because a request body over ~4.5 MB never
 * reaches a Vercel function at all. See lib/storage.ts createSignedUploadUrl.
 *
 * Owner/admin only, same as the record and delete routes.
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

    const body = (await req.json().catch(() => null)) as { files?: unknown } | null;
    const files = Array.isArray(body?.files) ? (body.files as Requested[]) : null;
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Choose at least one photo." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Up to ${MAX_FILES} photos at a time.` }, { status: 400 });
    }

    const uploads = [];
    for (const f of files) {
      const name = typeof f?.name === "string" && f.name ? f.name : "That photo";
      const ext = typeof f?.type === "string" ? EXT[f.type] : undefined;
      if (!ext) {
        return NextResponse.json({ error: `"${name}" must be a JPG, PNG, or WebP.` }, { status: 400 });
      }
      if (typeof f?.size !== "number" || !Number.isFinite(f.size) || f.size <= 0) {
        return NextResponse.json({ error: `"${name}" looks empty.` }, { status: 400 });
      }
      if (f.size > MAX_BYTES) {
        return NextResponse.json({ error: `"${name}" is over 10 MB.` }, { status: 400 });
      }
      const path = photoPath(tripId, ext);
      uploads.push({ path, signedUrl: await createSignedUploadUrl(path) });
    }

    return NextResponse.json({ uploads });
  } catch (err) {
    console.error("[clubs/trips/:id/photos/upload-url] error:", err);
    // A refusal from Supabase is a deployment problem, not a blip — say which,
    // so it can be diagnosed from the page instead of the host's logs.
    if (err instanceof StorageSignError) {
      return NextResponse.json({ error: describeSignFailure(err.code) }, { status: 502 });
    }
    return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500 });
  }
}
