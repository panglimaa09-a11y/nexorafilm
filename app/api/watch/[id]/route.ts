import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

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
    const { data: sub } = await db.from('subscriptions').select('plan_id').eq('user_id', user.id).eq('status', 'active').gt('current_period_end', new Date().toISOString()).maybeSingle();
    if (!sub) return NextResponse.json({ error: 'Subscription aktif diperlukan' }, { status: 403 });
    const { data: allowed } = await db.from('movie_plans').select('movie_id').eq('movie_id', id).eq('plan_id', sub.plan_id).maybeSingle();
    if (!allowed) return NextResponse.json({ error: 'Paket kamu tidak memiliki akses ke film ini' }, { status: 403 });
  }

  if (movie.video_url) return NextResponse.json({ title: movie.title, url: movie.video_url, expiresIn: null });
  return NextResponse.json({ error: 'Video belum tersedia' }, { status: 404 });
}
