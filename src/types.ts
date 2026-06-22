export type Mood = 'mind-bending' | 'scared' | 'laugh' | 'moved' | 'escape' | 'surprised';
export type ContentType = 'movie' | 'series' | 'both';
export type Duration = 'under-90' | 'two-hours' | 'evening' | 'several-days';
export type Platform = 'Netflix' | 'Prime Video' | 'Disney+' | 'Canal+' | 'any';
export type QuickVibe = 'light' | 'intense' | 'surprising';
export type SatisfactionRating = 'loved' | 'good' | 'ok' | 'disappointed' | 'bad';

export interface UserChoices {
  mood: Mood | null;
  type: ContentType | null;
  duration: Duration | null;
  platforms: Platform[];
  references: string;
}

export interface Recommendation {
  id: number;
  title: string;
  type: 'movie' | 'series';
  platforms: string[];
  durationCategory: string;
  duration?: number;
  seasons?: number;
  moods: string[];
  tags: string[];
  atmosphere: string;
  complexityScore: number;
  fearScore: number;
  emotionScore: number;
  humorScore: number;
  mysteryScore: number;
  shortReason: string;
  disappointmentRisk: string;
  posterColor: string;
  posterEmoji: string;
  posterUrl?: string;
  backdropUrl?: string;
  // V3 — TMDB enrichment fields
  tmdbId?: number;
  overview?: string;
  voteAverage?: number;
  availableOn?: string[];
  fromTMDB?: boolean;
}

export interface ScoredRecommendation extends Recommendation {
  score: number;
  isDiscovery?: boolean;
}

export interface SatisfactionEntry {
  itemId: number;
  rating: SatisfactionRating;
  reasons: string[];
  date: string;
}

export interface RecommendationHistoryEntry {
  itemId: number;
  title: string;
  date: string;
  mood: string | null;
}

export interface UserProfile {
  pseudo: string;
  preferredPlatforms: Platform[];
  preferredType: ContentType;
  preferredDuration: Duration | null;
  wantToWatchItems: number[];
  seenItems: number[];
  dislikedItems: number[];
  tooLongItems: number[];
  likedItems: number[];
  frequentMoods: Partial<Record<Mood, number>>;
  satisfactionLog: SatisfactionEntry[];
  recommendedHistory: RecommendationHistoryEntry[];
  createdAt: string;
}

// V4 — IA explicative
export interface AIExplanation {
  explanation: string;
  reasons:     string[];
  riskLevel:   string;
  confidence:  number;
  isLocal?:    boolean;
}

// V4 — Profil spectateur
export type SpectatorArchetype =
  | 'mystery-explorer'
  | 'thrill-seeker'
  | 'emotional-viewer'
  | 'twist-hunter'
  | 'light-entertainment'
  | 'immersive-worlds';

export interface SpectatorProfileInfo {
  archetype:   SpectatorArchetype;
  emoji:       string;
  label:       string;
  description: string;
}

export type Step =
  | 'home'
  | 'mood'
  | 'type'
  | 'duration'
  | 'platform'
  | 'references'
  | 'results'
  | 'profile'
  | 'history'
  | 'quick-type'
  | 'quick-vibe';
