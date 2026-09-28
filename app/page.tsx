import Link from 'next/link';
import Navbar from '@/components/Navbar';
import MovieRow from '@/components/MovieRow';
import { createClient } from '@/lib/supabase-server';

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

  const hero = movies[0] ?? null;
  const heroImage = hero
    ? String(
        (hero as any).backdrop_url ||
        (hero as any).poster_url ||
        (hero as any).poster ||
        ''
      )
    : '';

  const features = [
    {
      eyebrow: 'VIDEO PENDEK',
      title: 'Nexora Shorts',
      description: 'Jelajahi konten video pendek dari kreator.',
      href: '/shorts',
      action: 'Buka Shorts',
      style: 'shorts'
    },
    {
      eyebrow: 'KOMUNITAS',
      title: 'Temukan Kreator',
      description: 'Jelajahi halaman kreator dan karya yang mereka publikasikan.',
      href: '/creators',
      action: 'Jelajahi Kreator',
      style: 'creators'
    },
    {
      eyebrow: 'RUANG KREATOR',
      title: 'Creator Studio',
      description: 'Buka ruang kreator untuk mengelola karya dan melihat fitur yang tersedia.',
      href: '/creator',
      action: 'Buka Studio',
      style: 'studio'
    }
  ];

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <Navbar />

      <section
        className={`home-hero relative flex min-h-[570px] items-end overflow-hidden md:min-h-[680px] ${
          heroImage ? 'home-hero-has-image' : ''
        }`}
        style={
          heroImage
            ? {
                backgroundImage: `linear-gradient(90deg, #080808 0%, rgba(8,8,8,.82) 42%, rgba(8,8,8,.2) 100%), linear-gradient(0deg, #080808 0%, transparent 65%), url("${heroImage}")`
              }
            : undefined
        }
      >
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
                <Link
                  href={`/movies/${hero.id}`}
                  className="nexora-btn-primary"
                >
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

          <div className="mt-12 flex flex-wrap gap-x-6 gap-y-3 text-xs text-zinc-400">
            <span>Film dan serial</span>
            <span>Video pendek</span>
            <span>Komunitas kreator</span>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto max-w-[1600px] space-y-16 px-5 py-12 sm:px-8 md:space-y-20 md:px-14 md:py-16">
        <section aria-labelledby="discover-heading">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[.24em] text-red-400">
                Mulai menjelajah
              </p>
              <h2
                id="discover-heading"
                className="text-2xl font-bold tracking-tight md:text-3xl"
              >
                Dunia Nexora
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Pilih pengalaman yang ingin kamu jelajahi.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feature, index) => (
              <article
                key={feature.href}
                className={`home-feature-card home-feature-${feature.style} group`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-[.24em] text-zinc-400">
                    {feature.eyebrow}
                  </span>
                  <span className="text-2xl font-light text-white/50" aria-hidden="true">
                    0{index + 1}
                  </span>
                </div>
                <div className="mt-10">
                  <h3 className="text-2xl font-bold tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="mt-3 min-h-12 text-sm leading-6 text-zinc-400">
                    {feature.description}
                  </p>
                </div>
                <Link
                  href={feature.href}
                  className="home-feature-link mt-7 inline-flex items-center gap-2 text-sm font-bold"
                >
                  {feature.action}
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="latest-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[.24em] text-red-400">
                Pilihan terbaru
              </p>
              <h2 id="latest-heading" className="text-2xl font-bold md:text-3xl">
                Terbaru di Nexora
              </h2>
            </div>
            <Link
              href="/movies"
              className="text-sm font-semibold text-zinc-300 transition hover:text-white"
            >
              Lihat semua film →
            </Link>
          </div>

          {movies.length > 0 ? (
            <MovieRow title="Film terbaru" movies={movies} />
          ) : (
            <div className="home-empty-state">
              <div className="mb-4 text-3xl text-zinc-600" aria-hidden="true">
                N
              </div>
              <h3 className="text-lg font-bold">Katalog sedang menunggu konten</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-400">
                Belum ada film yang dipublikasikan. Film akan ditampilkan
                otomatis setelah tersedia di database dan status publikasinya aktif.
              </p>
              <Link
                href="/movies"
                className="nexora-btn-secondary mt-6"
              >
                Buka katalog
              </Link>
            </div>
          )}
        </section>

        <section className="home-bottom-cta">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs font-bold uppercase tracking-[.24em] text-red-400">
              Untuk para kreator
            </p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              Karya kamu punya tempat di sini.
            </h2>
            <p className="mt-4 text-sm leading-7 text-zinc-400">
              Kunjungi Creator Studio untuk melihat alat dan alur publikasi
              yang tersedia di akunmu.
            </p>
          </div>
          <Link href="/creator" className="nexora-btn-primary shrink-0">
            Masuk Creator Studio
          </Link>
        </section>

        <footer className="flex flex-col gap-3 border-t border-white/10 pt-7 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} NEXORA FILM</span>
          <div className="flex flex-wrap gap-5">
            <Link href="/plans" className="transition hover:text-white">Paket</Link>
            <Link href="/my-list" className="transition hover:text-white">Daftar Saya</Link>
            <Link href="/history" className="transition hover:text-white">Riwayat</Link>
            <Link href="/creators" className="transition hover:text-white">Kreator</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
