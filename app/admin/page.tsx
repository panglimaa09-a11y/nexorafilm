import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const modules = [
  { title: "Manajemen Film", desc: "Kelola katalog, metadata, dan status publikasi.", href: "/admin/movies", icon: "🎬" },
  { title: "Tambah Film", desc: "Masukkan judul baru ke katalog.", href: "/admin/movies/new", icon: "➕" },
  { title: "Impor Media", desc: "Kelola proses impor media yang tersedia.", href: "/admin/import", icon: "📥" },
  { title: "Creator Studio", desc: "Moderasi channel dan Shorts kreator.", href: "/admin/creators", icon: "🎥" },
  { title: "Pendapatan & Analytics", desc: "Pantau pembayaran terverifikasi, tren pendapatan, dan transaksi terbaru.", href: "/admin/analytics", icon: "📊" },
  { title: "AI Agent", desc: "Buka agen admin untuk membantu operasi katalog.", href: "/admin/agent", icon: "🤖" },
];

async function countRows(
  db: Awaited<ReturnType<typeof createClient>>,
  table: string,
  column?: string,
  value?: string
) {
  let query = db.from(table).select("*", { count: "exact", head: true });
  if (column && value) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) {
    console.error(`Admin dashboard count failed: ${table}`, error.message);
    return null;
  }
  return count ?? 0;
}

export default async function AdminDashboardPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await db
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/");

  const [
    users, movies, plans, subscriptions, payments,
    channels, pendingChannels, videos, reviewVideos
  ] = await Promise.all([
    countRows(db, "profiles"),
    countRows(db, "movies"),
    countRows(db, "plans"),
    countRows(db, "subscriptions"),
    countRows(db, "payments"),
    countRows(db, "creator_channels"),
    countRows(db, "creator_channels", "status", "pending"),
    countRows(db, "creator_videos"),
    countRows(db, "creator_videos", "status", "review"),
  ]);

  const stats = [
    { label: "Pengguna", value: users, icon: "👥" },
    { label: "Film dalam katalog", value: movies, icon: "🎬" },
    { label: "Paket langganan", value: plans, icon: "💳" },
    { label: "Langganan tercatat", value: subscriptions, icon: "📅" },
    { label: "Catatan pembayaran", value: payments, icon: "🧾" },
    { label: "Channel kreator", value: channels, icon: "📺" },
    { label: "Channel menunggu", value: pendingChannels, icon: "⏳" },
    { label: "Video menunggu review", value: reviewVideos, icon: "🛡️" },
  ];

  return (
    <main className="min-h-screen bg-[#080b12] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
              NEXORA FILM / CONTROL CENTER
            </p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Dashboard Admin</h1>
            <p className="mt-2 text-sm text-slate-400">
              Selamat datang, {profile?.display_name || user.email || "Admin"}.
              Pantau katalog, pengguna, langganan, dan kreator dari satu tempat.
            </p>
          </div>
          <Link href="/" className="rounded-xl border border-white/15 px-4 py-3 text-sm hover:bg-white/10">
            ← Lihat website
          </Link>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <article key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{stat.label}</span>
                <span className="text-xl">{stat.icon}</span>
              </div>
              <p className="mt-4 text-3xl font-bold">
                {stat.value === null ? "—" : stat.value.toLocaleString("id-ID")}
              </p>
              {stat.value === null && (
                <p className="mt-2 text-xs text-amber-300">Data belum dapat dibaca; periksa tabel dan kebijakan akses.</p>
              )}
            </article>
          ))}
        </section>

        <section className="mb-8 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Pusat moderasi kreator</h2>
              <p className="mt-1 text-sm text-slate-400">
                {reviewVideos === null || pendingChannels === null
                  ? "Status antrean belum dapat dibaca."
                  : `${pendingChannels} channel menunggu pemeriksaan · ${reviewVideos} video menunggu review`}
              </p>
            </div>
            <Link href="/admin/creators" className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300">
              Buka moderasi →
            </Link>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-bold">Modul administrasi</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((item) => (
              <Link key={item.href} href={item.href}
                className="group rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-cyan-400/50 hover:bg-white/[0.07]">
                <span className="text-3xl">{item.icon}</span>
                <h3 className="mt-4 text-lg font-semibold group-hover:text-cyan-300">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.desc}</p>
                <p className="mt-4 text-sm text-cyan-300">Buka modul →</p>
              </Link>
            ))}
          </div>
        </section>

        <footer className="mt-10 border-t border-white/10 pt-5 text-xs leading-6 text-slate-500">
          Statistik berasal dari tabel yang dapat diakses saat halaman dimuat. Angka pembayaran adalah jumlah catatan,
          bukan total pendapatan terverifikasi. Pencairan dana kreator belum diaktifkan oleh dashboard ini.
        </footer>
      </div>
    </main>
  );
}
