"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Channel = { id: string; name: string; handle: string; description: string; status: string };
type Video = { id: string; title: string; description: string | null; status: string; created_at: string; thumbnail_path?: string | null };

export default function CreatorStudioClient({ initialChannel, initialVideos }: { initialChannel: Channel | null; initialVideos: Video[] }) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel | null>(initialChannel);
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [channelName, setChannelName] = useState("");
  const [handle, setHandle] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [editing, setEditing] = useState<Video | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editThumbnail, setEditThumbnail] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function createChannel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/creator/channel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: channelName, handle, description: channelDescription }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Channel gagal dibuat.");
      setChannel(data.channel); setMessage("Channel dibuat. Status awal: menunggu peninjauan admin."); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Terjadi kesalahan."); }
    finally { setBusy(false); }
  }

  async function uploadVideo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) { setError("Pilih video dari folder atau galeri perangkat."); return; }
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) { setError("Format video yang didukung: MP4, WebM, atau MOV."); return; }
    if (file.size > 1024 * 1024 * 1024) { setError("Ukuran maksimum file saat ini 1 GB."); return; }
    if (thumbnail && !thumbnail.type.startsWith("image/")) { setError("Thumbnail harus berupa gambar."); return; }
    setBusy(true); setError(""); setMessage("Mengunggah file ke penyimpanan privat...");
    const db = createClient(); let uploadedPaths: string[] = [];
    try {
      const { data: { user }, error: userError } = await db.auth.getUser();
      if (userError || !user) throw new Error("Sesi login tidak valid. Silakan login ulang.");
      const ext: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
      const path = `${user.id}/${crypto.randomUUID()}.${ext[file.type]}`;
      const { error: uploadError } = await db.storage.from("creator-videos").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(`Upload video gagal: ${uploadError.message}`);
      uploadedPaths.push(path);
      let thumbnailPath: string | null = null;
      if (thumbnail) {
        const safeExt = thumbnail.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        thumbnailPath = `${user.id}/thumbnails/${crypto.randomUUID()}.${safeExt}`;
        const { error: thumbError } = await db.storage.from("creator-videos").upload(thumbnailPath, thumbnail, { contentType: thumbnail.type, upsert: false });
        if (thumbError) throw new Error(`Upload thumbnail gagal: ${thumbError.message}`);
        uploadedPaths.push(thumbnailPath);
      }
      const res = await fetch("/api/creator/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, storage_path: path, thumbnail_path: thumbnailPath }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Metadata video gagal disimpan.");
      setVideos(old => [data.video, ...old]); setTitle(""); setDescription(""); setFile(null); setThumbnail(null);
      const videoInput = document.getElementById("creator-video-file") as HTMLInputElement | null; if (videoInput) videoInput.value = "";
      const thumbInput = document.getElementById("creator-thumbnail-file") as HTMLInputElement | null; if (thumbInput) thumbInput.value = "";
      setMessage("Video tersimpan dan masuk antrean peninjauan. Admin akan memeriksa sebelum video tayang."); uploadedPaths = []; router.refresh();
    } catch (err) {
      if (uploadedPaths.length) await db.storage.from("creator-videos").remove(uploadedPaths);
      setError(err instanceof Error ? err.message : "Upload gagal."); setMessage("");
    } finally { setBusy(false); }
  }

  function startEdit(video: Video) {
    setEditing(video); setEditTitle(video.title); setEditDescription(video.description || ""); setEditThumbnail(null); setError(""); setMessage("");
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editing) return;
    if (editTitle.trim().length < 2 || editTitle.trim().length > 150) { setError("Judul harus 2–150 karakter."); return; }
    if (editThumbnail && !editThumbnail.type.startsWith("image/")) { setError("Thumbnail harus berupa gambar."); return; }
    setBusy(true); setError(""); setMessage("");
    const db = createClient(); let newThumbnailPath = "";
    try {
      const { data: { user }, error: userError } = await db.auth.getUser();
      if (userError || !user) throw new Error("Sesi login tidak valid. Silakan login ulang.");
      if (editThumbnail) {
        const ext = editThumbnail.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        newThumbnailPath = `${user.id}/thumbnails/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await db.storage.from("creator-videos").upload(newThumbnailPath, editThumbnail, { contentType: editThumbnail.type, upsert: false });
        if (uploadError) throw new Error(`Thumbnail gagal diunggah: ${uploadError.message}`);
      }
      const res = await fetch("/api/creator/videos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, title: editTitle.trim(), description: editDescription, ...(newThumbnailPath ? { thumbnail_path: newThumbnailPath } : {}) }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Perubahan gagal disimpan.");
      setVideos(old => old.map(v => v.id === editing.id ? { ...v, ...data.video } : v)); setEditing(null); setEditThumbnail(null); setMessage("Perubahan video berhasil disimpan."); router.refresh();
    } catch (err) {
      if (newThumbnailPath) await db.storage.from("creator-videos").remove([newThumbnailPath]);
      setError(err instanceof Error ? err.message : "Perubahan gagal disimpan.");
    } finally { setBusy(false); }
  }

  async function deleteVideo(id: string) {
    if (!confirm("Hapus video ini? Tindakan ini tidak dapat dibatalkan.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch(`/api/creator/videos?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video gagal dihapus.");
      setVideos(old => old.filter(v => v.id !== id)); setMessage("Video dihapus."); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Video gagal dihapus."); }
    finally { setBusy(false); }
  }

  const statusLabel: Record<string, string> = { pending: "Menunggu peninjauan channel", active: "Channel aktif", suspended: "Channel ditangguhkan", draft: "Draf", review: "Menunggu moderasi", published: "Dipublikasikan", rejected: "Perlu perbaikan" };

  return <div className="space-y-8">
    {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-red-200">{error}</div>}
    {message && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-emerald-200">{message}</div>}
    {!channel ? <section className="glass rounded-2xl p-6">
      <h2 className="text-2xl font-bold">Buat channel kreator</h2><p className="mt-2 text-sm text-zinc-400">Channel akan menunggu peninjauan. Unggah hanya konten milik sendiri atau yang memiliki izin.</p>
      <form onSubmit={createChannel} className="mt-6 grid gap-4">
        <label className="grid gap-2 text-sm">Nama channel<input required minLength={2} maxLength={80} value={channelName} onChange={e => setChannelName(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Studio Angga"/></label>
        <label className="grid gap-2 text-sm">Handle channel<input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_-]+" value={handle} onChange={e => setHandle(e.target.value.toLowerCase())} className="rounded-xl border border-white/10 bg-black/30 p-3" placeholder="studio-angga"/></label>
        <label className="grid gap-2 text-sm">Deskripsi<textarea maxLength={1000} value={channelDescription} onChange={e => setChannelDescription(e.target.value)} className="min-h-24 rounded-xl border border-white/10 bg-black/30 p-3"/></label>
        <button disabled={busy} className="nexora-btn-primary disabled:opacity-50">{busy ? "Memproses..." : "Buat channel"}</button>
      </form>
    </section> : <>
      <section className="glass rounded-2xl p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-zinc-400">Channel kreator</p><h2 className="mt-1 text-3xl font-black">{channel.name}</h2><p className="mt-1 text-zinc-400">@{channel.handle}</p>{channel.description && <p className="mt-4 max-w-2xl text-zinc-300">{channel.description}</p>}</div><span className="rounded-full border border-white/10 px-3 py-2 text-sm">{statusLabel[channel.status] || channel.status}</span></div></section>
      <section className="glass rounded-2xl p-6"><h2 className="text-2xl font-bold">Buat dan unggah Shorts</h2><p className="mt-2 text-sm text-zinc-400">Unggah Shorts komunitas saja dari folder atau galeri HP/komputer. Film panjang dan serial hanya dapat ditambahkan oleh admin melalui Manajemen Film. MP4, WebM, MOV; maksimum 1 GB.</p>
        <form onSubmit={uploadVideo} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm">Judul Shorts<input required minLength={2} maxLength={150} value={title} onChange={e => setTitle(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Judul video"/></label>
          <label className="grid gap-2 text-sm">Deskripsi<textarea maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} className="min-h-24 rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Ceritakan isi video"/></label>
          <label className="grid gap-2 text-sm">File Shorts <input id="creator-video-file" required type="file" accept="video/mp4,video/webm,video/quicktime" onChange={e => setFile(e.target.files?.[0] ?? null)} className="rounded-xl border border-white/10 bg-black/30 p-3 file:mr-4 file:rounded-lg file:border-0 file:bg-red-600 file:px-4 file:py-2 file:text-white"/></label>
          {file && <div className="rounded-xl border border-white/10 bg-black/30 p-3"><p className="text-sm text-zinc-300">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p><video controls preload="metadata" className="mt-3 max-h-64 w-full rounded-lg" src={URL.createObjectURL(file)}/></div>}
          <label className="grid gap-2 text-sm">Thumbnail / cover (opsional)<input id="creator-thumbnail-file" type="file" accept="image/*" onChange={e => setThumbnail(e.target.files?.[0] ?? null)} className="rounded-xl border border-white/10 bg-black/30 p-3 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2"/></label>
          {thumbnail && <p className="text-sm text-zinc-400">Cover dipilih: {thumbnail.name}</p>}
          <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3 text-sm text-zinc-300"><input required type="checkbox" className="mt-1"/>Saya memiliki hak atau izin untuk mengunggah video ini.</label>
          <button disabled={busy || channel.status !== "active"} className="nexora-btn-primary disabled:opacity-50">{busy ? "Mengunggah..." : "Unggah Shorts untuk ditinjau"}</button>
          {channel.status !== "active" && <p className="text-sm text-amber-300">Channel harus disetujui admin sebelum bisa mengunggah video.</p>}
        </form>
      </section>
    </>}
    {editing && <section className="glass rounded-2xl border border-violet-400/30 p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-bold">Editor video</h2><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-white/10 px-3 py-2 text-sm">Tutup</button></div><p className="mt-2 text-sm text-zinc-400">Atur metadata dan thumbnail seperti Creator Studio. File video asli tidak diubah.</p>
      <form onSubmit={saveEdit} className="mt-5 grid gap-4"><label className="grid gap-2 text-sm">Judul<input required minLength={2} maxLength={150} value={editTitle} onChange={e => setEditTitle(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 p-3"/></label><label className="grid gap-2 text-sm">Deskripsi<textarea maxLength={5000} value={editDescription} onChange={e => setEditDescription(e.target.value)} className="min-h-28 rounded-xl border border-white/10 bg-black/30 p-3"/></label><label className="grid gap-2 text-sm">Ganti thumbnail<input type="file" accept="image/*" onChange={e => setEditThumbnail(e.target.files?.[0] ?? null)} className="rounded-xl border border-white/10 bg-black/30 p-3"/></label>{editThumbnail && <p className="text-sm text-zinc-400">Thumbnail baru: {editThumbnail.name}</p>}<button disabled={busy} className="nexora-btn-primary disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan perubahan"}</button></form>
    </section>}
    <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">Video saya</h2><span className="text-sm text-zinc-400">{videos.length} video</span></div>
      {videos.length === 0 ? <div className="glass rounded-2xl p-8 text-center text-zinc-400">Belum ada Shorts. Pilih video pendek dari perangkat untuk mulai.</div> : <div className="grid gap-3">{videos.map(video => <article key={video.id} className="glass flex flex-wrap items-center justify-between gap-4 rounded-xl p-5"><div className="min-w-0 flex-1"><h3 className="break-words font-bold">{video.title}</h3><p className="mt-1 text-sm text-zinc-400">{statusLabel[video.status] || video.status} · {new Date(video.created_at).toLocaleDateString("id-ID")}</p>{video.description && <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{video.description}</p>}</div><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => startEdit(video)} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Edit</button>{video.status !== "published" && <button type="button" disabled={busy} onClick={() => deleteVideo(video.id)} className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-300 disabled:opacity-50">Hapus</button>}</div></article>)}</div>}
    </section>
    <section className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-5 text-sm text-amber-100"><strong>Catatan:</strong> unggahan masuk moderasi dan tidak langsung tayang. Fitur ini mengedit judul, deskripsi, dan thumbnail; pemotongan video/timeline seperti editor video penuh belum termasuk.</section>
  </div>;
}
