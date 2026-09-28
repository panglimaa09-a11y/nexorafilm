# NEXORA FILM

NEXORA FILM adalah platform streaming Next.js + Supabase untuk konten video yang **kamu miliki atau kamu punya lisensi untuk tayangkan**.

## Fitur utama

- Login / signup Supabase + session refresh
- Role user/admin
- Homepage, katalog, search, detail film
- Watchlist + riwayat tontonan
- Subscription dan entitlement per film
- Admin CMS: tambah, edit, publish/unpublish film
- Akses video Regular / Premium / Semua / Custom
- Auto Import dari folder media/movies ke Supabase Storage
- Storage video private + signed URL setelah entitlement diverifikasi
- Progress video tersimpan
- Pakasir API v2 hosted checkout dan verifikasi webhook server-side

## 1. Install dan jalankan

~~~bash
npm install
cp .env.example .env.local
npm run dev
~~~

Buka http://localhost:3000.

## 2. Environment

Isi .env.local dengan URL Supabase, anon key, service role key, dan konfigurasi Pakasir berikut:

~~~env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://DOMAIN-KAMU
PAKASIR_PROJECT_SLUG=
PAKASIR_API_KEY=
PAKASIR_PAYMENT_METHOD=payment_link
~~~

Ambil slug dan API key dari detail proyek Pakasir. **Jangan pernah memakai prefix NEXT_PUBLIC_ untuk API key Pakasir atau service-role key Supabase, dan jangan commit .env.local.**

Metode payment_link mengarahkan pelanggan ke halaman checkout Pakasir. Pelanggan dapat memilih QRIS atau Virtual Account yang diaktifkan dan tersedia di proyek Pakasir. Dukungan bank/metode bergantung pada konfigurasi akun Pakasir.

## 3. Database dan aktivasi langganan

Jalankan supabase/schema.sql pada Supabase SQL Editor jika database belum disiapkan. Untuk database yang sudah ada, jalankan juga migrasi:

~~~text
supabase/migrations/20260928_pakasir_subscription_activation.sql
~~~

Migrasi tersebut membuat fungsi server-side activate_pakasir_subscription yang dipanggil setelah status pembayaran diverifikasi. Pastikan migrasi berhasil sebelum melakukan transaksi nyata.

## 4. Konfigurasi webhook Pakasir

Di pengaturan proyek Pakasir, isi webhook URL dengan URL HTTPS publik:

~~~text
https://DOMAIN-KAMU/api/payment/webhook
~~~

Jangan gunakan localhost sebagai URL webhook produksi; server Pakasir tidak dapat mengakses localhost di komputer kamu.

Webhook tidak dipercaya begitu saja: server mencari order yang cocok, memeriksa nominal, lalu memverifikasi transaksi ke API status Pakasir sebelum mengubah status pembayaran dan mengaktifkan langganan. Pengalihan kembali ke situs setelah checkout bukan bukti pembayaran berhasil.

## 5. Admin Agent (9router)

Tambahkan ke .env.local:

~~~env
NEXORA_9ROUTER_URL=http://127.0.0.1:20128/v1
NEXORA_9ROUTER_API_KEY=
NEXORA_AGENT_MODEL=gratisan
~~~

Sesuaikan model dan API key dengan konfigurasi 9router. Agent tersedia di /admin/agent setelah login sebagai admin.

## 6. Auto Import film

Masukkan video milikmu atau yang berlisensi ke media/movies/, lalu jalankan:

~~~bash
npm run import:movies -- --access=regular
npm run import:movies -- --access=premium
npm run import:movies -- --access=all
~~~

Script mengunggah video ke bucket private Supabase Storage, membuat/memperbarui metadata film, dan mengatur entitlement paket. Format yang didukung: .mp4, .webm, .mov, dan .m4v.

## 7. Catatan produksi

Sebelum menerima pembayaran pelanggan, uji checkout, callback/webhook, verifikasi status, dan aktivasi langganan pada proyek Pakasir yang sesuai. Periksa log server dan Vercel untuk kegagalan. Jangan pernah mengaktifkan langganan hanya berdasarkan query string atau redirect browser.
