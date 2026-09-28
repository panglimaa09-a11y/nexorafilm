import Link from "next/link";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase-server";
import CreatorStudioClient from "@/components/CreatorStudioClient";

export const dynamic = "force-dynamic";

export default async function CreatorStudioPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    redirect("/login?next=/creator");
  }

  const [{ data: channel, error: channelError }, { data: videos, error: videosError }] = await Promise.all([
    db.from("creator_channels")
      .select("id,name,handle,description,status")
      .eq("user_id", user.id)
      .maybeSingle(),
    db.from("creator_videos")
      .select("id,title,description,status,created_at,thumbnail_path,scan_status")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
  ]);

  const setupError = channelError || videosError;

  return (
    <main className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-28 sm:px-6">
        <Link href="/profile" className="text-sm text-zinc-400 hover:text-white">← Kembali ke profil</Link>
        <div className="mb-8 mt-5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-400">NEXORA FILM · CREATOR</p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">Creator Studio</h1>
          <p className="mt-3 max-w-2xl text-zinc-400">Kelola channel, unggah Shorts, dan pantau status pemindaian serta peninjauan konten Anda.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/creator/analytics" className="rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500">Analytics & Monetisasi →</Link>
            <Link href="/creator/guide" className="rounded-full border border-white/15 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5">Guide & Peraturan</Link>
          </div>
        </div>
        {setupError ? (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 p-5">
            <h2 className="font-bold text-red-200">Database Creator Studio belum siap</h2>
            <p className="mt-2 text-sm text-zinc-300">Jalankan migrasi Creator Studio di Supabase SQL Editor, lalu muat ulang halaman ini.</p>
          </div>
        ) : (
          <CreatorStudioClient initialChannel={channel ?? null} initialVideos={videos ?? []} />
        )}
      </div>
    </main>
  );
}
