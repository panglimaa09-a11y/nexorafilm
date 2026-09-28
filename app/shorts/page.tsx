import Link from "next/link";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type ShortVideo = {
  id: string;
  title: string;
  description: string | null;
  view_count: number | null;
  channel_id: string;
  created_at: string;
};

type CreatorChannel = {
  id: string;
  name: string;
  handle: string;
};

export default async function ShortsPage() {
  const db = await createClient();

  const { data, error } = await db
    .from("creator_videos")
    .select("id,title,description,view_count,channel_id,created_at")
    .eq("status", "published")
    .eq("video_type", "short")
    .order("created_at", { ascending: false })
    .limit(30);

  const videos = (data ?? []) as ShortVideo[];

  const channelIds = [...new Set(videos.map((video) => video.channel_id))];

  const { data: channelData } = channelIds.length
    ? await db
        .from("creator_channels")
        .select("id,name,handle")
        .in("id", channelIds)
    : { data: [] as CreatorChannel[] };

  const channels = (channelData ?? []) as CreatorChannel[];
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <Navbar />

      <section className="shorts-hero border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 pb-9 pt-28 sm:px-8 md:pb-12">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.28em] text-red-400">
                NEXORA FILM / CREATOR COMMUNITY
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
                NEXORA <span className="text-red-500">Shorts.</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
                Video pendek dari kreator. Temukan karya baru dan kunjungi
                channel yang membuatnya.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/creators" className="nexora-btn-secondary">
                Temukan Kreator
              </Link>
              <Link href="/creator" className="nexora-btn-primary">
                Creator Studio
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8 md:py-12">
        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-red-950/20 p-6 sm:p-9"
          >
            <h2 className="text-xl font-bold">Shorts belum dapat dimuat</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Periksa koneksi Supabase, migration tabel creator_videos,
              dan kebijakan akses database.
            </p>
          </div>
        ) : videos.length === 0 ? (
          <div className="shorts-empty rounded-3xl border border-white/10 p-8 text-center sm:p-14">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-2xl font-black text-red-400">
              N
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[.24em] text-red-400">
              Creator Community
            </p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">
              Feed Shorts masih kosong
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-zinc-400">
              Belum ada video pendek berstatus published. Buat channel
              melalui Creator Studio, unggah video yang kamu miliki hak
              distribusinya, lalu ikuti proses peninjauan dan publikasi.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/creator" className="nexora-btn-primary">
                Buka Creator Studio
              </Link>
              <Link href="/creators" className="nexora-btn-secondary">
                Jelajahi Kreator
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Feed terbaru</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {videos.length} video dimuat dari katalog Shorts
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-zinc-400">
                Terbaru
              </span>
            </div>

            <div className="shorts-feed">
              {videos.map((video) => {
                const channel = channelMap.get(video.channel_id);

                return (
                  <article
                    key={video.id}
                    className="shorts-feed-card"
                  >
                    <div className="shorts-player">
                      <video
                        className="h-full w-full object-contain"
                        src={`/api/shorts/${encodeURIComponent(video.id)}`}
                        controls
                        playsInline
                        preload="metadata"
                        aria-label={`Video: ${video.title}`}
                      />
                      <span className="shorts-video-label">NEXORA SHORTS</span>
                    </div>

                    <div className="shorts-video-info">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300">
                          Short
                        </span>
                        <span className="text-xs text-zinc-500">
                          {Number(video.view_count ?? 0).toLocaleString("id-ID")} views
                        </span>
                      </div>

                      <h2 className="mt-4 text-xl font-bold leading-snug sm:text-2xl">
                        {video.title}
                      </h2>

                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-400">
                        {video.description || "Video pendek dari komunitas Nexora Film."}
                      </p>

                      {channel ? (
                        <Link
                          href={`/creators/${encodeURIComponent(channel.handle)}`}
                          className="shorts-creator-link mt-6 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.025] p-3 transition hover:border-red-500/30 hover:bg-white/[.05]"
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500/30 to-zinc-800 text-sm font-black">
                            {channel.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-white">
                              {channel.name}
                            </span>
                            <span className="mt-1 block truncate text-xs text-zinc-400">
                              @{channel.handle}
                            </span>
                          </span>
                          <span className="text-sm text-red-300">Profil →</span>
                        </Link>
                      ) : (
                        <p className="mt-5 text-xs text-zinc-500">
                          Informasi channel belum tersedia.
                        </p>
                      )}

                      <p className="mt-4 text-xs text-zinc-600">
                        Dipublikasikan{" "}
                        {new Date(video.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          timeZone: "Asia/Jakarta"
                        })}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <footer className="border-t border-white/10 px-5 py-7 text-center text-xs text-zinc-600">
        NEXORA FILM · Shorts & Creator Community
      </footer>
    </main>
  );
}
