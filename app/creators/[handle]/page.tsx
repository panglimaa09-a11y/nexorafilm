import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const admin = createAdminClient();

  const { data: channel, error: channelError } = await admin
    .from("creator_channels")
    .select("id,name,handle,description,status")
    .eq("handle", handle)
    .eq("status", "active")
    .maybeSingle();

  if (channelError) {
    console.error("Creator profile query failed:", channelError.message);
    throw new Error("Gagal memuat profil kreator.");
  }
  if (!channel) notFound();

  const { data: rawVideos, error: videoError } = await admin
    .from("creator_videos")
    .select("id,title,description,status,created_at,thumbnail_path,video_type")
    .eq("channel_id", channel.id)
    .eq("status", "published")
    .eq("video_type", "short")
    .order("created_at", { ascending: false });

  if (videoError) {
    console.error("Creator videos query failed:", videoError.message);
    throw new Error("Gagal memuat daftar video kreator.");
  }

  const videos = await Promise.all((rawVideos ?? []).map(async (video) => {
    let thumbnailUrl: string | null = null;
    if (video.thumbnail_path) {
      const { data } = await admin.storage
        .from("creator-videos")
        .createSignedUrl(video.thumbnail_path, 3600);
      thumbnailUrl = data?.signedUrl ?? null;
    }
    return { ...video, thumbnailUrl };
  }));

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/creators" className="inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10">
          ← Jelajahi kreator
        </Link>
        <section className="mt-8 rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-7 sm:p-10">
          <p className="text-sm uppercase tracking-[0.25em] text-violet-300">Creator channel</p>
          <h1 className="mt-3 break-words text-3xl font-bold sm:text-5xl">{channel.name}</h1>
          <p className="mt-2 text-zinc-400">@{channel.handle}</p>
          <p className="mt-5 max-w-3xl whitespace-pre-wrap leading-7 text-zinc-300">{channel.description || "Kreator ini belum menambahkan deskripsi."}</p>
        </section>
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Video kreator</h2>
              <p className="mt-1 text-sm text-zinc-400">{videos.length} video dipublikasikan</p>
            </div>
          </div>
          {videos.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-white/10 p-8 text-zinc-400">Belum ada video yang dipublikasikan kreator ini.</div>
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((video) => (
                <Link key={video.id} href={`/creator-watch/${video.id}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 transition hover:border-violet-400/40">
                  <div className="aspect-video overflow-hidden bg-black">
                    {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt={`Thumbnail ${video.title}`} className="h-full w-full object-cover transition group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-4xl font-black text-violet-400">N</div>}
                  </div>
                  <div className="p-5">
                    <h3 className="break-words text-lg font-semibold">{video.title}</h3>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{video.description || "Tidak ada deskripsi."}</p>
                    <p className="mt-4 text-xs text-zinc-500">{new Date(video.created_at).toLocaleDateString("id-ID")}</p>
                    <span className="mt-4 inline-flex text-sm font-semibold text-violet-300">▶ Tonton video</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
