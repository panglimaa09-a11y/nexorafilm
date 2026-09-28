# NEXORA FILM

NEXORA FILM adalah platform streaming Next.js + Supabase untuk konten video yang **kamu miliki atau kamu punya lisensi untuk tayangkan**.

## Fitur utama

- Login / signup Supabase + session refresh
- Role user/admin
- Homepage, katalog, search, detail film
- Watchlist + riwayat tontonan
- Subscription dan entitlement per film
- Admin CMS: tambah, edit, publish/unpublish film
- **Akses video Regular / Premium / Semua / Custom**
- **Auto Import:** taruh banyak video ke `media/movies`, jalankan satu perintah, film masuk database + Supabase Storage otomatis
- Storage video private + signed URL setelah entitlement diverifikasi
- Progress video tersimpan
- Midtrans Snap checkout + webhook

## 1. Install

```bash
npm install
```

## 2. Environment

```bash
cp .env.example .env.local
```

Isi:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MIDTRANS_SERVER_KEY=
MIDTRANS_IS_PRODUCTION=false
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` adalah rahasia server. Jangan masukkan ke client, GitHub, atau screenshot.

## 3. Database

Jalankan `supabase/schema.sql` di Supabase SQL Editor.

Schema ini juga menambahkan:

- `movies.video_path`
- fungsi `public.is_admin()`
- policy admin untuk `movies`, `movie_plans`, dan `plans`

Jika database lama sudah pernah dibuat, **jalankan ulang file SQL** karena semua statement dibuat idempotent dengan `if not exists` / `drop policy if exists` dan kolom `video_path` memakai `add column if not exists`.

Untuk akun admin pertama:

```sql
select id, email, email_confirmed_at from auth.users;
select id, display_name, role from public.profiles;

update public.profiles
set role = 'admin'
where id = 'UUID_AKUN_KAMU';
```

Jangan mengubah `auth.users.confirmed_at` secara manual.

## 4. Jalankan

```bash
npm run dev
```

Buka `http://localhost:3000`.

## 5. Auto Import — tanpa input film satu per satu

Buat folder:

```text
media/movies/
```

Masukkan file video milikmu/lisensimu, misalnya:

```text
media/movies/
├── Film Pertama.mp4
├── Film Kedua.mp4
└── Film Ketiga.webm
```

Lalu:

### Regular
Mobile + Standard:

```bash
npm run import:movies -- --access=regular
```

### Premium
Premium + Family:

```bash
npm run import:movies -- --access=premium
```

### Semua paket

```bash
npm run import:movies -- --access=all
```

Format yang dibaca: `.mp4`, `.webm`, `.mov`, `.m4v`.

Nama file otomatis menjadi judul. Script akan:

1. membaca video dari `media/movies`
2. membuat bucket private `nexora-videos` jika belum ada
3. upload video ke Supabase Storage
4. membuat / memperbarui record film
5. mengatur entitlement paket
6. publish film

Poster, sinopsis, tahun, dan metadata tambahan bisa diedit dari CMS setelah import. Untuk katalog besar, gunakan pipeline metadata/thumbnail terpisah; jangan mengunduh atau menyalin film berhak cipta tanpa izin.

## 6. Mengubah Regular ↔ Premium

Masuk sebagai admin → **Kelola Film** → **Edit**.

Pilihan akses:

- **Regular:** Mobile + Standard
- **Premium:** Premium + Family
- **Semua paket**
- **Custom:** pilih paket sendiri

Perubahan entitlement langsung menentukan siapa yang boleh membuka player.

## 7. Keamanan video

Video hasil Auto Import disimpan di bucket **private**. Browser tidak mendapatkan URL permanen. Saat user menekan Putar, server memeriksa:

1. user sudah login
2. film published
3. subscription masih aktif
4. paket subscription punya entitlement untuk film
5. server membuat signed URL sementara

Ini lebih aman daripada menyimpan URL public video di halaman.

## 8. Midtrans

Sandbox:

```env
MIDTRANS_IS_PRODUCTION=false
```

Webhook produksi harus menggunakan URL HTTPS publik:

