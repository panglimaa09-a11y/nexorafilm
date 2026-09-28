import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
  }

  let body: { videoId?: string; watchedSeconds?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request tidak valid." }, { status: 400 });
  }

  if (
    typeof body.videoId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.videoId) ||
    !Number.isInteger(body.watchedSeconds) ||
    (body.watchedSeconds as number) < 1 ||
    (body.watchedSeconds as number) > 1800
  ) {
    return NextResponse.json({ error: "Data tontonan tidak valid." }, { status: 400 });
  }

  const { data, error } = await db.rpc("record_creator_watch", {
    p_video_id: body.videoId,
    p_watched_seconds: body.watchedSeconds
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result: data });
}