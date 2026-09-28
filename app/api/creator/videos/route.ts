import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

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
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (channelError || !channel) {
      return NextResponse.json({ error: "Buat channel terlebih dahulu." }, { status: 400 });
    }

    const { data: object } = await db.storage
      .from("creator-videos")
      .list(user.id, { search: storagePath.slice(user.id.length + 1), limit: 100 });

    const filename = storagePath.slice(user.id.length + 1);
    if (!filename || !object?.some((item) => item.name === filename)) {
      return NextResponse.json({ error: "File video belum ditemukan di penyimpanan." }, { status: 400 });
    }

    const { data, error } = await db
      .from("creator_videos")
      .insert({
        channel_id: channel.id,
        owner_id: user.id,
        title,
        description,
        storage_path: storagePath,
        status: "review"
      })
      .select("id,title,description,status,created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "Metadata gagal disimpan. Periksa migrasi dan aturan akses database." }, { status: 400 });
    }

    return NextResponse.json({ video: data }, { status: 201 });
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
