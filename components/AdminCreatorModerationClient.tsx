"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Channel = {
  id: string;
  user_id: string;
  name: string;
  handle: string;
  description: string;
  status: string;
  created_at: string;
};

type Video = {
  id: string;
  channel_id: string;
  owner_id: string;
  title: string;
  description: string;
  storage_path: string;
  status: string;
  moderation_note: string | null;
  scan_status?: string;
  scan_provider?: string | null;
  scanned_at?: string | null;
  created_at: string;
};

export default function AdminCreatorModerationClient({
  channels,
  videos,
}: {
  channels: Channel[];
  videos: Video[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function moderate(
    entity: "channel" | "video",
    id: string,
    status: string,
    note = ""
  ) {
    const key = `${entity}:${id}`;
    setBusy(key);
    setMessage("");

    try {
      const response = await fetch("/api/admin/creator-moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, id, status, note }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Permintaan gagal.");

      setMessage(result.message || "Berhasil.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Terjadi kesalahan.");
    } finally {
      setBusy("");
    }
  }

  async function rescan(id: string) {
    setBusy("scan:" + id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/creator-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Scan gagal.");
      setMessage(result.note || ("Safety scan: " + result.scan_status));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Safety scan gagal.");
    } finally {
      setBusy("");
    }
  }

  const buttonClass =
    "rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50";

  return (
    <div className="space-y-8">
      {message && (
        <div role="status" className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm">
          {message}
        </div>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Channel kreator</h2>
            <p className="mt-1 text-sm text-slate-400">Periksa channel baru sebelum mengaktifkannya.</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm">{channels.length} channel</span>
        </div>

        {channels.length === 0 ? (
          <div className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">
            Belum ada channel kreator.
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((channel) => (
              <article key={channel.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{channel.name}</h3>
                    <p className="mt-1 text-sm text-cyan-300">@{channel.handle}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{channel.description || "Tanpa deskripsi."}</p>
                    <p className="mt-2 break-all text-xs text-slate-500">User ID: {channel.user_id}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{channel.status}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {channel.status !== "active" && (
                    <button className={buttonClass} disabled={!!busy}
                      onClick={() => {
                        if (window.confirm(`Aktifkan channel "${channel.name}"?`))
                          void moderate("channel", channel.id, "active");
                      }}>
                      {busy === `channel:${channel.id}` ? "Memproses..." : "Aktifkan channel"}
                    </button>
                  )}
                  {channel.status !== "suspended" && (
                    <button className={buttonClass} disabled={!!busy}
                      onClick={() => {
                        if (window.confirm(`Tangguhkan channel "${channel.name}"?`))
                          void moderate("channel", channel.id, "suspended");
                      }}>
                      Tangguhkan
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Moderasi video</h2>
            <p className="mt-1 text-sm text-slate-400">Terbitkan video setelah pemeriksaan dan channel aktif.</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm">{videos.length} video</span>
        </div>

        {videos.length === 0 ? (
          <div className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">
            Belum ada video kreator.
          </div>
        ) : (
          <div className="space-y-3">
            {videos.map((video) => (
              <article key={video.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{video.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{video.description || "Tanpa deskripsi."}</p>
                    <p className="mt-2 break-all text-xs text-slate-500">Video ID: {video.id}</p>
                    <p className="mt-1 break-all text-xs text-slate-500">Channel ID: {video.channel_id}</p>
                    <p className="mt-2 text-sm text-cyan-200">Safety scan: {video.scan_status || "pending"}{video.scan_provider ? " · " + video.scan_provider : ""}</p>
                    {video.moderation_note && (
                      <p className="mt-2 text-sm text-amber-300">Catatan: {video.moderation_note}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{video.status}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={buttonClass} disabled={!!busy} onClick={() => void rescan(video.id)}>
                    {busy === "scan:" + video.id ? "Memindai..." : "Jalankan safety scan"}
                  </button>
                  {video.status !== "published" && (
                    <button className={buttonClass} disabled={!!busy}
                      onClick={() => {
                        if (!window.confirm(`Terbitkan "${video.title}"? Pastikan hak distribusinya sudah diverifikasi.`)) return;
                        const note = window.prompt("Catatan moderasi (opsional):", "") ?? "";
                        void moderate("video", video.id, "published", note);
                      }}>
                      {busy === `video:${video.id}` ? "Memproses..." : "Terbitkan"}
                    </button>
                  )}
                  {video.status !== "rejected" && (
                    <button className={buttonClass} disabled={!!busy}
                      onClick={() => {
                        const note = window.prompt("Alasan penolakan video:", "");
                        if (note === null) return;
                        if (!note.trim()) {
                          setMessage("Masukkan alasan penolakan.");
                          return;
                        }
                        void moderate("video", video.id, "rejected", note);
                      }}>
                      Tolak video
                    </button>
                  )}
                  {video.status !== "review" && (
                    <button className={buttonClass} disabled={!!busy}
                      onClick={() => void moderate("video", video.id, "review", "Dikembalikan ke antrean review.")}>
                      Kembalikan ke review
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
