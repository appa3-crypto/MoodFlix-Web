import type { Recommendation, UserChoices, Mood, ContentType, Platform, AnimationPref } from '../types';
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
  backdrop_path: string | null;
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
  backdropUrl?: string;
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
    backdropUrl: result.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${result.backdrop_path}`
      : undefined,
    overview: result.overview || undefined,
    voteAverage: result.vote_average > 0 ? result.vote_average : undefined,
    availableOn: providers.length > 0 ? providers : undefined,
  };
}

export async function getPosterByTmdbId(tmdbId: number, isTV: boolean): Promise<string | null> {
  if (!API_KEY) return null;
  const type = isTV ? 'tv' : 'movie';
  const data = await fetchTMDB<{ poster_path: string | null }>(`/${type}/${tmdbId}`, {});
  return data?.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null;
}

export async function getPosterByTitle(title: string): Promise<string | null> {
  const result = await searchTitle(title);
  return result?.poster_path
    ? `https://image.tmdb.org/t/p/w342${result.poster_path}`
    : null;
}

interface VideoResult {
  key: string;
  site: string;
  type: string;
  official: boolean;
  iso_639_1: string;
}

// Retourne la clé YouTube du meilleur trailer/teaser disponible
export async function getTrailerKey(tmdbId: number, isTV: boolean): Promise<string | null> {
  if (!API_KEY) return null;
  const type = isTV ? 'tv' : 'movie';

  function pickBest(results: VideoResult[]): VideoResult | null {
    const yt = results.filter(v => v.site === 'YouTube');
    return (
      yt.find(v => v.type === 'Trailer' && v.official) ??
      yt.find(v => v.type === 'Trailer') ??
      yt.find(v => v.type === 'Teaser' && v.official) ??
      yt.find(v => v.type === 'Teaser') ??
      yt[0] ?? null
    );
  }

  // 1ère tentative (fr) — TMDB renvoie tous les langages, paramètre language = tri metadata
  const data = await fetchTMDB<{ results: VideoResult[] }>(`/${type}/${tmdbId}/videos`, {});
  const pick = pickBest(data?.results ?? []);
  if (pick) return pick.key;

  // Fallback explicite anglais
  const enData = await fetchTMDB<{ results: VideoResult[] }>(
    `/${type}/${tmdbId}/videos`, { language: 'en-US' }
  );
  return pickBest(enData?.results ?? [])?.key ?? null;
}

// ── DISCOVER ─────────────────────────────────────────────────────────────────

const DURATION_PARAMS: Record<string, Record<string, string>> = {
  'under-90':    { 'with_runtime.lte': '95' },
  'two-hours':   { 'with_runtime.gte': '85', 'with_runtime.lte': '140' },
  'evening':     { 'with_runtime.gte': '130', 'with_runtime.lte': '220' },
  'several-days': {},
};

// Genres TMDB à exclure pour éviter docs, émissions, téléréalité, talk-shows
// 99 = documentaire, 10764 = reality, 10767 = talk-show, 10763 = news
const EXCLUDED_GENRES_TV    = '99,10764,10767,10763';
const EXCLUDED_GENRES_MOVIE = '99,10764,10767';

// Seuils de qualité différenciés par mood
// Les comédies ont structurellement moins de votes TMDB que les thrillers
function qualityParams(mood: string): Record<string, string> {
  if (mood === 'laugh') {
    return { 'vote_count.gte': '200', 'vote_average.gte': '6.3' };
  }
  if (mood === 'escape') {
    return { 'vote_count.gte': '300', 'vote_average.gte': '6.5' };
  }
  return { 'vote_count.gte': '300', 'vote_average.gte': '6.8' };
}

// Items max par type (film / série) — indépendants pour que "les deux" donne 30 résultats
const MAX_PER_TYPE = 15;

interface DiscoverResponse {
  results: TMDBDiscoveryItem[];
  total_pages?: number;
}

