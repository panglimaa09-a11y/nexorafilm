import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

type CreatorChannel = {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  status: string;
};

type CreatorVideo = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
};

export const dynamic = "force-dynamic";

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const db = await createClient();

  const { data: channelData, error: channelError } = await db
    .from("creator_channels")
    .select("id,name,handle,description,status")
    .eq("handle", handle)
    .eq("status", "active")
    .maybeSingle();

  if (channelError) {
    throw new Error("Gagal memuat profil kreator.");
  }

  if (!channelData) notFound();

  const channel = channelData as CreatorChannel;

  const { data: videoData, error: videoError } = await db
    .from("creator_videos")
    .select("id,title,description,status,created_at")
    .eq("channel_id", channel.id)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (videoError) {
    throw new Error("Gagal memuat daftar video kreator.");
  }

  const videos = (videoData ?? []) as CreatorVideo[];

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/creators"
          className="inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10"
        >
          ← Jelajahi kreator
        </Link>

        <section className="mt-8 rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-7 sm:p-10">
          <p className="text-sm uppercase tracking-[0.25em] text-violet-300">
            Creator channel
          </p>
          <h1 className="mt-3 break-words text-3xl font-bold sm:text-5xl">
            {channel.name}
          </h1>
          <p className="mt-2 text-zinc-400">@{channel.handle}</p>
          <p className="mt-5 max-w-3xl whitespace-pre-wrap leading-7 text-zinc-300">
            {channel.description || "Kreator ini belum menambahkan deskripsi."}
          </p>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Video kreator</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {videos.length} video dipublikasikan
              </p>
            </div>
          </div>

          {videos.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-white/10 p-8 text-zinc-400">
              Belum ada video yang dipublikasikan kreator ini.
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((video) => (
                <article
                  key={video.id}
                  className="rounded-2xl border border-white/10 bg-zinc-900 p-5"
                >
                  <h3 className="break-words text-lg font-semibold">
                    {video.title}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                    {video.description || "Tidak ada deskripsi."}
                  </p>
                  <p className="mt-4 text-xs text-zinc-500">
                    {new Date(video.created_at).toLocaleDateString("id-ID")}
                  </p>
                  <p className="mt-3 text-xs text-amber-300">
                    Video tersedia di katalog setelah pemutaran aman diaktifkan.
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}