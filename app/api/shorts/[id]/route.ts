import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "ID video tidak valid." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Storage belum dikonfigurasi." }, { status: 503 });
  }

  const admin = createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: video, error } = await admin
    .from("creator_videos")
    .select("storage_path,video_type,status,channel_id,scan_status")
    .eq("id", id)
    .eq("status", "published")
    .eq("video_type", "short")
    .maybeSingle();

  if (error || !video?.storage_path) {
    return NextResponse.json({ error: "Video tidak ditemukan." }, { status: 404 });
  }

  const { data: channel } = await admin
    .from("creator_channels")
    .select("id")
    .eq("id", video.channel_id)
    .eq("status", "active")
    .maybeSingle();

  if (!channel) {
    return NextResponse.json({ error: "Kanal tidak tersedia." }, { status: 404 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from("creator-videos")
    .createSignedUrl(video.storage_path, 300);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Video belum dapat diputar." }, { status: 503 });
  }

  // Count playback requests for published, safety-scanned Shorts only.
  await admin.rpc("increment_creator_video_view", { p_video_id: id });

  return NextResponse.redirect(signed.signedUrl, {
    headers: { "Cache-Control": "private, no-store" }
  });
}