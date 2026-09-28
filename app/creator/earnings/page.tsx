import Link from "next/link";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
type EarningsVideo = {
  id: string;
  video_type: string;
  status: string;
  view_count: number | null;
};

type WatchEvent = {
  video_id: string;
  watched_seconds: number;
  watch_date: string;
};

const number = (n: number) => n.toLocaleString("id-ID");
const hours = (seconds: number) => (seconds / 3600).toLocaleString("id-ID", {
  maximumFractionDigits: 1
});

export default async function CreatorEarningsPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-zinc-950 p-8 text-white">
        <h1 className="text-3xl font-bold">Progres Monetisasi</h1>
        <p className="mt-4 text-zinc-300">Login untuk melihat progres kanal kamu.</p>
        <Link href="/login" className="mt-5 inline-block rounded-xl bg-violet-600 px-5 py-3">Login</Link>
      </main>
    );
  }

  const { data: channel } = await db
    .from("creator_channels")
    .select("id,name,handle,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!channel) {
    return (
      <main className="min-h-screen bg-zinc-950 p-8 text-white">
        <h1 className="text-3xl font-bold">Progres Monetisasi</h1>
        <p className="mt-4 text-zinc-400">Buat kanal kreator terlebih dahulu.</p>
        <Link href="/creator" className="mt-5 inline-block rounded-xl bg-violet-600 px-5 py-3">Buka Creator Studio</Link>
      </main>
    );
  }

  const [{ data: subscriberCount }, { data: videos }, { data: events }, { data: application }] = await Promise.all([
    db.rpc("get_creator_subscriber_count", { p_channel_id: channel.id }),
    db.from("creator_videos").select("id,video_type,status,view_count").eq("channel_id", channel.id),
    db.from("creator_watch_events").select("video_id,watched_seconds,watch_date").eq("channel_id", channel.id),
    db.from("creator_monetization_applications").select("status,admin_note,created_at").eq("channel_id", channel.id).maybeSingle()
  ]);

  const allVideos = (videos ?? []) as EarningsVideo[];
  const published = allVideos.filter((v) => v.status === "published");
  const shortsViews = published.filter((v) => v.video_type === "short")
    .reduce((sum, v) => sum + Number(v.view_count ?? 0), 0);

  const watchEvents = (events ?? []) as WatchEvent[];
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);

  const longWatchSeconds = watchEvents
    .filter((e) => {
      const date = new Date(`${e.watch_date}T00:00:00Z`);
      return date >= yearAgo &&
        published.some((v) => v.id === e.video_id && v.video_type === "long");
    })
    .reduce((sum, e) => sum + Number(e.watched_seconds), 0);

  const shortWatchSeconds = watchEvents
    .filter((e) => {
      const date = new Date(`${e.watch_date}T00:00:00Z`);
      return date >= ninetyDaysAgo &&
        published.some((v) => v.id === e.video_id && v.video_type === "short");
    })
    .reduce((sum, e) => sum + Number(e.watched_seconds), 0);

  const subscribers = Number(subscriberCount ?? 0);
  const subscriberTarget = Number(process.env.NEXORA_MONETIZATION_SUBSCRIBERS || 1000);
  const hoursTarget = Number(process.env.NEXORA_MONETIZATION_WATCH_HOURS || 4000);
  const shortsTarget = Number(process.env.NEXORA_MONETIZATION_SHORTS_VIEWS || 10000000);
  const subProgress = Math.min(100, Math.round(((subscribers ?? 0) / subscriberTarget) * 100));
  const hoursProgress = Math.min(100, Math.round((longWatchSeconds / 3600 / hoursTarget) * 100));
  const shortsProgress = Math.min(100, Math.round((shortsViews / shortsTarget) * 100));

  const Metric = ({ title, value, target, progress }: {
    title: string; value: string; target: string; progress: number;
  }) => (
    <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-sm text-zinc-500">Target: {target}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-xs text-zinc-400">{progress}% tercapai</p>
    </section>
  );

  const eligible =
    (subscribers ?? 0) >= subscriberTarget &&
    longWatchSeconds / 3600 >= hoursTarget;

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-9 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/creator" className="text-sm text-violet-300 hover:text-violet-200">â† Creator Studio</Link>
        <header className="mt-5">
          <p className="text-sm font-semibold tracking-[0.25em] text-violet-300">CREATOR ECONOMY</p>
          <h1 className="mt-2 text-4xl font-black sm:text-5xl">Progres Monetisasi</h1>
          <p className="mt-3 text-zinc-400">{channel.name} Â· @{channel.handle}</p>
        </header>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Metric title="Subscriber" value={number(subscribers ?? 0)} target={number(subscriberTarget)} progress={subProgress} />
          <Metric title="Jam tayang video panjang" value={`${hours(longWatchSeconds)} jam`} target={`${number(hoursTarget)} jam / 12 bulan`} progress={hoursProgress} />
          <Metric title="Views Shorts" value={number(shortsViews)} target={`${number(shortsTarget)} / 90 hari`} progress={shortsProgress} />
        </div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-zinc-900 p-6">
          <h2 className="text-xl font-bold">Status kelayakan</h2>
          <p className="mt-3 text-zinc-300">
            {eligible
              ? "Target subscriber dan jam tayang dasar tercapai. Kanal masih perlu pemeriksaan kebijakan dan persetujuan admin."
              : "Terus bangun audiens dan jam tayang yang valid. Shorts memiliki target penayangan tersendiri."}
          </p>
          <p className="mt-3 text-sm text-zinc-500">
            Status pengajuan: {application?.status ?? "Belum mengajukan"}
          </p>
          {application?.admin_note && (
            <p className="mt-2 text-sm text-zinc-400">Catatan admin: {application.admin_note}</p>
          )}
          <p className="mt-4 text-xs leading-5 text-amber-300">
            Statistik jam tayang dihitung dari sesi tercatat untuk pengguna login dan dapat berbeda dari analitik final. Views Shorts ditampilkan terpisah. Angka progres bukan jaminan monetisasi atau saldo uang.
          </p>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/shorts" className="rounded-xl bg-violet-600 px-5 py-3 font-semibold hover:bg-violet-500">Jelajahi Shorts</Link>
          <Link href="/creators" className="rounded-xl border border-white/15 px-5 py-3 hover:bg-white/5">Jelajahi Kreator</Link>
        </div>
      </div>
    </main>
  );
}