export async function discoverContent(
  choices: UserChoices,
  excludedTitles: string[],
  animationPref?: AnimationPref,
): Promise<Recommendation[]> {
  if (!API_KEY || !choices.mood) return [];

  const genreIds      = MOOD_GENRE_IDS[choices.mood]?.join('|') ?? '';
  const providerParam = buildWatchProviderParam(choices.platforms);
  const excludedLower = new Set(excludedTitles.map(t => t.toLowerCase().trim()));

  // Genres à exclure pour l'humeur "rire" quand l'utilisateur veut peu/pas d'animation
  const shouldExcludeAnimation =
    choices.mood === 'laugh' &&
    (animationPref === 'rarely' || animationPref === 'never');

  const allResults: Recommendation[] = [];

  async function discover(mediaType: 'movie' | 'tv', page = 1): Promise<void> {
    const typeItems: Recommendation[] = [];

    const baseExcluded = mediaType === 'tv' ? EXCLUDED_GENRES_TV : EXCLUDED_GENRES_MOVIE;
    const withoutGenres = shouldExcludeAnimation
      ? `${baseExcluded},16,10751`
      : baseExcluded;

    const params: Record<string, string> = {
      with_genres:    genreIds,
      sort_by:        'popularity.desc',   // fraîcheur + popularité > vote_average seul
      without_genres: withoutGenres,
      page:           String(page),
      ...qualityParams(choices.mood!),
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

    const type      = mediaType === 'movie' ? 'movie' : 'series';
    const providers = providerParam ? choices.platforms.filter(p => p !== 'any') : [];

    for (const item of data.results) {
      if (typeItems.length >= MAX_PER_TYPE) break;
      if (!item.poster_path) continue;        // affiche obligatoire
      if (!item.overview?.trim()) continue;   // synopsis obligatoire
      const title = (item.title ?? item.name ?? '').toLowerCase().trim();
      if (excludedLower.has(title)) continue;
      // Évite les doublons intra-résultats TMDB
      if (allResults.some(r => r.id === item.id)) continue;
      typeItems.push(mapTMDBToRecommendation(item, type, providers, choices));
    }

    allResults.push(...typeItems);

    // Si la page 1 ne remplit pas le quota et qu'une page 2 existe, on la récupère aussi
    if (typeItems.length < MAX_PER_TYPE && page === 1 && (data.total_pages ?? 1) > 1) {
      await discover(mediaType, 2);
    }
  }

  if (choices.type === 'series' || choices.duration === 'several-days') {
    await discover('tv');
  } else if (choices.type === 'movie') {
    await discover('movie');
  } else {
    // Récupère films ET séries en parallèle — jusqu'à 30 items total
    await Promise.all([discover('movie'), discover('tv')]);
  }

  return allResults;
}

// ── CALIBRATION DISCOVERY ─────────────────────────────────────────────────────
// Genres variés pour calibration — films et séries populaires avec affiche garantie

const CALIB_GENRE_SETS: { genres: string; mediaType: 'movie' | 'tv' }[] = [
  { genres: '35',       mediaType: 'movie' }, // Comédie
  { genres: '27',       mediaType: 'movie' }, // Horreur
  { genres: '18',       mediaType: 'movie' }, // Drame
  { genres: '878',      mediaType: 'movie' }, // Science-fiction
  { genres: '28',       mediaType: 'movie' }, // Action
  { genres: '16',       mediaType: 'movie' }, // Animation
  { genres: '10749',    mediaType: 'movie' }, // Romance
  { genres: '80',       mediaType: 'movie' }, // Policier
  { genres: '9648',     mediaType: 'movie' }, // Mystère
  { genres: '12',       mediaType: 'movie' }, // Aventure
  { genres: '18',       mediaType: 'tv'    }, // Drame série
  { genres: '35',       mediaType: 'tv'    }, // Comédie série
  { genres: '10765',    mediaType: 'tv'    }, // SF & Fantastique série
  { genres: '80',       mediaType: 'tv'    }, // Policier série
  { genres: '10759',    mediaType: 'tv'    }, // Action/Aventure série
];

const CALIB_MIN_ITEMS = 12; // Minimum d'items nouveaux pour constituer une deck valide

export async function discoverForCalibration(excludeIds: Set<number>): Promise<Recommendation[]> {
  if (!API_KEY) return [];

  const results: Recommendation[] = [];
  const seenIds    = new Set<number>(excludeIds);
  const triedKeys  = new Set<string>(); // genre:mediaType:page déjà essayés

  // Jusqu'à 3 rounds si pas assez d'items nouveaux
  // Round 0 : pages 1-5 (les plus populaires)
  // Round 1 : pages 4-9 (moins populaires)
  // Round 2 : pages 8-14 (encore moins populaires)
  for (let round = 0; round < 3; round++) {
    if (results.length >= CALIB_MIN_ITEMS) break;

    const pageOffset = round * 4; // pages de plus en plus hautes à chaque round
    const shuffledSets = [...CALIB_GENRE_SETS].sort(() => Math.random() - 0.5);

    await Promise.all(shuffledSets.slice(0, 5).map(async ({ genres, mediaType }) => {
      // Choisir une page dans la plage du round, éviter les doublons exact genre+page
      let page: number;
      let triedKey: string;
      let attempts = 0;
      do {
        page = pageOffset + Math.floor(Math.random() * 5) + 1; // 1-5, 5-9, 9-13
        triedKey = `${genres}:${mediaType}:${page}`;
        attempts++;
      } while (triedKeys.has(triedKey) && attempts < 5);

      if (triedKeys.has(triedKey)) return; // toutes les pages de cette plage ont été essayées
      triedKeys.add(triedKey);

      const data = await fetchTMDB<DiscoverResponse>(`/discover/${mediaType}`, {
        with_genres:        genres,
        sort_by:            'popularity.desc',
        'vote_count.gte':   round === 0 ? '400' : '200', // seuil plus bas dans les rounds suivants
        'vote_average.gte': '6.0',
        without_genres:     mediaType === 'tv' ? EXCLUDED_GENRES_TV : EXCLUDED_GENRES_MOVIE,
        page:               String(page),
      });
      if (!data?.results) return;

      const mType = mediaType === 'movie' ? 'movie' : 'series';
      const minChoices: UserChoices = {
        mood: null, type: mType, duration: null, platforms: [], references: '',
      };

      for (const item of data.results) {
        if (!item.poster_path)      continue;
        if (!item.overview?.trim()) continue;
        if (seenIds.has(item.id))   continue; // exclure tous les IDs déjà vus (calibrationSeenIds + session)
        seenIds.add(item.id);
        results.push(mapTMDBToRecommendation(item, mType, [], minChoices));
      }
    }));
  }

  // Équilibrer : max 2 items animation/famille sur les 25 retenus
  const animItems = results.filter(r => r.tags.includes('animation') || r.tags.includes('famille'));
  const liveItems = results.filter(r => !r.tags.includes('animation') && !r.tags.includes('famille'));
  const balanced = [
    ...liveItems.sort(() => Math.random() - 0.5),
    ...animItems.sort(() => Math.random() - 0.5).slice(0, 2),
  ].sort(() => Math.random() - 0.5);

  return balanced.slice(0, 25);
}

// ── CFM DISCOVERY ─────────────────────────────────────────────────────────────
// Pool TMDB pour "Choisis pour moi" — basé sur les humeurs du profil utilisateur

export async function discoverForCFM(
  moods: Mood[],
  type: ContentType,
  platforms: Platform[],
  excludeIds: Set<number>,
  animationPref?: AnimationPref,
): Promise<Recommendation[]> {
  if (!API_KEY || moods.length === 0) return [];

  const providerParam = buildWatchProviderParam(platforms);
  const results: Recommendation[] = [];
  const seenIds = new Set<number>(excludeIds);

  const mediaTypes: ('movie' | 'tv')[] =
    type === 'movie'  ? ['movie'] :
    type === 'series' ? ['tv']    :
    ['movie', 'tv'];

  const targetMoods = moods.slice(0, 2); // max 2 humeurs pour limiter les requêtes

  await Promise.all(
    targetMoods.flatMap(mood =>
      mediaTypes.map(async (mediaType) => {
        const genreIds = MOOD_GENRE_IDS[mood]?.join('|') ?? '';
        if (!genreIds) return;

        const shouldExcludeAnim =
          mood === 'laugh' && (animationPref === 'rarely' || animationPref === 'never');
        const baseExcluded = mediaType === 'tv' ? EXCLUDED_GENRES_TV : EXCLUDED_GENRES_MOVIE;

        // Page aléatoire pour ne pas toujours proposer les mêmes
        const page = Math.floor(Math.random() * 4) + 1;
        const params: Record<string, string> = {
          with_genres:      genreIds,
          sort_by:          'popularity.desc',
          'vote_count.gte': '200',
          'vote_average.gte': '6.3',
          without_genres:   shouldExcludeAnim ? `${baseExcluded},16,10751` : baseExcluded,
          page:             String(page),
        };

        if (providerParam) {
          params.with_watch_providers = providerParam;
          params.watch_region         = COUNTRY;
        }

        const data = await fetchTMDB<DiscoverResponse>(`/discover/${mediaType}`, params);
        if (!data?.results) return;

        const mType     = mediaType === 'movie' ? 'movie' : 'series';
        const providers = providerParam ? platforms.filter(p => p !== 'any') : [];
        const minChoices: UserChoices = {
          mood, type: mType, duration: null, platforms, references: '',
        };

        for (const item of data.results) {
          if (!item.poster_path)      continue;
          if (!item.overview?.trim()) continue;
          if (seenIds.has(item.id))   continue;
          seenIds.add(item.id);
          results.push(mapTMDBToRecommendation(item, mType, providers, minChoices));
        }
      })
    )
  );

  return results.sort(() => Math.random() - 0.5);
}
