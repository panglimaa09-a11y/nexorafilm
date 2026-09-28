import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "Login diperlukan untuk mengikuti kreator." }, { status: 401 });

    const body = await request.json();
    const channelId = typeof body.channel_id === "string" ? body.channel_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(channelId)) return NextResponse.json({ error: "Channel tidak valid." }, { status: 400 });

    const admin = createAdminClient();
    const { data: channel } = await admin.from("creator_channels").select("id,user_id,status").eq("id", channelId).eq("status", "active").maybeSingle();
    if (!channel) return NextResponse.json({ error: "Channel tidak ditemukan." }, { status: 404 });
    if (channel.user_id === user.id) return NextResponse.json({ error: "Kamu tidak dapat mengikuti channel sendiri." }, { status: 400 });

    const { error } = await admin.from("creator_follows").upsert(
      { channel_id: channelId, follower_id: user.id },
      { onConflict: "channel_id,follower_id", ignoreDuplicates: true }
    );
    if (error) return NextResponse.json({ error: "Gagal mengikuti kreator. Pastikan migrasi follow sudah dijalankan." }, { status: 500 });

    const { count } = await admin.from("creator_follows").select("*", { count: "exact", head: true }).eq("channel_id", channelId);
    return NextResponse.json({ following: true, followers: count ?? 0 });
  } catch {
    return NextResponse.json({ error: "Permintaan tidak dapat diproses." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
    const body = await request.json();
    const channelId = typeof body.channel_id === "string" ? body.channel_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(channelId)) return NextResponse.json({ error: "Channel tidak valid." }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from("creator_follows").delete().eq("channel_id", channelId).eq("follower_id", user.id);
    if (error) return NextResponse.json({ error: "Gagal berhenti mengikuti kreator." }, { status: 500 });
    const { count } = await admin.from("creator_follows").select("*", { count: "exact", head: true }).eq("channel_id", channelId);
    return NextResponse.json({ following: false, followers: count ?? 0 });
  } catch {
    return NextResponse.json({ error: "Permintaan tidak dapat diproses." }, { status: 400 });
  }
}
