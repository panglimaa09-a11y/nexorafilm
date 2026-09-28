import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function CreatorWatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: video, error } = await admin
    .from("creator_videos")
    .select("id,title,description,storage_path,created_at,channel_id")
    .eq("id", id)
    .eq("status", "published")
    .eq("video_type", "short")
    .eq("scan_status", "safe")
    .maybeSingle();

  if (error) {
    console.error("Published creator video lookup failed:", error.message);
    throw new Error("Video gagal dimuat.");
  }
  if (!video) notFound();

  const { data: channel } = await admin
    .from("creator_channels")
    .select("name,handle,status")
    .eq("id", video.channel_id)
    .eq("status", "active")
    .maybeSingle();

  if (!channel) notFound();

  const { data: signed, error: storageError } = await admin.storage
    .from("creator-videos")
    .createSignedUrl(video.storage_path, 3600);

  if (storageError || !signed?.signedUrl) {
    console.error("Creator video signed URL failed:", storageError?.message);
    throw new Error("File video tidak bisa diakses. Periksa file di Supabase Storage.");
  }

  await admin.rpc("increment_creator_video_view", { p_video_id: id });

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href={`/creators/${encodeURIComponent(channel.handle)}`} className="mb-6 inline-flex text-sm text-zinc-400 hover:text-white">← Kembali ke channel {channel.name}</Link>
        <video className="w-full rounded-2xl bg-zinc-950" src={signed.signedUrl} controls playsInline preload="metadata" />
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[.24em] text-red-400">NEXORA FILM · CREATOR VIDEO</p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">{video.title}</h1>
          <p className="mt-2 text-sm text-zinc-400">Oleh <Link className="text-red-300 hover:text-red-200" href={`/creators/${encodeURIComponent(channel.handle)}`}>{channel.name} · @{channel.handle}</Link></p>
          {video.description && <p className="mt-5 whitespace-pre-wrap leading-7 text-zinc-300">{video.description}</p>}
          <p className="mt-5 text-xs text-zinc-600">Dipublikasikan {new Date(video.created_at).toLocaleDateString("id-ID")}</p>
        </div>
      </div>
    </main>
  );
}
