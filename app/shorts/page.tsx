import Link from "next/link";
import Navbar from "@/components/Navbar";
import ShortsScrollFeed, { type ShortsFeedItem } from "@/components/ShortsScrollFeed";
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
    .eq("scan_status", "safe")
    .order("created_at", { ascending: false })
    .limit(50);

  const videos = (data ?? []) as ShortVideo[];
  const channelIds = [...new Set(videos.map((video) => video.channel_id))];
  const { data: channelData } = channelIds.length
    ? await db.from("creator_channels").select("id,name,handle").in("id", channelIds)
    : { data: [] as CreatorChannel[] };

  const channels = (channelData ?? []) as CreatorChannel[];
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const feedItems: ShortsFeedItem[] = videos.map((video) => ({
    ...video,
    channel: channelMap.get(video.channel_id) ?? null,
  }));

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <Navbar />
      <header className="border-b border-white/10 bg-[#080808] px-4 pb-5 pt-24 sm:px-8 sm:pb-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.28em] text-red-400">NEXORA FILM / CREATOR COMMUNITY</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">NEXORA <span className="text-red-500">Shorts.</span></h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Video pendek dalam feed vertikal. Scroll atau swipe untuk lanjut ke video berikutnya.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/creators" className="nexora-btn-secondary">Temukan Kreator</Link>
            <Link href="/creator" className="nexora-btn-primary">Unggah Short</Link>
          </div>
        </div>
      </header>

      <section className="py-4 sm:py-6">
        {error ? (
          <div role="alert" className="mx-auto max-w-3xl rounded-2xl border border-red-500/30 bg-red-950/20 p-6">
            <h2 className="text-xl font-bold">Shorts belum dapat dimuat</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Periksa koneksi Supabase, migrasi creator_videos, dan kebijakan akses database.</p>
          </div>
        ) : feedItems.length === 0 ? (
          <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 p-8 text-center sm:p-14">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-2xl font-black text-red-400">N</div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[.24em] text-red-400">Creator Community</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Feed Shorts masih kosong</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-zinc-400">Video yang diunggah sebagai Short akan muncul di sini otomatis setelah pemindaian keamanan selesai dan admin menyetujuinya untuk dipublikasikan.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/creator" className="nexora-btn-primary">Buka Creator Studio</Link>
              <Link href="/creators" className="nexora-btn-secondary">Jelajahi Kreator</Link>
            </div>
          </div>
        ) : (
          <ShortsScrollFeed videos={feedItems} />
        )}
      </section>
      <footer className="border-t border-white/10 px-5 py-5 text-center text-xs text-zinc-600">NEXORA FILM · Shorts & Creator Community</footer>
    </main>
  );
}
