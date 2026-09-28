import { requireAdmin } from '@/lib/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

async function updateMovie(id:string, formData:FormData) {
  'use server';
  const { db } = await requireAdmin();
  const { error } = await db.from('movies').update({
    title: String(formData.get('title') || ''), synopsis: String(formData.get('synopsis') || ''), poster_url: String(formData.get('poster_url') || ''), backdrop_url: String(formData.get('backdrop_url') || ''), video_url: String(formData.get('video_url') || ''), release_year: formData.get('release_year') ? Number(formData.get('release_year')) : null, content_type: String(formData.get('content_type') || 'movie'), published: formData.get('published') === 'on'
  }).eq('id', id);
  if (error) throw new Error(error.message);
  const mode = String(formData.get('access_mode') || 'regular');
  const { data: plans } = await db.from('plans').select('id,slug').eq('active', true);
  const selected = mode === 'premium' ? ['premium', 'family'] : mode === 'all' ? plans?.map((p:any) => p.slug) || [] : mode === 'custom' ? formData.getAll('plans').map(String) : ['mobile', 'standard'];
  const ids = (plans || []).filter((p:any) => selected.includes(p.slug)).map((p:any) => p.id);
  await db.from('movie_plans').delete().eq('movie_id', id);
  if (ids.length) await db.from('movie_plans').insert(ids.map((plan_id:string) => ({ movie_id:id, plan_id })));
  redirect('/admin/movies');
}

export default async function EditMovie({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const {db}=await requireAdmin();
  const [{data:m},{data:plans=[]},{data:links=[]}] = await Promise.all([
    db.from('movies').select('*').eq('id',id).maybeSingle(),
    db.from('plans').select('id,name,slug').eq('active',true).order('price_monthly'),
    db.from('movie_plans').select('plan_id,plan:plans(slug)').eq('movie_id',id)
  ]);
  if(!m)notFound();
  const selected=new Set((links ?? []).map((x:any)=>x.plan_id));
  const slugs=new Set((links ?? []).map((x:any)=>x.plan?.slug));
  const mode = slugs.has('premium') || slugs.has('family') ? (slugs.has('mobile') || slugs.has('standard') ? 'custom' : 'premium') : (slugs.has('mobile') || slugs.has('standard') ? 'regular' : 'custom');
  return <main><div className="mx-auto max-w-3xl px-6 pb-16 pt-10"><Link href="/admin/movies">â† Kembali</Link><h1 className="mt-5 text-4xl font-black">Edit Film</h1><form action={updateMovie.bind(null,id)} className="glass mt-8 rounded-2xl p-6"><label>Judul<input className="input mt-2" name="title" defaultValue={m.title}/></label><label className="mt-5 block">Sinopsis<textarea className="input mt-2 min-h-32" name="synopsis" defaultValue={m.synopsis||''}/></label><div className="grid gap-4 md:grid-cols-2 mt-5"><label>Tahun<input className="input mt-2" name="release_year" type="number" defaultValue={m.release_year||''}/></label><label>Tipe<select className="input mt-2" name="content_type" defaultValue={m.content_type}><option value="movie">Movie</option><option value="series">Series</option></select></label></div><label className="mt-5 block">Poster URL<input className="input mt-2" name="poster_url" defaultValue={m.poster_url||''}/></label><label className="mt-5 block">Backdrop URL<input className="input mt-2" name="backdrop_url" defaultValue={m.backdrop_url||''}/></label><label className="mt-5 block">Video URL<input className="input mt-2" name="video_url" defaultValue={m.video_url||''}/></label><div className="mt-7"><p className="font-semibold">Akses video</p><select className="input mt-3" name="access_mode" defaultValue={mode}><option value="regular">Regular â€” Mobile + Standard</option><option value="premium">Premium â€” Premium + Family</option><option value="all">Semua paket</option><option value="custom">Custom</option></select><div className="mt-3 grid gap-2 md:grid-cols-2">{(plans ?? []).map((p:any)=><label key={p.id} className="flex items-center gap-2 rounded-lg bg-white/5 p-3"><input type="checkbox" name="plans" value={p.slug} defaultChecked={selected.has(p.id)}/>{p.name}</label>)}</div></div><label className="mt-6 flex items-center gap-2"><input type="checkbox" name="published" defaultChecked={m.published}/> Published</label><button className="nexora-btn-primary mt-7 w-full">Simpan Perubahan</button></form></div></main>
}
