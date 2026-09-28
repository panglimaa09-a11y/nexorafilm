import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { scanCreatorVideo } from "@/lib/video-safety-scan";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Silakan login terlebih dahulu." }, { status: 401 });
    }

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 5000) : "";
    const storagePath = typeof body.storage_path === "string" ? body.storage_path : "";
    const thumbnailPath = typeof body.thumbnail_path === "string" && body.thumbnail_path.trim() ? body.thumbnail_path.trim() : null;

    if (title.length < 2 || title.length > 150) {
      return NextResponse.json({ error: "Judul harus 2–150 karakter." }, { status: 400 });
    }

    // Never trust a path belonging to another user.
    if (
      !storagePath.startsWith(`${user.id}/`) ||
      storagePath.includes("..") ||
      storagePath.startsWith("/")
    ) {
      return NextResponse.json({ error: "Lokasi video tidak valid." }, { status: 400 });
    }

    const { data: channel, error: channelError } = await db
      .from("creator_channels")
      .select("id,status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (channelError || !channel) {
      return NextResponse.json({ error: "Buat channel terlebih dahulu." }, { status: 400 });
    }
    if (channel.status !== "active") {
      return NextResponse.json({ error: "Channel harus disetujui admin sebelum mengunggah video." }, { status: 403 });
    }

    const { data: object } = await db.storage
      .from("creator-videos")
      .list(user.id, { search: storagePath.slice(user.id.length + 1), limit: 100 });

    const filename = storagePath.slice(user.id.length + 1);
    if (!filename || !object?.some((item) => item.name === filename)) {
      return NextResponse.json({ error: "File video belum ditemukan di penyimpanan." }, { status: 400 });
    }

    if (thumbnailPath) {
      if (!thumbnailPath.startsWith(`${user.id}/thumbnails/`) || thumbnailPath.includes("..") || thumbnailPath.startsWith("/")) {
        return NextResponse.json({ error: "Lokasi thumbnail tidak valid." }, { status: 400 });
      }
      const thumbName = thumbnailPath.slice(`${user.id}/thumbnails/`.length);
      const { data: thumbs } = await db.storage.from("creator-videos").list(`${user.id}/thumbnails`, { search: thumbName, limit: 100 });
      if (!thumbName || !thumbs?.some((item) => item.name === thumbName)) {
        return NextResponse.json({ error: "Thumbnail belum ditemukan di penyimpanan." }, { status: 400 });
      }
    }

    const { data, error } = await db
      .from("creator_videos")
      .insert({
        channel_id: channel.id,
        owner_id: user.id,
        title,
        description,
        storage_path: storagePath,
        thumbnail_path: thumbnailPath,
        video_type: "short",
        status: "review",
        scan_status: "pending"
      })
      .select("id,title,description,status,created_at,thumbnail_path")
      .single();

    if (error) {
      return NextResponse.json({ error: "Metadata gagal disimpan. Periksa migrasi dan aturan akses database." }, { status: 400 });
    }

    // Fail closed: a missing/unavailable scanner never permits publication.
    const adminDb = createAdminClient();
    const { data: signed } = await adminDb.storage.from("creator-videos").createSignedUrl(storagePath, 600);
    const scan = signed?.signedUrl
      ? await scanCreatorVideo({ videoUrl: signed.signedUrl, videoId: data.id, title, description, storagePath })
      : { decision: "unavailable" as const, provider: "storage", result: { signed_url_failed: true }, note: "Video ditahan karena file tidak dapat diperiksa." };
    // Atria/Gemini-approved Shorts publish automatically. Anything uncertain or unavailable stays in review.
    // Other moderation providers keep the existing manual-review flow.
    const isAiSafe = scan.decision === "safe" && ["Atria-Dawn-Preview", "Google Gemini video moderation"].includes(scan.provider);
    const nextStatus = scan.decision === "blocked"
      ? "rejected"
      : isAiSafe
        ? "published"
        : "review";
    const { data: updated } = await adminDb.from("creator_videos").update({
      scan_status: scan.decision,
      scan_provider: scan.provider,
      scan_result: scan.result,
      scanned_at: scan.decision === "unavailable" ? null : new Date().toISOString(),
      status: nextStatus,
      moderation_note: scan.note,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id).select("id,title,description,status,created_at,thumbnail_path,scan_status").single();

    const video = updated ?? { ...data, scan_status: scan.decision };
    return NextResponse.json({ video, scan: { status: scan.decision, note: scan.note } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
}


export async function PATCH(req: Request) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "Silakan login terlebih dahulu." }, { status: 401 });

    const body = await req.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 5000) : "";
    const thumbnailPath = typeof body.thumbnail_path === "string" && body.thumbnail_path.trim() ? body.thumbnail_path.trim() : null;

    if (!id) return NextResponse.json({ error: "ID video wajib diisi." }, { status: 400 });
    if (title.length < 2 || title.length > 150) return NextResponse.json({ error: "Judul harus 2–150 karakter." }, { status: 400 });

    const { data: existing, error: findError } = await db.from("creator_videos")
      .select("id,status,thumbnail_path").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (findError || !existing) return NextResponse.json({ error: "Video tidak ditemukan atau bukan milik Anda." }, { status: 404 });

    if (thumbnailPath) {
      if (!thumbnailPath.startsWith(`${user.id}/thumbnails/`) || thumbnailPath.includes("..") || thumbnailPath.startsWith("/")) {
        return NextResponse.json({ error: "Lokasi thumbnail tidak valid." }, { status: 400 });
      }
      const filename = thumbnailPath.slice(`${user.id}/thumbnails/`.length);
      const { data: objects } = await db.storage.from("creator-videos").list(`${user.id}/thumbnails`, { search: filename, limit: 100 });
      if (!filename || !objects?.some(item => item.name === filename)) return NextResponse.json({ error: "Thumbnail tidak ditemukan." }, { status: 400 });
    }

    const update: Record<string, unknown> = { title, description };
    if (thumbnailPath) update.thumbnail_path = thumbnailPath;
    const { data, error } = await db.from("creator_videos").update(update)
      .eq("id", id).eq("owner_id", user.id)
      .select("id,title,description,status,created_at,thumbnail_path").single();
    if (error || !data) return NextResponse.json({ error: "Perubahan gagal disimpan." }, { status: 400 });
    return NextResponse.json({ video: data });
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "Silakan login." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID video wajib diisi." }, { status: 400 });

    const { data: video, error: findError } = await db
      .from("creator_videos")
      .select("id,storage_path,status")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (findError || !video) {
      return NextResponse.json({ error: "Video tidak ditemukan atau bukan milik Anda." }, { status: 404 });
    }
    if (video.status === "published") {
      return NextResponse.json({ error: "Video terbit harus diturunkan oleh admin sebelum dihapus." }, { status: 403 });
    }

    const { error: deleteError } = await db
      .from("creator_videos")
      .delete()
      .eq("id", id)
      .eq("owner_id", user.id);

    if (deleteError) {
      return NextResponse.json({ error: "Video gagal dihapus." }, { status: 400 });
    }

    await db.storage.from("creator-videos").remove([video.storage_path]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
}
