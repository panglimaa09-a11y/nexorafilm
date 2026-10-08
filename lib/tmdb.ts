// Helper server-side untuk TMDB API (8 Okt 2026)
// API key hanya dipakai di server — jangan import file ini di client component.

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

export const tmdbImg = (path: string | null, size: string = 'w500'): string | null =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

export interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  runtime?: number;
  genres?: { id: number; name: string }[];
}

async function tmdbGet(path: string) {
  if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY belum dikonfigurasi');
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${TMDB_API_KEY}&language=id-ID`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

export async function searchTmdb(q: string): Promise<TmdbMovie[]> {
  const data = await tmdbGet(`/search/movie?query=${encodeURIComponent(q)}&include_adult=false&page=1`);
  return (data.results ?? []).slice(0, 18);
}

export async function getTmdb(id: string): Promise<TmdbMovie | null> {
  try {
    return (await tmdbGet(`/movie/${id}`)) as TmdbMovie;
  } catch {
    return null;
  }
}
