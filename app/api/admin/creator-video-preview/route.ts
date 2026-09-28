import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Authenticate with the user's session before using the service-role client.
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Silakan login sebagai admin terlebih dahulu." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin") {
      return NextResponse.json({ error: "Akses admin diperlukan untuk melihat video privat." }, { status: 403 });
    }

    const body = await request.json();
    const id = body?.id;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "ID video tidak valid." }, { status: 400 });
    }

    const adminDb = createAdminClient();
    const { data: video, error: videoError } = await adminDb
      .from("creator_videos")
      .select("id, storage_path")
      .eq("id", id)
      .maybeSingle();

    if (videoError) {
      console.error("Admin video preview lookup failed:", videoError.message);
      return NextResponse.json({ error: "Data video gagal dimuat. Periksa konfigurasi tabel Supabase." }, { status: 500 });
    }
    if (!video || typeof video.storage_path !== "string" || !video.storage_path.trim()) {
      return NextResponse.json({ error: "Video tidak ditemukan atau file videonya belum tersedia." }, { status: 404 });
    }

    // The creator-videos bucket is private. Return only a short-lived signed URL
    // after verifying the caller's admin role; never expose the service-role key.
    const { data: signed, error: signedError } = await adminDb.storage
      .from("creator-videos")
      .createSignedUrl(video.storage_path, 10 * 60);

    if (signedError || !signed?.signedUrl) {
      console.error("Admin video preview signing failed:", signedError?.message || "No signed URL returned");
      return NextResponse.json(
        { error: "Video belum bisa diputar. Pastikan file ada di bucket privat creator-videos dan storage_path sesuai dengan path objeknya." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: signed.signedUrl, expiresIn: 600 });
  } catch (error) {
    console.error("Admin video preview API error:", error);
    if (error instanceof Error && error.message.includes("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        { error: "Konfigurasi Supabase server belum lengkap. Periksa NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di Environment Variables Vercel." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Pratinjau video gagal dibuat. Periksa Runtime Logs Vercel." }, { status: 500 });
  }
}
