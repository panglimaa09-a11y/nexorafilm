"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Channel = {
  id: string;
  name: string;
  handle: string;
  description: string;
  status: string;
};

type Video = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
};

export default function CreatorStudioClient({
  initialChannel,
  initialVideos
}: {
  initialChannel: Channel | null;
  initialVideos: Video[];
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel | null>(initialChannel);
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [channelName, setChannelName] = useState("");
  const [handle, setHandle] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function createChannel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/creator/channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: channelName, handle, description: channelDescription })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Channel gagal dibuat.");
      setChannel(data.channel);
      setMessage("Channel dibuat. Status awal: menunggu peninjauan admin.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadVideo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Pilih file video terlebih dahulu.");
      return;
    }
    if (!file.type.startsWith("video/") || !["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) {
      setError("Format yang didukung: MP4, WebM, atau MOV.");
      return;
    }
    if (file.size > 1024 * 1024 * 1024) {
      setError("Ukuran maksimum file saat ini 1 GB.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("Mengunggah video ke penyimpanan privat...");
    const db = createClient();
    let uploadedPath = "";

    try {
      const { data: { user }, error: userError } = await db.auth.getUser();
      if (userError || !user) throw new Error("Sesi login tidak valid. Silakan login ulang.");

      const extByType: Record<string, string> = {
        "video/mp4": "mp4",
        "video/webm": "webm",
        "video/quicktime": "mov"
      };
      const path = `${user.id}/${crypto.randomUUID()}.${extByType[file.type]}`;
      const { error: uploadError } = await db.storage
        .from("creator-videos")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) throw new Error(`Upload gagal: ${uploadError.message}`);
      uploadedPath = path;

      const res = await fetch("/api/creator/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, storage_path: path })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Metadata video gagal disimpan.");

      setVideos((old) => [data.video, ...old]);
      setTitle("");
      setDescription("");
      setFile(null);
      const input = document.getElementById("creator-video-file") as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage("Video berhasil diunggah dan masuk antrean peninjauan. Video belum dipublikasikan.");
      router.refresh();
    } catch (err) {
      if (uploadedPath) {
        await db.storage.from("creator-videos").remove([uploadedPath]);
      }
      setError(err instanceof Error ? err.message : "Upload gagal.");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function deleteVideo(id: string) {
    if (!confirm("Hapus video ini? Tindakan ini tidak dapat dibatalkan.")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/creator/videos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video gagal dihapus.");
      setVideos((old) => old.filter((v) => v.id !== id));
      setMessage("Video dihapus.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video gagal dihapus.");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel: Record<string, string> = {
    pending: "Menunggu peninjauan channel",
    active: "Channel aktif",
    suspended: "Channel ditangguhkan",
    draft: "Draf",
    review: "Menunggu moderasi",
    published: "Dipublikasikan",
    rejected: "Perlu perbaikan"
  };

  return (
    <div className="space-y-8">
      {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-red-200">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-emerald-200">{message}</div>}

      {!channel ? (
        <section className="glass rounded-2xl p-6">
          <h2 className="text-2xl font-bold">Buat channel kreator</h2>
          <p className="mt-2 text-sm text-zinc-400">Channel akan berstatus menunggu peninjauan. Gunakan hanya video yang Anda miliki atau punya izin untuk mengunggahnya.</p>
          <form onSubmit={createChannel} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm">Nama channel
              <input required minLength={2} maxLength={80} value={channelName} onChange={(e) => setChannelName(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Contoh: Studio Angga" />
            </label>
            <label className="grid gap-2 text-sm">Handle channel
              <input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_-]+" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} className="rounded-xl border border-white/10 bg-black/30 p-3" placeholder="studio-angga" />
            </label>
            <label className="grid gap-2 text-sm">Deskripsi
              <textarea maxLength={1000} value={channelDescription} onChange={(e) => setChannelDescription(e.target.value)} className="min-h-24 rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Ceritakan tentang channel Anda." />
            </label>
            <button disabled={busy} className="nexora-btn-primary disabled:opacity-50">{busy ? "Memproses..." : "Buat channel"}</button>
          </form>
        </section>
      ) : (
        <>
          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-zinc-400">Channel kreator</p>
                <h2 className="mt-1 text-3xl font-black">{channel.name}</h2>
                <p className="mt-1 text-zinc-400">@{channel.handle}</p>
                {channel.description && <p className="mt-4 max-w-2xl text-zinc-300">{channel.description}</p>}
              </div>
              <span className="rounded-full border border-white/10 px-3 py-2 text-sm">{statusLabel[channel.status] || channel.status}</span>
            </div>
          </section>

          <section className="glass rounded-2xl p-6">
            <h2 className="text-2xl font-bold">Unggah video</h2>
            <p className="mt-2 text-sm text-zinc-400">MP4, WebM, atau MOV; maksimum 1 GB. File disimpan di bucket privat dan video masuk moderasi, bukan langsung tayang.</p>
            <form onSubmit={uploadVideo} className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm">Judul video
                <input required minLength={2} maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Judul video" />
              </label>
              <label className="grid gap-2 text-sm">Deskripsi
                <textarea maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-24 rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Deskripsi video" />
              </label>
              <label className="grid gap-2 text-sm">File video
                <input id="creator-video-file" required type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="rounded-xl border border-white/10 bg-black/30 p-3 file:mr-4 file:rounded-lg file:border-0 file:bg-red-600 file:px-4 file:py-2 file:text-white" />
              </label>
              {file && <p className="text-sm text-zinc-400">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
              <button disabled={busy || channel.status === "suspended"} className="nexora-btn-primary disabled:opacity-50">{busy ? "Mohon tunggu..." : "Unggah dan ajukan peninjauan"}</button>
            </form>
          </section>
        </>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Video saya</h2>
          <span className="text-sm text-zinc-400">{videos.length} video tercatat</span>
        </div>
        {videos.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-zinc-400">Belum ada video. Video yang diunggah akan muncul di sini.</div>
        ) : (
          <div className="grid gap-3">
            {videos.map((video) => (
              <article key={video.id} className="glass flex flex-wrap items-center justify-between gap-4 rounded-xl p-5">
                <div className="min-w-0">
                  <h3 className="break-words font-bold">{video.title}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{statusLabel[video.status] || video.status} · {new Date(video.created_at).toLocaleDateString("id-ID")}</p>
                  {video.description && <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{video.description}</p>}
                </div>
                {video.status !== "published" && (
                  <button type="button" disabled={busy} onClick={() => deleteVideo(video.id)} className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-300 disabled:opacity-50">Hapus</button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-5 text-sm text-amber-100">
        <strong>Monetisasi belum diaktifkan.</strong> Pendapatan, iklan, pembayaran kreator, dan pencairan belum dihitung atau dijanjikan oleh halaman ini. Semua itu harus terhubung ke transaksi terverifikasi dan kebijakan pembayaran sebelum ditampilkan.
      </section>
    </div>
  );
}
