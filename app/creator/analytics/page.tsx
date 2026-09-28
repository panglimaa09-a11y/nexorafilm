import Link from "next/link";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const FOLLOWER_TARGET = 1000;
const VIEW_TARGET = 10000;
const idr = (value: number) => new Intl.NumberFormat("id-ID").format(value);

export default async function CreatorAnalyticsPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/creator/analytics");

  const admin = createAdminClient();
  const { data: channel, error: channelError } = await admin
    .from("creator_channels")
    .select("id,name,handle,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (channelError) {
    return <main className="min-h-screen bg-zinc-950 px-5 py-28 text-white"><Navbar /><h1 className="text-3xl font-black">Analytics Kreator</h1><p className="mt-4 text-amber-300">Database belum siap. Jalankan migrasi creator-follow-analytics-safety.sql di Supabase.</p></main>;
  }

  if (!channel) redirect("/creator");

  const [
    { data: videos, error: videosError },
    { count: followers },
    { count: following },
  ] = await Promise.all([
    admin.from("creator_videos").select("id,title,status,view_count,scan_status,created_at").eq("owner_id", user.id).eq("video_type", "short").order("created_at", { ascending: false }).limit(200),
    admin.from("creator_follows").select("*", { count: "exact", head: true }).eq("channel_id", channel.id),
    admin.from("creator_follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
  ]);

  const allVideos = videos ?? [];
  const published = allVideos.filter((video) => video.status === "published");
  const totalViews = published.reduce((sum, video) => sum + Number(video.view_count ?? 0), 0);
  const pending = allVideos.filter((video) => video.status === "review" || video.scan_status !== "safe").length;
  const followerCount = followers ?? 0;
  const eligible = followerCount >= FOLLOWER_TARGET && totalViews >= VIEW_TARGET && channel.status === "active";

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <Navbar />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-28 sm:px-8">
        <Link href="/creator" className="text-sm text-zinc-400 hover:text-white">← Creator Studio</Link>
        <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.25em] text-red-400">Creator insights</p><h1 className="mt-3 text-4xl font-black sm:text-5xl">Analytics Kreator</h1><p className="mt-3 text-zinc-400">Statistik channel @{channel.handle} dan perkembangan menuju kelayakan monetisasi.</p></div>
          <Link href="/creator/guide" className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Guide & Peraturan →</Link>
        </header>

        {videosError && <div role="alert" className="mt-6 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">Statistik video belum bisa dimuat: {videosError.message}</div>}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-sm text-zinc-400">Pengikut</p><p className="mt-3 text-3xl font-black">{idr(followerCount)}</p><p className="mt-2 text-xs text-zinc-500">Akun yang mengikuti channel</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-sm text-zinc-400">Total views</p><p className="mt-3 text-3xl font-black">{idr(totalViews)}</p><p className="mt-2 text-xs text-zinc-500">Permintaan pemutaran yang tercatat pada Shorts terbit</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-sm text-zinc-400">Shorts terbit</p><p className="mt-3 text-3xl font-black">{idr(published.length)}</p><p className="mt-2 text-xs text-zinc-500">Konten yang sudah publik</p></article>
          <article className="rounded-2xl border border-amber-400/20 bg-amber-400/[.05] p-5"><p className="text-sm text-zinc-400">Perlu ditinjau</p><p className="mt-3 text-3xl font-black">{idr(pending)}</p><p className="mt-2 text-xs text-zinc-500">Menunggu pemindaian atau moderasi</p></article>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-red-300">Creator monetization</p><h2 className="mt-2 text-2xl font-black">Kelayakan monetisasi</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Target awal platform: channel aktif, minimal {idr(FOLLOWER_TARGET)} pengikut, dan {idr(VIEW_TARGET)} permintaan pemutaran tercatat. Pencapaian target belum menjamin persetujuan atau pembayaran.</p></div><span className={"rounded-full px-3 py-2 text-xs font-bold " + (eligible ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200")}>{eligible ? "Target tercapai · menunggu review" : "Belum memenuhi target"}</span></div>
          <div className="mt-7 space-y-5">
            <div><div className="mb-2 flex justify-between gap-3 text-sm"><span>Pengikut</span><span>{idr(followerCount)} / {idr(FOLLOWER_TARGET)}</span></div><div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-red-500" style={{ width: Math.min(100, followerCount / FOLLOWER_TARGET * 100) + "%" }} /></div></div>
            <div><div className="mb-2 flex justify-between gap-3 text-sm"><span>Views tercatat</span><span>{idr(totalViews)} / {idr(VIEW_TARGET)}</span></div><div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-400" style={{ width: Math.min(100, totalViews / VIEW_TARGET * 100) + "%" }} /></div></div>
          </div>
          <p className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/[.05] p-4 text-sm leading-6 text-amber-100">Monetisasi dan pencairan dana belum otomatis aktif hanya dari angka ini. NexoraFilm tetap harus meninjau kepatuhan konten, hak distribusi, validitas views, identitas/persyaratan pembayaran, serta mengaktifkan sistem payout resmi.</p>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10">
          <div className="border-b border-white/10 p-5"><h2 className="text-xl font-bold">Performa Shorts</h2><p className="mt-1 text-sm text-zinc-400">Maksimal 200 video terbaru milik channel kamu.</p></div>
          {allVideos.length === 0 ? <div className="p-8 text-sm text-zinc-400">Belum ada Shorts. Mulai dari Creator Studio.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-white/[.03] text-xs uppercase text-zinc-500"><tr><th className="px-5 py-4">Judul</th><th className="px-5 py-4">Views</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Safety scan</th></tr></thead><tbody>{allVideos.map((video) => <tr key={video.id} className="border-t border-white/[.06]"><td className="max-w-xs truncate px-5 py-4 font-medium">{video.title}</td><td className="px-5 py-4">{idr(Number(video.view_count ?? 0))}</td><td className="px-5 py-4">{video.status}</td><td className="px-5 py-4">{video.scan_status}</td></tr>)}</tbody></table></div>}
        </section>
        <div className="mt-6 flex flex-wrap gap-3"><Link href="/creator" className="rounded-full bg-red-600 px-5 py-3 text-sm font-bold hover:bg-red-500">Kelola Shorts</Link><Link href="/creator/guide" className="rounded-full border border-white/15 px-5 py-3 text-sm hover:bg-white/5">Baca panduan lengkap</Link></div>
      </div>
    </main>
  );
}
