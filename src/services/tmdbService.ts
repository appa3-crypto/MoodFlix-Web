// TMDB Service — mocked for V2, ready for real API integration.
// To activate: set VITE_TMDB_API_KEY in .env and replace mock functions below.

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export interface TMDBMovie {
  id: number;
  title: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  overview: string;
  media_type?: 'movie' | 'tv';
}

export interface TMDBProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

// Build a full poster URL from a TMDB poster path
export function buildPosterUrl(path: string): string {
  return `${TMDB_IMAGE_BASE}${path}`;
}

// Search for a movie or series by title
// Replace body with: const r = await fetch(`${TMDB_API_BASE}/search/multi?query=...&api_key=${key}`)
export async function searchMovieOrSeries(_title: string): Promise<TMDBMovie | null> {
  console.info('[TMDB] searchMovieOrSeries — mocked, activate with VITE_TMDB_API_KEY');
  return null;
}

// Get poster URL for a title
// Replace body with: const result = await searchMovieOrSeries(title); return result?.poster_path ? buildPosterUrl(result.poster_path) : null;
export async function getPoster(_title: string): Promise<string | null> {
  console.info('[TMDB] getPoster — mocked, activate with VITE_TMDB_API_KEY');
  return null;
}

// Get streaming providers for a title (JustWatch data via TMDB)
// Replace body with: fetch(`${TMDB_API_BASE}/movie/{id}/watch/providers?api_key=${key}`)
export async function getWatchProviders(_title: string): Promise<TMDBProvider[]> {
  console.info('[TMDB] getWatchProviders — mocked, activate with VITE_TMDB_API_KEY');
  return [];
}

export { TMDB_API_BASE, TMDB_IMAGE_BASE };
