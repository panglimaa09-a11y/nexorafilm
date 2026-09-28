'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useParams, useRouter } from 'next/navigation';

export default function Watch() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [movie, setMovie] = useState<any>(null);
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data: m } = await supabase.from('movies').select('id,title,video_url').eq('id', id).eq('published', true).maybeSingle();
      if (!m) { router.replace('/movies'); return; }
      const response = await fetch(`/api/watch/${id}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) { setError(payload.error || 'Film tidak bisa diputar'); setLoading(false); return; }
      if (!active) return;
      setMovie(m);
      setSrc(payload.url);
      const { data: h } = await supabase.from('watch_history').select('progress_seconds').eq('user_id', user.id).eq('movie_id', id).maybeSingle();
      if (h?.progress_seconds) setTimeout(() => { if (video.current) video.current.currentTime = h.progress_seconds; }, 200);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id, router]);

  async function save() {
    if (!video.current) return;
    await fetch('/api/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ movie_id: id, progress_seconds: video.current.currentTime, duration_seconds: video.current.duration || 0 }) });
  }

  if (loading) return <main className="min-h-screen grid place-items-center">Memuat pemutar...</main>;
  if (error) return <main className="min-h-screen grid place-items-center px-6 text-center"><div><p className="text-red-400 font-bold">Tidak dapat memutar</p><p className="mt-2 text-zinc-300">{error}</p><button onClick={() => router.back()} className="nexora-btn-secondary mt-6">Kembali</button></div></main>;
  return <main className="min-h-screen bg-black"><div className="mx-auto max-w-6xl px-4 py-6"><button onClick={() => router.back()} className="mb-5 text-zinc-400 hover:text-white">← Kembali</button><video ref={video} className="w-full rounded-xl bg-black" src={src} controls playsInline onPause={save} onEnded={save}/><h1 className="mt-6 text-3xl font-black">{movie?.title}</h1><p className="mt-2 text-sm text-zinc-500">URL video bersifat sementara dan dibuat setelah entitlement paket diverifikasi.</p></div></main>;
}
