import Link from 'next/link';
import Navbar from '@/components/Navbar';
import MovieRow from '@/components/MovieRow';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="mb-3 text-xs font-bold uppercase tracking-[.24em] text-red-400">
      {children}
    </p>
  );
}

export default async function Home() {
  const db = await createClient();

  const { data, error } = await db
    .from('movies')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(20);

  const movies = data ?? [];

  if (error) {
    console.error('NEXORA FILM movies query error:', error.message);
  }

  // Creator uploads live in creator_videos, not the legacy movies table.
  // Use the server-only service client so public visitors can see published items
  // while the underlying Storage bucket remains private.
  let creatorVideos: Array<{ id: string; title: string; description: string | null; channel_id: string; created_at: string; thumbnailUrl: string | null; channelName: string; handle: string }> = [];
  let channelCount = 0;
  try {
    const admin = createAdminClient();
    const { data: channels } = await admin
      .from('creator_channels')
      .select('id,name,handle')
      .eq('status', 'active');
    const channelMap = new Map((channels ?? []).map((channel: any) => [channel.id, channel]));
    channelCount = channelMap.size;
    const channelIds = Array.from(channelMap.keys());
    if (channelIds.length) {
      const { data: published } = await admin
        .from('creator_videos')
        .select('id,title,description,channel_id,created_at,thumbnail_path')
        .eq('status', 'published')
        .eq('video_type', 'short')
        .in('channel_id', channelIds)
        .order('created_at', { ascending: false })
        .limit(12);
      creatorVideos = await Promise.all((published ?? []).map(async (video: any) => {
        let thumbnailUrl: string | null = null;
        if (video.thumbnail_path) {
          const { data: signed } = await admin.storage.from('creator-videos').createSignedUrl(video.thumbnail_path, 3600);
          thumbnailUrl = signed?.signedUrl ?? null;
        }
        const channel: any = channelMap.get(video.channel_id);
        return { id: video.id, title: video.title, description: video.description, channel_id: video.channel_id, created_at: video.created_at, thumbnailUrl, channelName: channel?.name ?? 'Kreator Nexora', handle: channel?.handle ?? '' };
      }));
    }
  } catch (creatorCatalogError) {
    console.error('NEXORA FILM creator catalog error:', creatorCatalogError);
  }

  let plans: any[] = [];
  try {
    const { data: plansResult } = await db
      .from('plans')
      .select('*')
      .eq('active', true)
      .order('price_monthly');
    plans = plansResult ?? [];
  } catch (plansError) {
    console.error('NEXORA FILM plans query error:', plansError);
  }

  const hero = movies[0] ?? null;
  const heroImage = hero
    ? String(
        (hero as any).backdrop_url ||
        (hero as any).poster_url ||
        (hero as any).poster ||
        ''
      )
    : '';

  const stats = [
    { value: String(movies.length), label: 'Film' },
    { value: String(channelCount), label: 'Kreator' },
    { value: String(creatorVideos.length), label: 'Shorts' },
    { value: 'HD', label: 'Kualitas' },
  ];

  const features = [
    {
      eyebrow: 'VIDEO PENDEK',
      title: 'Nexora Shorts',
      description: 'Video vertikal singkat untuk momen paling seru dari kreator.',
      href: '/shorts',
      action: 'Buka Shorts',
    },
    {
      eyebrow: 'KOMUNITAS',
      title: 'Temukan Kreator',
      description: 'Dukung kreator favoritmu dan jadi bagian dari komunitas.',
      href: '/creators',
      action: 'Jelajahi Kreator',
    },
    {
      eyebrow: 'RUANG KREATOR',
      title: 'Creator Studio',
      description: 'Kelola kontenmu lewat dashboard kreator yang simpel.',
      href: '/creator',
      action: 'Buka Studio',
    },
  ];

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <Navbar />

      {/* ── 1. HERO ─────────────────────────────────────────── */}
      <section
        className={`relative flex min-h-[600px] items-end overflow-hidden md:min-h-[720px] ${
          heroImage ? 'home-hero-has-image' : ''
        }`}
        style={
          heroImage
            ? {
                backgroundImage: `linear-gradient(90deg, #080808 0%, rgba(8,8,8,.82) 42%, rgba(8,8,8,.2) 100%), linear-gradient(0deg, #080808 0%, transparent 65%), url("${heroImage}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        <div
          className="pointer-events-none absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full bg-red-600/20 blur-[140px]"
          aria-hidden="true"
        />
        <div className="home-hero-glow" aria-hidden="true" />

        <div className="relative z-10 w-full max-w-4xl px-6 pb-16 pt-36 md:px-14 md:pb-24">
          <div className="mb-5 flex items-center gap-3">
            <span className="h-1 w-10 rounded-full bg-red-500" />
            <span className="text-xs font-bold uppercase tracking-[.28em] text-red-400">
              NEXORA FILM
            </span>
          </div>

          {hero ? (
            <>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[.2em] text-zinc-300">
                Pilihan untuk ditonton
              </p>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-7xl">
                {hero.title}
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
                {hero.synopsis || 'Temukan tontonan pilihanmu di Nexora Film.'}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={`/movies/${hero.id}`} className="nexora-btn-primary">
                  Mulai Nonton
                </Link>
                <Link href="/movies" className="nexora-btn-secondary">
                  Jelajahi Film
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                RUANG TONTONANMU
              </div>
              <h1 className="max-w-3xl text-5xl font-black leading-[.98] tracking-tight sm:text-6xl md:text-8xl">
                Cerita hebat
                <br />
                <span className="text-red-500">dimulai di sini.</span>
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
                Jelajahi katalog film, temukan kreator, dan nikmati video
                pendek di satu tempat. Konten film akan muncul di sini
                setelah tersedia dan dipublikasikan.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/movies" className="nexora-btn-primary">
                  Jelajahi Film
                </Link>
                <Link href="/shorts" className="nexora-btn-secondary">
                  Jelajahi Shorts
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="relative z-10 mx-auto max-w-[1600px] px-5 sm:px-8 md:px-14">
        {/* ── 2. STATS ──────────────────────────────────────── */}
        <section aria-label="Statistik" className="border-b border-white/[.06] py-10">
          <dl className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="order-2 mt-1 block text-sm font-medium text-zinc-400">{s.label}</dt>
                <dd className="order-1 text-4xl font-extrabold tracking-tight">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── 3. TRENDING ───────────────────────────────────── */}
        <section aria-labelledby="trending-heading" className="py-14 md:py-20">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Koleksi</Eyebrow>
              <h2 id="trending-heading" className="text-3xl font-extrabold tracking-tight md:text-4xl">
                Sedang Trending
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Film-film pilihan yang paling banyak ditonton minggu ini.
              </p>
            </div>
            <Link href="/movies" className="text-sm font-semibold text-zinc-300 transition hover:text-white">
              Lihat semua film →
            </Link>
          </div>

          {movies.length > 0 ? (
            <MovieRow title="" movies={movies} />
          ) : (
            <div className="home-empty-state">
              <div className="mb-4 text-3xl text-zinc-600" aria-hidden="true">N</div>
              <h3 className="text-lg font-bold">Katalog sedang menunggu konten</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-400">
                Belum ada film yang dipublikasikan. Film akan ditampilkan
                otomatis setelah tersedia di database dan status publikasinya aktif.
              </p>
              <Link href="/movies" className="nexora-btn-secondary mt-6">
                Buka katalog
              </Link>
            </div>
          )}
        </section>

        {/* ── 4. SHORTS ─────────────────────────────────────── */}
        <section aria-labelledby="shorts-heading" className="border-t border-white/[.06] py-14 md:py-20">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Video pendek</Eyebrow>
              <h2 id="shorts-heading" className="text-3xl font-extrabold tracking-tight md:text-4xl">
                Shorts Pilihan
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Potongan momen paling seru dari para kreator, format vertikal.
              </p>
            </div>
            <Link href="/shorts" className="text-sm font-semibold text-zinc-300 transition hover:text-white">
              Semua shorts →
            </Link>
          </div>

          {creatorVideos.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {creatorVideos.map((video) => (
                <Link
                  key={video.id}
                  href={`/creator-watch/${video.id}`}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] transition hover:-translate-y-1 hover:border-red-500/40 hover:bg-white/[.06]"
                >
                  <div className="relative aspect-video overflow-hidden bg-zinc-900">
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt={`Thumbnail ${video.title}`}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-800 to-black text-4xl font-black text-red-500">
                        N
                      </div>
                    )}
                    <span className="absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition group-hover:opacity-100">
                      ▶
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-2 text-base font-bold">{video.title}</h3>
                    <p className="mt-2 text-xs text-zinc-400">
                      @{video.handle || 'kreator'} · {video.channelName}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 p-7 text-sm text-zinc-500">
              Belum ada video kreator yang dipublikasikan. Video akan tampil otomatis
              setelah statusnya menjadi <code>published</code> dan channel aktif.
            </div>
          )}
        </section>

        {/* ── 5. KREATOR ────────────────────────────────────── */}
        <section aria-labelledby="kreator-heading" className="border-t border-white/[.06] py-14 md:py-20">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0c0c0d] p-8 md:p-14">
            <div
              className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-red-600/15 blur-[120px]"
              aria-hidden="true"
            />
            <div className="relative grid items-center gap-10 lg:grid-cols-2">
              <div>
                <Eyebrow>Untuk kreator</Eyebrow>
                <h2 id="kreator-heading" className="text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
                  Buat. Upload.
                  <br />
                  Dapatkan penonton.
                </h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-zinc-400">
                  Upload videomu ke Nexora Film dan jangkau ribuan penonton.
                  Tanpa ribet, langsung tayang setelah disetujui.
                </p>
                <Link href="/creator" className="nexora-btn-primary mt-8">
                  Jadi Kreator
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { title: 'Upload', desc: 'Mudah & cepat' },
                  { title: 'Analitik', desc: 'Real-time' },
                  { title: 'Monetisasi', desc: 'Bagi hasil' },
                ].map((k) => (
                  <div
                    key={k.title}
                    className="rounded-2xl border border-white/10 bg-white/[.03] p-5 text-center"
                  >
                    <p className="text-lg font-bold">{k.title}</p>
                    <p className="mt-1 text-xs text-zinc-400">{k.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. FITUR ──────────────────────────────────────── */}
        <section aria-labelledby="fitur-heading" className="border-t border-white/[.06] py-14 md:py-20">
          <Eyebrow>Fitur</Eyebrow>
          <h2 id="fitur-heading" className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Semua dalam satu tempat
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {features.map((feature, index) => (
              <article
                key={feature.href}
                className="group rounded-2xl border border-white/10 bg-white/[.03] p-7 transition hover:-translate-y-1 hover:border-red-500/40"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-[.24em] text-zinc-400">
                    {feature.eyebrow}
                  </span>
                  <span className="text-2xl font-light text-white/50" aria-hidden="true">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-10 text-2xl font-bold tracking-tight">{feature.title}</h3>
                <p className="mt-3 min-h-12 text-sm leading-6 text-zinc-400">
                  {feature.description}
                </p>
                <Link
                  href={feature.href}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-red-400 transition group-hover:gap-3"
                >
                  {feature.action}
                  <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        {/* ── 7. PAKET ──────────────────────────────────────── */}
        <section aria-labelledby="paket-heading" className="border-t border-white/[.06] py-14 md:py-20">
          <div className="mb-8">
            <Eyebrow>Langganan</Eyebrow>
            <h2 id="paket-heading" className="text-3xl font-extrabold tracking-tight md:text-4xl">
              Pilih paketmu
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
              Akses ditentukan oleh subscription aktifmu. Bisa upgrade kapan saja.
            </p>
          </div>

          {plans.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-3">
              {plans.slice(0, 3).map((plan: any, i: number) => {
                const highlight = i === plans.slice(0, 3).length - 1 && plans.slice(0, 3).length > 1;
                return (
                  <article
                    key={plan.id}
                    className={`relative rounded-2xl border p-7 transition hover:-translate-y-1 ${
                      highlight
                        ? 'border-red-500/60 bg-red-950/20'
                        : 'border-white/10 bg-white/[.03]'
                    }`}
                  >
                    {highlight && (
                      <span className="absolute -top-3 left-7 rounded-full bg-red-600 px-3 py-1 text-[10px] font-bold tracking-widest">
                        POPULER
                      </span>
                    )}
                    <h3 className="text-xl font-extrabold">{plan.name}</h3>
                    <p className="mt-3 text-3xl font-black">
                      Rp {Number(plan.price_monthly).toLocaleString('id-ID')}
                      <span className="text-sm font-medium text-zinc-500">/bulan</span>
                    </p>
                    <ul className="mt-5 space-y-2.5 text-sm leading-6 text-zinc-300">
                      {(plan.features || []).slice(0, 5).map((f: string) => (
                        <li key={f}>✓ {f}</li>
                      ))}
                    </ul>
                    <Link
                      href="/checkout"
                      className={`mt-7 block rounded-xl py-3 text-center text-sm font-bold transition ${
                        highlight
                          ? 'bg-red-600 hover:bg-red-500'
                          : 'bg-white/10 hover:bg-white/15'
                      }`}
                    >
                      Pilih Paket
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 p-7 text-sm text-zinc-500">
              Paket langganan akan tampil di sini setelah dikonfigurasi.{' '}
              <Link href="/plans" className="font-semibold text-zinc-300 hover:text-white">
                Lihat halaman paket →
              </Link>
            </div>
          )}
        </section>

        {/* ── 8. FINAL CTA ──────────────────────────────────── */}
        <section className="border-t border-white/[.06] py-16 text-center md:py-24">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Siap memulai cerita hebatmu?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
            Gabung sekarang dan nikmati ribuan jam tontonan.
          </p>
          <Link href="/movies" className="nexora-btn-primary mt-8">
            Mulai Nonton
          </Link>
        </section>

        {/* ── 9. FOOTER ─────────────────────────────────────── */}
        <footer className="flex flex-col gap-3 border-t border-white/10 py-8 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold tracking-[.18em] text-white">NEXORA FILM</p>
            <p className="mt-1">Ruang tontonanmu. Film, shorts, dan kreator dalam satu tempat.</p>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/movies" className="transition hover:text-white">Film</Link>
            <Link href="/shorts" className="transition hover:text-white">Shorts</Link>
            <Link href="/creators" className="transition hover:text-white">Kreator</Link>
            <Link href="/plans" className="transition hover:text-white">Paket</Link>
          </div>
        </footer>
        <p className="pb-8 text-xs text-zinc-600">
          © {new Date().getFullYear()} Nexora Film. Seluruh hak cipta dilindungi.
        </p>
      </div>
    </main>
  );
}
