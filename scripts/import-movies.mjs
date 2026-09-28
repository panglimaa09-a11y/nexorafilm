import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(file = '.env.local') {
  try {
    const text = readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const i = trimmed.indexOf('=');
      if (i < 1) continue;
      const key = trimmed.slice(0, i).trim();
      let value = trimmed.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[key] ??= value;
    }
  } catch {}
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib di .env.local');

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const BUCKET = 'nexora-videos';
const folder = path.resolve(process.argv.find((x) => x.startsWith('--folder='))?.split('=')[1] || 'media/movies');
const access = (process.argv.find((x) => x.startsWith('--access='))?.split('=')[1] || 'regular').toLowerCase();
const allowedExt = new Set(['.mp4', '.webm', '.mov', '.m4v']);

const { error: bucketError } = await db.storage.createBucket(BUCKET, { public: false });
if (bucketError && !/already exists|duplicate/i.test(bucketError.message)) throw bucketError;

const files = (await fs.readdir(folder, { withFileTypes: true }))
  .filter((x) => x.isFile() && allowedExt.has(path.extname(x.name).toLowerCase()))
  .map((x) => x.name);

if (!files.length) {
  console.log(`Tidak ada video di ${folder}`);
  process.exit(0);
}

const { data: plans, error: plansError } = await db.from('plans').select('id,slug').eq('active', true);
if (plansError) throw plansError;
const planMap = new Map(plans.map((p) => [p.slug, p.id]));
const accessSlugs = access === 'premium' ? ['premium', 'family'] : access === 'all' ? plans.map((p) => p.slug) : ['mobile', 'standard'];
const planIds = accessSlugs.map((slug) => planMap.get(slug)).filter(Boolean);
if (!planIds.length) throw new Error(`Paket untuk access=${access} tidak ditemukan. Pastikan SQL plans sudah dijalankan.`);

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename)).replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function storageName(filename) {
  const base = path.basename(filename, path.extname(filename)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'movie'}-${Date.now()}${path.extname(filename).toLowerCase()}`;
}
function mime(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4';
}

for (const filename of files) {
  const title = titleFromFilename(filename);
  const local = path.join(folder, filename);
  const objectPath = `movies/${storageName(filename)}`;
  console.log(`\n→ ${filename}`);
  const body = await fs.readFile(local);
  const { error: uploadError } = await db.storage.from(BUCKET).upload(objectPath, body, { contentType: mime(filename), upsert: false });
  if (uploadError) throw new Error(`Upload ${filename}: ${uploadError.message}`);

  const { data: existing } = await db.from('movies').select('id').eq('title', title).maybeSingle();
  let movieId;
  if (existing) {
    movieId = existing.id;
    const { error } = await db.from('movies').update({ video_path: objectPath, video_url: null, published: true }).eq('id', movieId);
    if (error) throw error;
    await db.from('movie_plans').delete().eq('movie_id', movieId);
  } else {
    const { data: movie, error } = await db.from('movies').insert({ title, video_path: objectPath, published: true, content_type: 'movie' }).select('id').single();
    if (error) throw error;
    movieId = movie.id;
  }
  const { error: mapError } = await db.from('movie_plans').insert(planIds.map((plan_id) => ({ movie_id: movieId, plan_id })));
  if (mapError) throw mapError;
  console.log(`  ✓ masuk database | akses: ${access}`);
}
console.log(`\nSelesai. ${files.length} video diproses.`);
