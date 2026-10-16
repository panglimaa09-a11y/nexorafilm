import { requireAdmin } from '@/lib/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';

async function createMovie(formData: FormData) {
  'use server';
  const { db } = await requireAdmin();
  const title = String(formData.get('title') || '').trim();
  if (!title) return;
  const { data: movie, error } = await db.from('movies').insert({
    title,
    synopsis: String(formData.get('synopsis') || ''),
    poster_url: String(formData.get('poster_url') || ''),
    backdrop_url: String(formData.get('backdrop_url') || ''),
    video_url: String(formData.get('video_url') || ''),
    release_year: formData.get('release_year') ? Number(formData.get('release_year')) : null,
    content_type: String(formData.get('content_type') || 'movie'),
    published: formData.get('published') === 'on'
  }).select('id').single();
  if (error) throw new Error(error.message);

  // Full token (16 Okt 2026): semua film published = 1 token, tanpa paket.
  redirect('/admin/movies');
}

export default async function NewMovie() {
  await requireAdmin();
  return <main><div className="mx-auto max-w-3xl px-6 pb-16 pt-10"><Link href="/admin/movies">← Kembali</Link><h1 className="mt-5 text-4xl font-black">Tambah Film</h1><p className="mt-2 text-zinc-400">Untuk banyak film, taruh file di <code>media/movies</code> lalu gunakan Auto Import.</p><form action={createMovie} className="glass mt-8 rounded-2xl p-6"><label>Judul<input className="input mt-2" name="title" required/></label><label className="mt-5 block">Sinopsis<textarea className="input mt-2 min-h-32" name="synopsis"/></label><div className="grid gap-4 md:grid-cols-2 mt-5"><label>Tahun<input className="input mt-2" name="release_year" type="number"/></label><label>Tipe<select className="input mt-2" name="content_type" defaultValue="movie"><option value="movie">Movie</option><option value="series">Series</option></select></label></div><label className="mt-5 block">Poster URL<input className="input mt-2" name="poster_url" placeholder="https://..."/></label><label className="mt-5 block">Backdrop URL<input className="input mt-5" name="backdrop_url" placeholder="https://..."/></label><label className="mt-5 block">Video URL<input className="input mt-2" name="video_url" placeholder="Opsional — Auto Import akan mengisi video_path"/></label><div className="mt-7 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">🎟 Akses: 1 token = 1 film (otomatis, tanpa pengaturan paket).</div><label className="mt-6 flex items-center gap-2"><input type="checkbox" name="published"/> Publish sekarang</label><button className="nexora-btn-primary mt-7 w-full">Simpan Film</button></form></div></main>
}
