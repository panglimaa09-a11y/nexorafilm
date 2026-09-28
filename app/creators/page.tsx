import Link from "next/link";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Jelajahi Kreator | NEXORA FILM",
  description: "Temukan channel dan karya video kreator di NEXORA FILM.",
};

export default async function CreatorsPage() {
  const db = await createClient();

  const { data: channels, error } = await db
    .from("creator_channels")
    .select("id,name,handle,description,created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Creator discovery query failed:", error.message);
  }

  const creatorList = channels ?? [];

  return (
    <main className="min-h-screen bg-[#080b12] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-950/70 via-[#111827] to-violet-950/50 p-7 sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
            NEXORA FILM · CREATOR COMMUNITY
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
            Cerita mereka. <span className="text-cyan-300">Temukan tontonanmu.</span>
          </h1>
          <p className="mt-5 max-w-2xl leading-7 text-slate-300">
            Jelajahi channel kreator, kenali pembuatnya, dan temukan karya yang telah
            diterbitkan di NEXORA FILM.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/movies" className="rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-200">
              Jelajahi katalog film
            </Link>
            <Link href="/creator" className="rounded-xl border border-white/20 px-5 py-3 font-semibold hover:bg-white/10">
              Buka Creator Studio
            </Link>
          </div>
        </header>

        <section className="mt-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">Temukan kreator</h2>
              <p className="mt-2 text-sm text-slate-400">
                Channel yang sudah aktif dan tersedia untuk publik.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
              {creatorList.length} channel
            </span>
          </div>

          {error ? (
            <div role="alert" className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6">
              <h3 className="font-semibold text-amber-200">Data kreator belum bisa dimuat</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Periksa migrasi Supabase, kebijakan RLS, dan koneksi database. Coba muat ulang halaman setelah diperbaiki.
              </p>
            </div>
          ) : creatorList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] px-6 py-14 text-center">
              <div className="text-4xl">🎬</div>
              <h3 className="mt-4 text-xl font-bold">Kreator segera hadir</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">
                Belum ada channel aktif untuk ditampilkan. Kreator perlu membuat channel
                dan menunggu aktivasi admin sebelum muncul di halaman ini.
              </p>
              <Link href="/creator" className="mt-6 inline-flex rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950">
                Mulai menjadi kreator
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {creatorList.map((channel) => (
                <article key={channel.id} className="group rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-white/[0.06]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300/25 to-violet-400/25 text-3xl ring-1 ring-white/10">
                    🎥
                  </div>
                  <div className="mt-5 flex items-center gap-2">
                    <h3 className="min-w-0 truncate text-xl font-bold">{channel.name}</h3>
                    <span title="Channel aktif" className="text-cyan-300">✓</span>
                  </div>
                  <p className="mt-1 text-sm text-cyan-300">@{channel.handle}</p>
                  <p className="mt-4 min-h-12 whitespace-pre-wrap text-sm leading-6 text-slate-400">
                    {channel.description || "Kreator NEXORA FILM."}
                  </p>
                  <Link href={`/creators/${encodeURIComponent(channel.handle)}`}
                    className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-4 py-3 font-semibold transition group-hover:border-cyan-300/40 group-hover:text-cyan-200">
                    Lihat profil kreator →
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
          <h2 className="text-xl font-bold">Punya karya sendiri?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Buat channel, kirim video yang kamu punya hak distribusinya, dan pantau proses review.
            Publikasi tetap memerlukan persetujuan sesuai kebijakan platform.
          </p>
          <Link href="/creator" className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 font-semibold text-slate-950 hover:bg-slate-200">
            Buka Creator Studio
          </Link>
        </section>
      </div>
    </main>
  );
}
