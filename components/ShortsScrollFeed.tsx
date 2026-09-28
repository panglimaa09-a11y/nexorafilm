"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type ShortsFeedItem = {
  id: string;
  title: string;
  description: string | null;
  view_count: number | null;
  channel_id: string;
  created_at: string;
  channel: { id: string; name: string; handle: string } | null;
};

export default function ShortsScrollFeed({ videos }: { videos: ShortsFeedItem[] }) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(videos[0]?.id ?? null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const slides = Array.from(root.querySelectorAll<HTMLElement>("[data-short-id]"));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const id = (visible.target as HTMLElement).dataset.shortId;
      if (!id) return;
      setActiveId(id);
      const videosInFeed = Array.from(root.querySelectorAll<HTMLVideoElement>("video[data-short-video]"));
      videosInFeed.forEach((video) => {
        if (video.dataset.shortVideo === id) {
          video.muted = muted;
          if (playing) void video.play().catch(() => setPlaying(false));
        } else {
          video.pause();
        }
      });
    }, { root, threshold: [0.55, 0.75, 0.9] });
    slides.forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [videos, muted, playing]);

  function togglePlay(id: string) {
    const video = feedRef.current?.querySelector<HTMLVideoElement>(`video[data-short-video="${id}"]`);
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    const video = feedRef.current?.querySelector<HTMLVideoElement>(`video[data-short-video="${activeId}"]`);
    if (video) video.muted = next;
  }

  function toggleLike(id: string) {
    setLikedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-0 sm:px-4">
      <div className="mb-3 flex items-center justify-between px-4 sm:px-1">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.24em] text-red-400">NEXORA SHORTS</p>
          <p className="mt-1 text-xs text-zinc-500">Geser atau scroll untuk video berikutnya</p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400">{videos.length} video</span>
      </div>

      <div
        ref={feedRef}
        className="h-[calc(100dvh-190px)] min-h-[480px] overflow-y-auto overscroll-contain rounded-none sm:rounded-2xl"
        style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none" }}
        aria-label="Feed video pendek"
      >
        {videos.map((video) => {
          const active = activeId === video.id;
          const channel = video.channel;
          const liked = likedIds.has(video.id);
          return (
            <article
              key={video.id}
              data-short-id={video.id}
              className="relative mx-auto flex h-full min-h-[480px] w-full snap-start snap-always items-center justify-center bg-black sm:min-h-[620px]"
              style={{ scrollSnapAlign: "start" }}
            >
              <video
                data-short-video={video.id}
                className="absolute inset-0 h-full w-full cursor-pointer object-contain"
                src={`/api/shorts/${encodeURIComponent(video.id)}`}
                playsInline
                muted={muted}
                loop
                preload={active ? "auto" : "metadata"}
                onClick={() => togglePlay(video.id)}
                onPlay={() => { if (active) setPlaying(true); }}
                onPause={() => { if (active) setPlaying(false); }}
                aria-label={`Video pendek: ${video.title}`}
              />

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/25" />
              <div className="absolute left-4 right-20 top-4 flex items-center justify-between">
                <span className="rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[10px] font-bold tracking-[.18em] text-white">NEXORA · SHORTS</span>
                <span className="rounded-full bg-black/45 px-3 py-1.5 text-xs text-white/80">{Number(video.view_count ?? 0).toLocaleString("id-ID")} views</span>
              </div>

              <div className="absolute bottom-5 left-4 right-[76px] z-10 sm:bottom-7 sm:left-7">
                {channel ? (
                  <Link href={`/creators/${encodeURIComponent(channel.handle)}`} className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-black/45 py-1.5 pl-1.5 pr-3 backdrop-blur hover:bg-black/65">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-black">{channel.name.slice(0, 1).toUpperCase()}</span>
                    <span className="max-w-[220px] truncate text-sm font-semibold">@{channel.handle}</span>
                    <span className="text-xs text-red-300">Profil ↗</span>
                  </Link>
                ) : null}
                <h2 className="text-xl font-black leading-tight text-white drop-shadow sm:text-2xl">{video.title}</h2>
                {video.description ? <p className="mt-2 line-clamp-3 max-w-xl whitespace-pre-wrap break-words text-sm leading-6 text-white/85 drop-shadow">{video.description}</p> : null}
                <p className="mt-2 text-[11px] text-white/55">{new Date(video.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}</p>
              </div>

              <div className="absolute bottom-24 right-3 z-10 flex flex-col items-center gap-5 sm:right-5">
                <button type="button" onClick={() => toggleLike(video.id)} aria-pressed={liked} aria-label={liked ? "Batalkan suka" : "Suka video"} className="flex flex-col items-center gap-1 rounded-full bg-black/35 p-2 text-white backdrop-blur transition hover:bg-black/60">
                  <span className={liked ? "text-3xl text-red-400" : "text-3xl"}>{liked ? "♥" : "♡"}</span>
                  <span className="text-[10px]">{liked ? "Disukai" : "Suka"}</span>
                </button>
                <button type="button" onClick={toggleMute} aria-label={muted ? "Aktifkan suara" : "Matikan suara"} className="flex flex-col items-center gap-1 rounded-full bg-black/35 p-2 text-white backdrop-blur transition hover:bg-black/60">
                  <span className="text-2xl">{muted ? "🔇" : "🔊"}</span>
                  <span className="text-[10px]">{muted ? "Suara mati" : "Suara aktif"}</span>
                </button>
                <button type="button" onClick={() => togglePlay(video.id)} aria-label={playing ? "Jeda video" : "Putar video"} className="flex flex-col items-center gap-1 rounded-full bg-black/35 p-2 text-white backdrop-blur transition hover:bg-black/60">
                  <span className="text-2xl">{playing && active ? "Ⅱ" : "▶"}</span>
                  <span className="text-[10px]">{playing && active ? "Jeda" : "Putar"}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="px-4 py-3 text-center text-[11px] text-zinc-600">Gunakan scroll, roda mouse, atau swipe vertikal. Video berikutnya diputar saat masuk ke layar.</p>
    </div>
  );
}
