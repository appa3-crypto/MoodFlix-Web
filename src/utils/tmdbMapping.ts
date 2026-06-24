import type { Recommendation, Mood, UserChoices } from '../types';

export const MOOD_GENRE_IDS: Record<Mood, number[]> = {
  'mind-bending': [878, 9648],   // Sci-Fi OR Mystery (drop Fantasy 14)
  scared:         [27, 53],      // Horror OR Thriller
  laugh:          [35],          // Comedy only (Animation 16 excluded — causes anime spam)
  moved:          [18, 10749],   // Drama OR Romance
  escape:         [12, 28],      // Adventure OR Action
  surprised:      [53, 9648, 80], // Thriller OR Mystery OR Crime
};

// TMDB JustWatch provider IDs for France
export const PLATFORM_PROVIDER_IDS: Record<string, number[]> = {
  'Netflix':      [8],
  'Prime Video':  [9, 119],
  'Disney+':      [337],
  'Canal+':       [34, 35],
  'Apple TV+':    [350],
  'Paramount+':   [531],
  'Max':          [1899],
  'Crunchyroll':  [283],
};

// Build the with_watch_providers param from user's platforms
export function buildWatchProviderParam(platforms: string[]): string | undefined {
  const filtered = platforms.filter(p => p !== 'any');
  if (filtered.length === 0) return undefined;
  const ids = filtered.flatMap(p => PLATFORM_PROVIDER_IDS[p] ?? []);
  return ids.length > 0 ? ids.join('|') : undefined;
}

// Reverse-map TMDB provider IDs to our platform names
export function resolveProviderNames(flatrate: Array<{ provider_id: number }>): string[] {
  const found: string[] = [];
  for (const [name, ids] of Object.entries(PLATFORM_PROVIDER_IDS)) {
    if (flatrate.some(f => ids.includes(f.provider_id))) found.push(name);
  }
  return found;
}

function genresToMoods(genreIds: number[]): string[] {
  const moods: string[] = [];
  if (genreIds.some(g => [878, 9648, 14].includes(g))) moods.push('mind-bending');
  if (genreIds.some(g => [27, 53].includes(g))) moods.push('scared');
  // Genre 16 (animation) ≠ comédie — seul genre 35 qualifie pour "rire"
  // Sinon, les films d'animation dominent les recommandations "rire"
  if (genreIds.some(g => g === 35)) moods.push('laugh');
  if (genreIds.some(g => [18, 10749].includes(g))) moods.push('moved');
  if (genreIds.some(g => [12, 28, 16, 10751].includes(g))) moods.push('escape');
  if (genreIds.some(g => [53, 9648, 80].includes(g))) moods.push('surprised');
  return moods.length > 0 ? moods : ['escape'];
}

function genresToTags(genreIds: number[]): string[] {
  const map: Record<number, string> = {
    28: 'action', 12: 'aventure', 16: 'animation', 35: 'comédie',
    80: 'polar', 18: 'drame', 14: 'fantastique', 27: 'horreur',
    9648: 'mystère', 10749: 'romance', 878: 'sci-fi', 53: 'thriller',
    10752: 'guerre', 37: 'western', 36: 'histoire', 10751: 'famille',
  };
  return genreIds.map(id => map[id]).filter(Boolean);
}

function estimateScores(genreIds: number[], voteAverage: number) {
  const isMystery = genreIds.some(g => [9648, 878].includes(g));
  const isHorror  = genreIds.some(g => [27, 53].includes(g));
  const isComedy  = genreIds.some(g => g === 35); // Genre 16 (animation) ≠ comédie
  const isDrama   = genreIds.some(g => [18, 10749].includes(g));
  const isComplex = genreIds.some(g => [878, 9648, 80, 18].includes(g));
  const quality   = Math.max(0, (voteAverage - 5) / 5); // 0..1

  return {
    mysteryScore:    isMystery ? Math.round(5 + quality * 4) : Math.round(1 + quality * 2),
    fearScore:       isHorror  ? Math.round(6 + quality * 3) : 0,
    humorScore:      isComedy  ? Math.round(6 + quality * 3) : 0,
    emotionScore:    isDrama   ? Math.round(6 + quality * 3) : Math.round(1 + quality * 2),
    complexityScore: isComplex ? Math.round(5 + quality * 4) : Math.round(2 + quality * 3),
  };
}

const POSTER_COLORS = ['#1a1a2e', '#16213e', '#0f3460', '#1e1b2e', '#2d1b2e', '#0d1b2a'];

export interface TMDBDiscoveryItem {
  id: number;
  title?: string;
  name?: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  overview: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  release_date?: string;     // films
  first_air_date?: string;   // séries
}

export function mapTMDBToRecommendation(
  item: TMDBDiscoveryItem,
  mediaType: 'movie' | 'series',
  providers: string[],
  choices: UserChoices,
): Recommendation {
  const title = item.title ?? item.name ?? 'Inconnu';
  const moods = genresToMoods(item.genre_ids);
  const tags = genresToTags(item.genre_ids);
  const scores = estimateScores(item.genre_ids, item.vote_average);
  const durationCategory = choices.duration ?? (mediaType === 'series' ? 'several-days' : 'two-hours');

  const atmosphere = item.overview
    ? (item.overview.length > 130 ? item.overview.slice(0, 127) + '…' : item.overview)
    : 'Découvert via TMDB.';

  const rating = item.vote_average > 0 ? `${item.vote_average.toFixed(1)}/10 sur TMDB` : 'nouveau contenu';

  return {
    id: item.id,
    title,
    type: mediaType,
    platforms: providers.length > 0 ? providers : ['any'],
    durationCategory,
    moods,
    tags,
    atmosphere,
    shortReason: `${rating} · ${tags.slice(0, 2).join(', ')}`,
    disappointmentRisk: item.vote_count < 200 ? 'Contenu peu connu — les avis peuvent varier.' : 'Bien noté par la communauté TMDB.',
    posterColor: POSTER_COLORS[item.id % POSTER_COLORS.length],
    posterEmoji: moods.includes('laugh') ? '😂' : moods.includes('scared') ? '👻' : moods.includes('mind-bending') ? '🌀' : moods.includes('moved') ? '🥺' : moods.includes('escape') ? '🎬' : '🎬',
    posterUrl:   item.poster_path   ? `https://image.tmdb.org/t/p/w500${item.poster_path}`   : undefined,
    backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : undefined,
    tmdbId:      item.id,
    overview:    item.overview || undefined,
    voteAverage: item.vote_average > 0 ? item.vote_average : undefined,
    availableOn: providers.length > 0 ? providers : undefined,
    fromTMDB:    true,
    releaseDate: item.release_date ?? item.first_air_date,
    ...scores,
  };
}
