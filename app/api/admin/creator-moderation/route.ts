import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Silakan login terlebih dahulu." }, { status: 401 });
    }

    const { data: profile } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 403 });
    }

    // Use the server-only service client only after validating the signed-in admin.
    const adminDb = createAdminClient();

    const body = await request.json();
    const entity = body?.entity;
    const id = body?.id;
    const status = body?.status;
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";

    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
    }

    if (entity === "channel") {
      if (!["active", "suspended"].includes(status)) {
        return NextResponse.json({ error: "Status channel tidak valid." }, { status: 400 });
      }

      const { error } = await adminDb
        .from("creator_channels")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        console.error("Channel moderation failed:", error.message);
        return NextResponse.json({ error: "Perubahan channel gagal. Periksa kebijakan database." }, { status: 500 });
      }

      return NextResponse.json({ ok: true, message: "Status channel diperbarui." });
    }

    if (entity === "video") {
      if (!["published", "rejected", "review"].includes(status)) {
        return NextResponse.json({ error: "Status video tidak valid." }, { status: 400 });
      }

      if (status === "published") {
        const { data: video, error: lookupError } = await adminDb
          .from("creator_videos")
          .select("id, channel_id, scan_status")
          .eq("id", id)
          .maybeSingle();

        if (lookupError || !video) {
          return NextResponse.json({ error: "Video tidak ditemukan." }, { status: 404 });
        }
        // A deliberate admin publish action is a manual moderation decision.
        // Automated scan failure (for example Gemini HTTP 404) must not make the
        // admin publish button permanently unusable. Keep channel approval required.
        const { data: channel, error: channelError } = await adminDb
          .from("creator_channels")
          .select("status")
          .eq("id", video.channel_id)
          .maybeSingle();

        if (channelError || channel?.status !== "active") {
          return NextResponse.json({ error: "Aktifkan channel terlebih dahulu sebelum menerbitkan video." }, { status: 409 });
        }
      }

      const { error } = await adminDb
        .from("creator_videos")
        .update({
          status,
          moderation_note: note || (status === "published" ? "Disetujui secara manual oleh admin. Hasil safety scan otomatis tidak dijadikan dasar persetujuan." : null),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        console.error("Video moderation failed:", error.message);
        return NextResponse.json({ error: "Perubahan video gagal. Periksa kebijakan database." }, { status: 500 });
      }

      return NextResponse.json({ ok: true, message: "Status video diperbarui." });
    }

    return NextResponse.json({ error: "Jenis objek tidak valid." }, { status: 400 });
  } catch (error) {
    console.error("Creator moderation API error:", error);
    return NextResponse.json({ error: "Permintaan tidak dapat diproses." }, { status: 500 });
  }
}
