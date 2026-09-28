import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin';

const BUCKET = 'nexora-videos';
const ALLOWED = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const CONFIRM_TTL_MS = 10 * 60 * 1000;

function loadLocalEnv() {
  try {
    const text = readFileSync('.env.local', 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('='); if (i < 1) continue;
      process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}
loadLocalEnv();

function adminDb() {
  return createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

function secret() {
  const value = process.env.NEXORA_AGENT_CONFIRMATION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('Secret konfirmasi AI Agent belum dikonfigurasi dengan benar.');
  }
  return value;
}

function signConfirmation(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyConfirmation(token: string) {
  const [encoded, sig] = String(token || '').split('.');
  if (!encoded || !sig) throw new Error('Konfirmasi tidak valid.');
  const expected = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('Konfirmasi tidak valid atau sudah berubah.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload.expiresAt || Date.now() > Number(payload.expiresAt)) throw new Error('Konfirmasi sudah kedaluwarsa. Silakan buat perintah baru.');
  return payload;
}

function titleFromFilename(filename: string) {
  return path.basename(filename, path.extname(filename)).replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function mime(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4';
}
function storageName(filename: string) {
  const base = path.basename(filename, path.extname(filename)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'movie'}-${Date.now()}${path.extname(filename).toLowerCase()}`;
}

async function callModel(message: string, context: unknown) {
  const base = (process.env.NEXORA_9ROUTER_URL || 'http://127.0.0.1:20128/v1').replace(/\/$/, '');
  const model = process.env.NEXORA_AGENT_MODEL || 'gratisan';
  const key = process.env.NEXORA_9ROUTER_API_KEY || 'no-key';

  const system = `Kamu adalah NEXORA FILM Admin Agent. Kamu membantu admin mengelola katalog film secara nyata. Jawab bahasa Indonesia.

Tugasmu hanya memahami maksud admin dan menghasilkan JSON valid. Jangan pernah mengaku perubahan telah dilakukan.
Gunakan format:
{"reply":"jawaban bahasa Indonesia","action":"none|list_movies|import_movies|set_access|publish|update_movie","title":"","access":"regular|premium|all|null","published":null,"new_title":"","synopsis":"","release_year":null}

Aturan:
- Pertanyaan umum: action=none dan jawab pertanyaan dengan jelas.
- Permintaan melihat katalog: action=list_movies.
- Import film: action=import_movies. Jika akses belum jelas, action=none dan tanyakan Regular, Premium, atau Semua.
- Ubah akses: action=set_access. Wajib ada judul film dan pilihan akses yang jelas.
- Publish: action=publish, published=true.
- Draft: action=publish, published=false.
- Update film: action=update_movie. Isi hanya field yang diminta.
- Jangan menebak judul film atau mengarang data katalog.
- Jangan menyatakan perubahan sudah dilakukan.
- Perubahan hanya dilakukan server setelah konfirmasi admin.
- Balas dengan satu objek JSON, tanpa Markdown atau code fence.

Context katalog: ${JSON.stringify(context)}`;

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key !== 'no-key' ? { Authorization: `Bearer ${key}` } : {})
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: message }
      ]
    })
  });

  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(`9router HTTP ${res.status}: ${responseText.slice(0, 1000)}`);
  }

  function getContent(value: any): string {
    const content =
      value?.choices?.[0]?.message?.content ??
      value?.choices?.[0]?.delta?.content ??
      value?.choices?.[0]?.text ??
      value?.message?.content ??
      value?.response ??
      value?.output_text;

    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((part: any) =>
        typeof part === 'string' ? part : String(part?.text ?? '')
      ).join('');
    }
    return '';
  }

  let data: any = null;
  let content = '';

  // Format JSON standar dari endpoint OpenAI-compatible.
  try {
    data = JSON.parse(responseText);
    content = getContent(data);
  } catch {
    data = null;
  }

  // Format SSE: setiap bagian dapat diawali dengan "data:".
  if (!content && responseText.includes('data:')) {
    const pieces: string[] = [];

    for (const line of responseText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const chunk = JSON.parse(payload);
        const part = getContent(chunk);
        if (part) pieces.push(part);
      } catch {
        // Abaikan potongan SSE yang bukan JSON lengkap.
      }
    }

    content = pieces.join('');
  }

  // Beberapa provider mengembalikan JSON langsung di dalam content.
  if (!content && data && typeof data === 'object') {
    content = getContent(data);
  }

  if (!content.trim()) {
    throw new Error(
      `Respons 9router kosong atau formatnya tidak dikenali. Awal respons: ${responseText.slice(0, 300)}`
    );
  }

  const cleaned = content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof parsed.action === 'string' &&
        ['none', 'list_movies', 'import_movies', 'set_access', 'publish', 'update_movie'].includes(parsed.action)
      ) {
        return {
          reply: typeof parsed.reply === 'string' ? parsed.reply : '',
          action: parsed.action,
          title: typeof parsed.title === 'string' ? parsed.title : '',
          access: parsed.access ?? null,
          published: typeof parsed.published === 'boolean' ? parsed.published : null,
          new_title: typeof parsed.new_title === 'string' ? parsed.new_title : '',
          synopsis: typeof parsed.synopsis === 'string' ? parsed.synopsis : '',
          release_year: parsed.release_year ?? null
        };
      }
    } catch {
      // Coba kandidat JSON berikutnya.
    }
  }

  // Jawaban percakapan biasa tidak boleh dianggap sebagai perintah perubahan.
  return {
    reply: cleaned,
    action: 'none',
    title: '',
    access: null,
    published: null,
    new_title: '',
    synopsis: '',
    release_year: null
  };
}
async function planIds(db: any, access: string) {
  const { data: plans, error } = await db.from('plans').select('id,slug').eq('active', true);
  if (error) throw error;
  const slugs = access === 'premium' ? ['premium', 'family'] : access === 'all' ? (plans || []).map((p: any) => p.slug) : ['mobile', 'standard'];
  return (plans || []).filter((p: any) => slugs.includes(p.slug)).map((p: any) => p.id);
}

async function listImportFiles(folder: string) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return entries.filter((x) => x.isFile() && ALLOWED.has(path.extname(x.name).toLowerCase())).map((x) => x.name);
}

function questionFor(action: string, details: Record<string, unknown>) {
  if (action === 'import_movies') return `Saya siap mengimpor ${details.count} film dari media/movies dengan akses ${details.access}. Saya belum menjalankan apa pun. Lanjutkan?`;
  if (action === 'set_access') return `Saya akan mengubah akses "${details.title}" menjadi ${details.access}. Perubahan belum dilakukan. Lanjutkan?`;
  if (action === 'publish') return `Saya akan mengubah "${details.title}" menjadi ${details.published ? 'PUBLISHED' : 'DRAFT'}. Perubahan belum dilakukan. Lanjutkan?`;
  if (action === 'update_movie') return `Saya akan mengubah ${details.title} dengan data yang diminta. Perubahan belum dilakukan. Lanjutkan?`;
  return 'Saya memahami perintahnya, tetapi perlu konfirmasi sebelum melakukan perubahan.';
}

async function executeProposal(service: any, proposal: any) {
  const action = proposal.action;
  if (action === 'import_movies') {
    const folder = path.resolve(String(proposal.folder || 'media/movies'));
    const files = await listImportFiles(folder);
    const selected = files.filter((f) => proposal.files.includes(f));
    await service.storage.createBucket(BUCKET, { public: false }).catch(() => null);
    const ids = await planIds(service, proposal.access);
    let imported = 0;
    for (const filename of selected) {
      const title = titleFromFilename(filename);
      const local = path.join(folder, filename);
      const objectPath = `movies/${storageName(filename)}`;
      const upload = await service.storage.from(BUCKET).upload(objectPath, await fs.readFile(local), { contentType: mime(filename), upsert: false });
      if (upload.error) throw upload.error;
      const existing = await service.from('movies').select('id').eq('title', title).maybeSingle();
      let movieId = existing.data?.id;
      if (movieId) {
        const { error } = await service.from('movies').update({ video_path: objectPath, video_url: null, published: true }).eq('id', movieId); if (error) throw error;
        await service.from('movie_plans').delete().eq('movie_id', movieId);
      } else {
        const { data, error } = await service.from('movies').insert({ title, video_path: objectPath, published: true, content_type: 'movie' }).select('id').single(); if (error) throw error; movieId = data.id;
      }
      if (ids.length) { const { error } = await service.from('movie_plans').insert(ids.map((plan_id: string) => ({ movie_id: movieId, plan_id }))); if (error) throw error; }
      imported++;
    }
    return `Konfirmasi diterima. Auto Import selesai: ${imported} film diproses dengan akses ${proposal.access}.`;
  }

  const { data: movie, error: movieError } = await service.from('movies').select('id,title').eq('id', proposal.movieId).maybeSingle();
  if (movieError) throw movieError;
  if (!movie) throw new Error('Film target sudah tidak ditemukan. Saya tidak melakukan perubahan.');

  if (action === 'set_access') {
    const ids = await planIds(service, proposal.access);
    await service.from('movie_plans').delete().eq('movie_id', movie.id);
    if (ids.length) { const { error } = await service.from('movie_plans').insert(ids.map((plan_id: string) => ({ movie_id: movie.id, plan_id }))); if (error) throw error; }
    return `Konfirmasi diterima. Akses "${movie.title}" diubah ke ${proposal.access}.`;
  }
  if (action === 'publish') {
    const { error } = await service.from('movies').update({ published: proposal.published }).eq('id', movie.id); if (error) throw error;
    return `Konfirmasi diterima. ${movie.title} sekarang ${proposal.published ? 'published' : 'draft'}.`;
  }
  if (action === 'update_movie') {
    const patch: any = proposal.patch || {};
    if (!Object.keys(patch).length) throw new Error('Tidak ada perubahan yang disetujui.');
    const { error } = await service.from('movies').update(patch).eq('id', movie.id); if (error) throw error;
    return `Konfirmasi diterima. ${movie.title} berhasil diperbarui.`;
  }
  throw new Error('Aksi konfirmasi tidak dikenal.');
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const message = String(body?.message || '').trim();
    const token = String(body?.confirmationToken || '').trim();
    const confirm = body?.confirm === true;
    const service = adminDb();

    if (confirm && token) {
      const proposal = verifyConfirmation(token);
      const reply = await executeProposal(service, proposal);
      return NextResponse.json({ reply, action: proposal.action, confirmed: true });
    }

    if (!message) return NextResponse.json({ reply: 'Tulis perintah admin dulu.' }, { status: 400 });

    const { data: movies } = await service.from('movies').select('id,title,published,release_year,video_path,video_url,movie_plans(plan:plans(slug,name))').order('created_at', { ascending: false }).limit(100);
    const context = (movies || []).map((m: any) => ({ id: m.id, title: m.title, published: m.published, year: m.release_year, access: (m.movie_plans || []).map((x: any) => x.plan?.slug).filter(Boolean) }));
    const intent = await callModel(message, context);
    const action = intent.action || 'none';

    if (action === 'list_movies') {
      return NextResponse.json({ reply: intent.reply || `Ada ${context.length} film.`, action, movies: context.slice(0, 30) });
    }

    if (!['import_movies', 'set_access', 'publish', 'update_movie'].includes(action)) {
      return NextResponse.json({ reply: intent.reply || 'Saya perlu informasi tambahan sebelum melakukan perubahan.', action: 'none' });
    }

    if (action === 'import_movies') {
      const access = ['regular', 'premium', 'all'].includes(intent.access) ? intent.access : null;
      if (!access) return NextResponse.json({ reply: 'Sebelum saya import: film ini mau diberi akses Regular, Premium, atau Semua paket?', needsInput: true, action: 'none' });
      const folder = path.resolve(String(body?.folder || 'media/movies'));
      let files: string[];
      try { files = await listImportFiles(folder); } catch { return NextResponse.json({ reply: `Folder ${folder} tidak ditemukan. Buat folder media/movies dan masukkan video terlebih dahulu.`, action: 'none' }); }
      if (!files.length) return NextResponse.json({ reply: 'Saya tidak menemukan file video di media/movies. Tidak ada perubahan dilakukan.', action: 'none' });
      const proposal = { action, folder, files, access, count: files.length, expiresAt: Date.now() + CONFIRM_TTL_MS };
      const confirmationToken = signConfirmation(proposal);
      return NextResponse.json({ reply: questionFor(action, proposal), action, needsConfirmation: true, confirmationToken, summary: { count: files.length, access, files: files.slice(0, 20) } });
    }

    const title = String(intent.title || '').trim();
    if (!title) return NextResponse.json({ reply: 'Sebelum saya mengubah film: sebutkan judul film yang ingin diubah.', needsInput: true, action: 'none' });
    const { data: found } = await service.from('movies').select('id,title').ilike('title', `%${title}%`).limit(5);
    if (!found?.length) return NextResponse.json({ reply: `Film dengan judul "${title}" tidak ditemukan. Saya tidak melakukan perubahan.`, action: 'none' });
    if (found.length > 1) return NextResponse.json({ reply: `Ada beberapa film yang cocok: ${found.map((m: any) => m.title).join(', ')}. Sebutkan judul yang lebih spesifik.`, action: 'none' });
    const movie = found[0];

    if (action === 'set_access') {
      const access = ['regular', 'premium', 'all'].includes(intent.access) ? intent.access : null;
      if (!access) return NextResponse.json({ reply: `Untuk "${movie.title}", pilih akses Regular, Premium, atau Semua paket.`, needsInput: true, action: 'none' });
      const proposal = { action, movieId: movie.id, title: movie.title, access, expiresAt: Date.now() + CONFIRM_TTL_MS };
      const confirmationToken = signConfirmation(proposal);
      return NextResponse.json({ reply: questionFor(action, proposal), action, needsConfirmation: true, confirmationToken });
    }

    if (action === 'publish') {
      if (typeof intent.published !== 'boolean') return NextResponse.json({ reply: 'Mau film ini dibuat Published atau Draft?', needsInput: true, action: 'none' });
      const proposal = { action, movieId: movie.id, title: movie.title, published: intent.published, expiresAt: Date.now() + CONFIRM_TTL_MS };
      const confirmationToken = signConfirmation(proposal);
      return NextResponse.json({ reply: questionFor(action, proposal), action, needsConfirmation: true, confirmationToken });
    }

    const patch: any = {};
    if (intent.new_title) patch.title = String(intent.new_title);
    if (typeof intent.synopsis === 'string' && intent.synopsis) patch.synopsis = intent.synopsis;
    if (intent.release_year) patch.release_year = Number(intent.release_year);
    if (!Object.keys(patch).length) return NextResponse.json({ reply: 'Sebutkan perubahan yang ingin dilakukan pada film tersebut.', needsInput: true, action: 'none' });
    const proposal = { action, movieId: movie.id, title: movie.title, patch, expiresAt: Date.now() + CONFIRM_TTL_MS };
    const confirmationToken = signConfirmation(proposal);
    return NextResponse.json({ reply: questionFor(action, proposal), action, needsConfirmation: true, confirmationToken });
  } catch (error: any) {
    return NextResponse.json({ reply: error?.message || 'Agent error' }, { status: 500 });
  }
}