```text
https://DOMAIN-KAMU/api/payment/webhook
```

Untuk local development, gunakan tunnel HTTPS jika Midtrans perlu mengakses webhook lokal.

## 9. Catatan produksi

Untuk katalog besar/komersial, tambahkan video transcoding HLS/DASH, adaptive bitrate, CDN, signed playback policy, thumbnail generator, subtitle, series/seasons/episodes, rate limiting, audit log, payment reconciliation, refund/cancellation, dan monitoring.


## 🤖 NEXORA Admin Agent

Buka `/admin/agent` setelah login sebagai admin. Agent menggunakan endpoint OpenAI-compatible 9router yang dikonfigurasi lewat `.env.local`. Agent dapat menjalankan pekerjaan katalog nyata: melihat daftar film, Auto Import dari `media/movies`, mengubah akses Regular/Premium/semua paket, publish/draft, dan mengubah judul/sinopsis/tahun.

Tambahkan ke `.env.local`:

```env
NEXORA_9ROUTER_URL=http://127.0.0.1:20128/v1
NEXORA_9ROUTER_API_KEY=
NEXORA_AGENT_MODEL=gratisan
```

Jika 9router kamu memakai API key atau model lain, isi sesuai konfigurasi 9router kamu. `SUPABASE_SERVICE_ROLE_KEY` tetap hanya di server.

Contoh perintah Agent:
- `Tampilkan daftar film`
- `Jadikan Film A premium`
- `Publish Film A`
- `Jadikan Film A regular`
- `Import semua film dari media/movies dengan akses premium`

Catatan: video yang diimport harus merupakan konten yang kamu miliki atau punya lisensi untuk ditayangkan.


## Admin Agent

Agent selalu meminta konfirmasi sebelum perubahan katalog.


## Creator Studio: follows, analytics, safety scan

Run these SQL files in Supabase SQL Editor in order, after the existing creator and Shorts migrations:

1. `supabase/creator-studio.sql`
2. `supabase/admin-analytics-shorts-only.sql`
3. `supabase/creator-follow-analytics-safety.sql`

Creator Studio community uploads are Shorts only. Public creator profiles support follow/unfollow. A signed-in creator can open `/creator/analytics` to see follower count, published Shorts, counted playback requests, scan states, and initial monetization eligibility targets. The targets shown are 1,000 followers and 10,000 counted playback requests; they are not a promise of revenue or payout. Payment/payout rails and final eligibility approval must be implemented separately.

### Automated video safety scan with Gemini

Set this server-only environment variable in Vercel and local `.env.local`:

```env
GEMINI_API_KEY=your_google_ai_studio_api_key
```

The backend uses Gemini video understanding to inspect the uploaded video's actual frames/audio via Gemini Files API, then classifies it as `safe`, `blocked`, or `review`. The key stays on the server. It uses `gemini-2.5-flash` by default in the scanner. Confirm model availability and the current free-tier quotas/pricing for your Google AI Studio account.

For Shorts, a `safe` result specifically from Gemini automatically publishes the video when its creator channel is active. `blocked` results are rejected; `review`, `unavailable`, timeouts, invalid responses, and other uncertain results stay unpublished for admin review. Other moderation providers continue to use manual review. A passing AI scan is not a guarantee: AI moderation can miss violations, so keep reporting and admin takedown tools available.

Gemini Files API uploads are deleted after the scan where possible. Video scanning runs synchronously during upload, so long videos or slow processing can time out in serverless hosting; such videos remain unpublished and require manual review. For production-scale uploads, use an asynchronous queue/worker.

An optional fallback adapter for another moderation service is still supported through `VIDEO_MODERATION_API_URL` and `VIDEO_MODERATION_API_KEY`. That endpoint must accept JSON with `video_url`, `video_id`, `title`, `description`, `task`, and `required_checks`, then return a JSON decision. Do not configure both unless you intentionally want Gemini to take precedence.

Playback counts currently record requests to the signed playback route, not verified unique viewers. They can include repeat requests and must be fraud-filtered before being used to calculate actual earnings.
