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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
    const handle = typeof body.handle === "string"
      ? body.handle.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")
      : "";

    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: "Nama channel harus 2–80 karakter." }, { status: 400 });
    }
    if (!/^[a-z0-9_-]{3,30}$/.test(handle)) {
      return NextResponse.json({ error: "Handle harus 3–30 karakter: huruf kecil, angka, _ atau -." }, { status: 400 });
    }

    const { data: existing } = await db
      .from("creator_channels").select("id").eq("user_id", user.id).maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Akun ini sudah memiliki channel." }, { status: 409 });
    }

    const { data, error } = await db
      .from("creator_channels")
      .insert({ user_id: user.id, name, handle, description, status: "pending" })
      .select("id,name,handle,description,status,created_at")
      .single();

    if (error) {
      const duplicate = error.code === "23505";
      return NextResponse.json(
        { error: duplicate ? "Handle sudah digunakan atau channel sudah ada." : "Channel gagal dibuat. Pastikan migrasi database sudah diterapkan." },
        { status: duplicate ? 409 : 400 }
      );
    }

    return NextResponse.json({ channel: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
}
