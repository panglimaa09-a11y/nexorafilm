import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { extractYouTubeId, youTubeEmbedUrl } from '@/lib/youtube';
import { spendTokenForMovie } from '@/lib/entitlements';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Login diperlukan' }, { status: 401 });

  const { data: movie, error: movieError } = await db.from('movies').select('id,title,video_url').eq('id', id).eq('published', true).maybeSingle();
  if (movieError) return NextResponse.json({ error: 'Gagal memuat data film' }, { status: 500 });
  if (!movie) return NextResponse.json({ error: 'Film tidak ditemukan' }, { status: 404 });

  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') {
    // Full token (16 Okt 2026): 1 token = 1 film, akses 48 jam.
    const result = await spendTokenForMovie(user.id, id);
    if (result === 'insufficient')
      return NextResponse.json({ error: 'Token tidak cukup. Beli token dulu untuk menonton.', needTokens: true }, { status: 402 });
    if (result !== 'spent' && result !== 'unlocked')
      return NextResponse.json({ error: 'Gagal memproses token' }, { status: 500 });
  }

  if (movie.video_url) {
    const ytId = extractYouTubeId(movie.video_url);
    if (ytId) {
      return NextResponse.json({ title: movie.title, kind: 'youtube', url: movie.video_url, embedUrl: youTubeEmbedUrl(ytId), expiresIn: null });
    }
    return NextResponse.json({ title: movie.title, kind: 'file', url: movie.video_url, expiresIn: null });
  }
  return NextResponse.json({ error: 'Video belum tersedia' }, { status: 404 });
}
