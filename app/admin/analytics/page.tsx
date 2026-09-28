import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Payment = {
  id: string; user_id: string; plan_id: string; amount: number | string;
  status: string; provider: string | null; provider_order_id: string | null; created_at: string;
};
const idr = (amount: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
const monthLabel = (date: Date) => date.toLocaleDateString("id-ID", { month: "short", year: "2-digit", timeZone: "Asia/Jakarta" });

export default async function AdminAnalyticsPage() {
  const { db } = await requireAdmin();
  const admin = createAdminClient();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const [
    { data: analytics, error: analyticsError },
    { data: payments, error: paymentsError },
    { data: profiles },
    { data: plans },
    { count: userCount },
    { count: movieCount },
    { count: shortsCount },
  ] = await Promise.all([
    db.rpc("admin_revenue_analytics"),
    admin.from("payments").select("id,user_id,plan_id,amount,status,provider,provider_order_id,created_at").order("created_at", { ascending: false }).limit(50),
    admin.from("profiles").select("id,display_name"),
    admin.from("plans").select("id,name,slug"),
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("movies").select("*", { count: "exact", head: true }),
    admin.from("creator_videos").select("*", { count: "exact", head: true }).eq("status", "published").eq("video_type", "short"),
  ]);

  const hasError = analyticsError || paymentsError;
  const paymentRows = (payments ?? []) as Payment[];
  const metrics = analytics as {
    total_revenue?: number | string; paid_count?: number | string; pending_count?: number | string;
    failed_count?: number | string; total_count?: number | string;
    monthly?: Array<{ month: string; revenue: number | string; count: number | string }>;
  } | null;
  const revenue = Number(metrics?.total_revenue ?? 0);
  const paidCount = Number(metrics?.paid_count ?? 0);
  const pendingCount = Number(metrics?.pending_count ?? 0);
  const failedCount = Number(metrics?.failed_count ?? 0);
  const totalCount = Number(metrics?.total_count ?? 0);
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name || "Pengguna"]));
  const planMap = new Map((plans ?? []).map((plan) => [plan.id, plan.name]));
  const monthData = new Map((metrics?.monthly ?? []).map((month) => [month.month, month]));
  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    const key = date.toISOString().slice(0, 7);
    const month = monthData.get(key);
    return { key, label: monthLabel(date), amount: Number(month?.revenue ?? 0), count: Number(month?.count ?? 0) };
  });
  const maxMonthly = Math.max(1, ...monthBuckets.map((month) => month.amount));

  return (
    <main className="min-h-screen bg-[#080b12] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-cyan-300 hover:text-cyan-200">← Kembali ke Dashboard Admin</Link>
        <header className="mb-8 mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">NEXORA FILM / BUSINESS INTELLIGENCE</p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Pendapatan & Analytics</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Ringkasan pembayaran, tren pendapatan, dan aktivitas katalog untuk admin.</p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-400">Diperbarui saat halaman dibuka</span>
        </header>

        {hasError && <div role="alert" className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
          Data analytics belum dapat dibaca. Jalankan supabase/admin-analytics-shorts-only.sql di Supabase SQL Editor.
          {analyticsError && <p className="mt-2">{analyticsError.message}</p>}
          {paymentsError && <p className="mt-1">{paymentsError.message}</p>}
        </div>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
            <p className="text-sm text-slate-400">Total pendapatan bruto</p><p className="mt-3 break-words text-2xl font-black sm:text-3xl">{idr(revenue)}</p><p className="mt-2 text-xs text-slate-500">Pembayaran berstatus paid</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">Transaksi berhasil</p><p className="mt-3 text-3xl font-black">{paidCount.toLocaleString("id-ID")}</p><p className="mt-2 text-xs text-slate-500">Checkout yang berhasil diverifikasi</p>
          </article>
          <article className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-5">
            <p className="text-sm text-slate-400">Menunggu pembayaran</p><p className="mt-3 text-3xl font-black">{pendingCount.toLocaleString("id-ID")}</p><p className="mt-2 text-xs text-slate-500">Belum dihitung sebagai pendapatan</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">Pengguna terdaftar</p><p className="mt-3 text-3xl font-black">{(userCount ?? 0).toLocaleString("id-ID")}</p><p className="mt-2 text-xs text-slate-500">{(movieCount ?? 0).toLocaleString("id-ID")} film · {(shortsCount ?? 0).toLocaleString("id-ID")} Shorts terbit</p>
          </article>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
            <h2 className="text-xl font-bold">Tren pendapatan 6 bulan</h2><p className="mt-1 text-sm text-slate-400">Pembayaran berstatus paid berdasarkan bulan.</p>
            <div className="mt-7 space-y-5">
              {monthBuckets.map((month) => <div key={month.key}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="w-20 shrink-0 text-slate-400">{month.label}</span><span className="text-right font-semibold">{idr(month.amount)} <span className="text-xs font-normal text-slate-500">· {month.count} transaksi</span></span></div>
                <div className="h-3 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400" style={{ width: (month.amount ? Math.max(2, month.amount / maxMonthly * 100) : 0) + "%" }} /></div>
              </div>)}
            </div>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
            <h2 className="text-xl font-bold">Ringkasan transaksi</h2><p className="mt-1 text-sm text-slate-400">Agregasi seluruh catatan pembayaran.</p>
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-white/[0.035] p-4"><span className="text-sm text-slate-300">Berhasil</span><strong>{paidCount.toLocaleString("id-ID")}</strong></div>
              <div className="flex items-center justify-between rounded-xl bg-white/[0.035] p-4"><span className="text-sm text-slate-300">Pending</span><strong>{pendingCount.toLocaleString("id-ID")}</strong></div>
              <div className="flex items-center justify-between rounded-xl bg-white/[0.035] p-4"><span className="text-sm text-slate-300">Batal / gagal / kedaluwarsa</span><strong>{failedCount.toLocaleString("id-ID")}</strong></div>
              <div className="flex items-center justify-between rounded-xl bg-white/[0.035] p-4"><span className="text-sm text-slate-300">Total pembayaran tercatat</span><strong>{totalCount.toLocaleString("id-ID")}</strong></div>
            </div>
          </article>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 p-5 sm:p-6"><div><h2 className="text-xl font-bold">Transaksi terbaru</h2><p className="mt-1 text-sm text-slate-400">50 transaksi terbaru.</p></div><span className="text-xs text-slate-500">Status paid saja yang masuk pendapatan</span></div>
          {paymentRows.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Belum ada transaksi yang tercatat.</div> : <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-black/20 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Tanggal</th><th className="px-5 py-4">Pengguna</th><th className="px-5 py-4">Paket</th><th className="px-5 py-4">Provider</th><th className="px-5 py-4">Nominal</th><th className="px-5 py-4">Status</th></tr></thead>
              <tbody>{paymentRows.map((payment) => <tr key={payment.id} className="border-t border-white/[0.06]">
                <td className="whitespace-nowrap px-5 py-4 text-slate-400">{new Date(payment.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}</td>
                <td className="max-w-48 truncate px-5 py-4">{profileMap.get(payment.user_id) || payment.user_id.slice(0, 8)}</td>
                <td className="px-5 py-4">{planMap.get(payment.plan_id) || "Paket dihapus"}</td><td className="px-5 py-4 text-slate-400">{payment.provider || "—"}</td><td className="whitespace-nowrap px-5 py-4 font-semibold">{idr(Number(payment.amount || 0))}</td>
                <td className="px-5 py-4"><span className={"rounded-full px-2.5 py-1 text-xs " + (payment.status === "paid" ? "bg-emerald-400/10 text-emerald-300" : payment.status === "pending" ? "bg-amber-400/10 text-amber-300" : "bg-white/10 text-slate-300")}>{payment.status}</span></td>
              </tr>)}</tbody>
            </table>
          </div>}
        </section>
        <p className="mt-5 text-xs leading-6 text-slate-500">Pendapatan yang ditampilkan adalah pendapatan bruto berdasarkan payments.amount dengan status paid. Belum dikurangi biaya payment gateway, refund, pajak, atau pencairan. Sandbox tidak boleh dihitung sebagai pendapatan produksi.</p>
      </div>
    </main>
  );
}
