import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { scanCreatorVideo } from "@/lib/video-safety-scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 403 });

    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "ID video tidak valid." }, { status: 400 });

    const admin = createAdminClient();
    const { data: video, error } = await admin.from("creator_videos")
      .select("id,title,description,storage_path,status,video_type,channel_id")
      .eq("id", id).maybeSingle();
    if (error || !video) return NextResponse.json({ error: "Video tidak ditemukan." }, { status: 404 });

    const { data: signed } = await admin.storage.from("creator-videos").createSignedUrl(video.storage_path, 600);
    const scan = signed?.signedUrl
      ? await scanCreatorVideo({ videoUrl: signed.signedUrl, videoId: video.id, title: video.title, description: video.description, storagePath: video.storage_path })
      : { decision: "unavailable" as const, provider: "storage", result: { signed_url_failed: true }, note: "File tidak dapat dibaca untuk dipindai." };

    let status = scan.decision === "blocked" ? "rejected" : scan.decision === "safe" ? video.status : "review";
    // On a rescan, auto-publish only a still-reviewing Short that Gemini marked safe,
    // and only when its creator channel is active. Never undo an admin rejection.
    if (
      scan.decision === "safe" &&
      scan.provider === "Google Gemini video moderation" &&
      video.video_type === "short" &&
      video.status === "review"
    ) {
      const { data: channel } = await admin.from("creator_channels")
        .select("status")
        .eq("id", video.channel_id)
        .maybeSingle();
      if (channel?.status === "active") status = "published";
    }
    const { error: updateError } = await admin.from("creator_videos").update({
      scan_status: scan.decision,
      scan_provider: scan.provider,
      scan_result: scan.result,
      scanned_at: scan.decision === "unavailable" ? null : new Date().toISOString(),
      status,
      moderation_note: scan.note,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (updateError) return NextResponse.json({ error: "Hasil scan gagal disimpan." }, { status: 500 });
    return NextResponse.json({ ok: true, scan_status: scan.decision, status, note: scan.note });
  } catch {
    return NextResponse.json({ error: "Pemindaian tidak dapat dijalankan." }, { status: 500 });
  }
}
