'use client';
import { useState } from 'react';
export default function TrailerPlayer({ youtubeKey, title }: { youtubeKey: string; title: string }) {
  const [play, setPlay] = useState(false);
  if (!play) {
    return (
      <button onClick={() => setPlay(true)} className="group relative mt-7 block w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 text-left">
        <img src={`https://i.ytimg.com/vi/${youtubeKey}/hqdefault.jpg`} alt={`Trailer ${title}`} className="aspect-video w-full object-cover opacity-80 transition group-hover:opacity-100" loading="lazy" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl text-white shadow-lg transition group-hover:scale-110">▶</span>
        </span>
        <span className="absolute bottom-3 left-4 text-sm font-semibold text-white drop-shadow">Putar Trailer</span>
      </button>
    );
  }
  return (
    <div className="mt-7 w-full max-w-2xl overflow-hidden rounded-xl border border-white/10">
      <iframe src={`https://www.youtube.com/embed/${youtubeKey}?autoplay=1&rel=0`} title={`Trailer ${title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="aspect-video w-full" />
    </div>
  );
}
