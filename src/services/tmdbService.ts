import type { Recommendation, UserChoices } from '../types';
import {
  MOOD_GENRE_IDS,
  buildWatchProviderParam,
  resolveProviderNames,
  mapTMDBToRecommendation,
  type TMDBDiscoveryItem,
} from '../utils/tmdbMapping';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY ?? '';
const BASE    = 'https://api.themoviedb.org/3';
const COUNTRY = 'FR';

export const isApiEnabled = (): boolean => Boolean(API_KEY);

// In-session cache to avoid duplicate network calls
const cache = new Map<string, unknown>();

async function fetchTMDB<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!API_KEY) return null;

  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('language', 'fr-FR');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const key = url.toString();
  if (cache.has(key)) return cache.get(key) as T;

  try {
    const res = await fetch(key);
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    cache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

// ── PROVIDERS ────────────────────────────────────────────────────────────────

interface ProvidersResponse {
  results?: Record<string, { flatrate?: Array<{ provider_id: number }> }>;
}

async function getProviderNames(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string[]> {
  const data = await fetchTMDB<ProvidersResponse>(`/${mediaType}/${tmdbId}/watch/providers`);
  const flatrate = data?.results?.[COUNTRY]?.flatrate ?? [];
  return resolveProviderNames(flatrate);
}

// ── SEARCH ───────────────────────────────────────────────────────────────────

interface SearchResult {
  id: number;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  media_type: 'movie' | 'tv';
}

async function searchTitle(title: string): Promise<SearchResult | null> {
  const data = await fetchTMDB<{ results: SearchResult[] }>('/search/multi', { query: title });
  return data?.results?.find(r => r.media_type === 'movie' || r.media_type === 'tv') ?? null;
}

// ── ENRICH ───────────────────────────────────────────────────────────────────

export interface TMDBEnrichment {
  tmdbId?: number;
  posterUrl?: string;
  overview?: string;
  voteAverage?: number;
  availableOn?: string[];
}

export async function enrichItem(item: {
  title: string;
  type: 'movie' | 'series';
  posterUrl?: string;
  fromTMDB?: boolean;
  tmdbId?: number;
}): Promise<TMDBEnrichment> {
  if (!API_KEY) return {};

  // TMDB-discovered items: already have all data, just refresh providers
  if (item.fromTMDB && item.tmdbId) {
    const mediaType = item.type === 'movie' ? 'movie' : 'tv';
    const providers = await getProviderNames(item.tmdbId, mediaType);
    return providers.length > 0 ? { availableOn: providers } : {};
  }

  // Curated items: search by title to get TMDB data
  const result = await searchTitle(item.title);
  if (!result) return {};

  const mediaType = item.type === 'movie' ? 'movie' : 'tv';
  const providers = await getProviderNames(result.id, mediaType);

  return {
    tmdbId: result.id,
    posterUrl: result.poster_path
      ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
      : item.posterUrl,
    overview: result.overview || undefined,
    voteAverage: result.vote_average > 0 ? result.vote_average : undefined,
    availableOn: providers.length > 0 ? providers : undefined,
  };
}

// ── DISCOVER ─────────────────────────────────────────────────────────────────

const DURATION_PARAMS: Record<string, Record<string, string>> = {
  'under-90':    { 'with_runtime.lte': '95' },
  'two-hours':   { 'with_runtime.gte': '85', 'with_runtime.lte': '140' },
  'evening':     { 'with_runtime.gte': '130', 'with_runtime.lte': '220' },
  'several-days': {},
};

interface DiscoverResponse {
  results: TMDBDiscoveryItem[];
}

export async function discoverContent(
  choices: UserChoices,
  excludedTitles: string[],
): Promise<Recommendation[]> {
  if (!API_KEY || !choices.mood) return [];

  const genreIds = MOOD_GENRE_IDS[choices.mood]?.join(',') ?? '';
  const providerParam = buildWatchProviderParam(choices.platforms);
  const excludedLower = excludedTitles.map(t => t.toLowerCase());

  const results: Recommendation[] = [];

  async function discover(mediaType: 'movie' | 'tv'): Promise<void> {
    const params: Record<string, string> = {
      with_genres:       genreIds,
      sort_by:           'vote_average.desc',
      'vote_count.gte':  '150',
      'vote_average.gte':'6.5',
    };

    if (mediaType === 'movie' && choices.duration && choices.duration !== 'several-days') {
      Object.assign(params, DURATION_PARAMS[choices.duration] ?? {});
    }

    if (providerParam) {
      params.with_watch_providers = providerParam;
      params.watch_region         = COUNTRY;
    }

    const data = await fetchTMDB<DiscoverResponse>(`/discover/${mediaType}`, params);
    if (!data?.results) return;

    const type = mediaType === 'movie' ? 'movie' : 'series';

    for (const item of data.results) {
      if (results.length >= 10) break;
      const title = (item.title ?? item.name ?? '').toLowerCase();
      if (excludedLower.includes(title)) continue;

      // With with_watch_providers, the item IS on those platforms — set providers from user choices
      const providers = providerParam
        ? choices.platforms.filter(p => p !== 'any')
        : [];

      results.push(mapTMDBToRecommendation(item, type, providers, choices));
    }
  }

  if (choices.type === 'series' || choices.duration === 'several-days') {
    await discover('tv');
  } else if (choices.type === 'movie') {
    await discover('movie');
  } else {
    await Promise.all([discover('movie'), discover('tv')]);
  }

  return results;
}
