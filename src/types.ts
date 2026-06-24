export type Mood = 'mind-bending' | 'scared' | 'laugh' | 'moved' | 'escape' | 'surprised';
export type ContentType = 'movie' | 'series' | 'both';
export type Duration = 'under-90' | 'two-hours' | 'evening' | 'several-days';
export type Platform =
  | 'Netflix' | 'Prime Video' | 'Disney+' | 'Canal+'
  | 'Apple TV+' | 'Max' | 'Paramount+' | 'Crunchyroll'
  | 'any';
export type QuickVibe = 'light' | 'intense' | 'surprising';
export type SatisfactionRating = 'loved' | 'good' | 'ok' | 'disappointed' | 'bad';

export interface UserChoices {
  mood: Mood | null;
  type: ContentType | null;
  duration: Duration | null;
  platforms: Platform[];
  references: string;
  isAutoChoice?: boolean;
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
  tmdbId?: number;
  overview?: string;
  voteAverage?: number;
  availableOn?: string[];
  fromTMDB?: boolean;
}

export interface ScoredRecommendation extends Recommendation {
  score: number;
  isDiscovery?: boolean;
  recommendationIntent?: string;
  localRank?: number;
  aiRank?: number;
  aiReason?: string;
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

export interface NotificationPrefs {
  watchReminder: boolean;
  dailySuggestions: boolean;
  newFeatures: boolean;
  personalTips: boolean;
}

export interface AppSettings {
  notifications: NotificationPrefs;
  preferredPlatforms: Platform[];
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
  abandonedItems: number[];
  likedItems: number[];
  frequentMoods: Partial<Record<Mood, number>>;
  satisfactionLog: SatisfactionEntry[];
  recommendedHistory: RecommendationHistoryEntry[];
  createdAt: string;
  itemMetaStore: Record<number, ItemMeta>;
  watchPlan: WatchPlan | null;
  settings?: AppSettings;
}

export type WatchStatus = 'planned' | 'watched' | 'abandoned';

export interface WatchPlan {
  itemId:     number;
  title:      string;
  posterUrl?: string;
  posterEmoji: string;
  posterColor: string;
  duration?:  number;
  plannedAt:  string;
  notifyAt?:  string;
  watchedAt?: string;
  status:     WatchStatus;
  source:     'choose_for_me' | 'ca_me_tente';
}

export interface CouplePrefs {
  name:     string;
  moods:    Mood[];
  duration: Duration | null;
  type:     ContentType;
}

export interface CalibResult {
  itemId: number;
  title: string;
  type: 'movie' | 'series';
  action: 'liked' | 'disliked' | 'seen';
  posterUrl?: string;
  posterEmoji: string;
  posterColor: string;
  tmdbId?: number;
}

// Minimal snapshot persisted alongside each profile action
// Extended fields are optional for backward compatibility
export interface ItemMeta {
  title: string;
  type: 'movie' | 'series';
  posterUrl?: string;
  posterEmoji: string;
  posterColor: string;
  tmdbId?: number;
  overview?: string;
  atmosphere?: string;
  shortReason?: string;
  tags?: string[];
  platforms?: string[];
  duration?: number;
  seasons?: number;
  addedAt?: string;
}

export interface AIExplanation {
  explanation: string;
  reasons:     string[];
  riskLevel:   string;
  confidence:  number;
  isLocal?:    boolean;
}

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
  | 'premium'
  | 'settings'
  | 'quick-type'
  | 'quick-vibe';
