import type { UserProfile, SpectatorArchetype, SpectatorProfileInfo } from '../types';

export const ARCHETYPE_INFO: Record<SpectatorArchetype, SpectatorProfileInfo> = {
  'mystery-explorer': {
    archetype:   'mystery-explorer',
    emoji:       '🌀',
    label:       'Explorateur de mystères',
    description: 'Tu cherches des œuvres qui challengent ton cerveau — twists, réalités alternatives, intrigues labyrinthiques.',
  },
  'thrill-seeker': {
    archetype:   'thrill-seeker',
    emoji:       '👻',
    label:       'Amateur de frissons',
    description: 'Horreur, tension, adrénaline — tu veux que ton cœur s\'emballe. Le calme, c\'est pour les autres.',
  },
  'emotional-viewer': {
    archetype:   'emotional-viewer',
    emoji:       '🥺',
    label:       'Spectateur émotionnel',
    description: 'Tu regardes pour ressentir. Les histoires qui touchent, qui émeuvent, qui restent.',
  },
  'twist-hunter': {
    archetype:   'twist-hunter',
    emoji:       '🎲',
    label:       'Chasseur de twists',
    description: 'Tu vis pour les retournements de situation. Prévisible = ennuyeux. Tu veux être surpris.',
  },
  'light-entertainment': {
    archetype:   'light-entertainment',
    emoji:       '😄',
    label:       'Divertissement léger',
    description: 'Après une longue journée, tu veux rire, sourire et te détendre — sans prise de tête.',
  },
  'immersive-worlds': {
    archetype:   'immersive-worlds',
    emoji:       '✨',
    label:       'Univers immersifs',
    description: 'Tu aimes t\'immerger dans des mondes riches — épopées, séries longues, univers étendus.',
  },
};

export function detectSpectatorProfile(profile: UserProfile): SpectatorProfileInfo {
  const m = profile.frequentMoods;
  const loved = profile.satisfactionLog.filter(
    e => e.rating === 'loved' || e.rating === 'good',
  ).length;
  const longDuration = profile.preferredDuration === 'several-days' ? 5 : 0;

  const scores: Record<SpectatorArchetype, number> = {
    'mystery-explorer':    (m['mind-bending'] ?? 0) * 3 + (m['surprised'] ?? 0),
    'thrill-seeker':       (m['scared']       ?? 0) * 3,
    'emotional-viewer':    (m['moved']        ?? 0) * 3 + loved,
    'twist-hunter':        (m['surprised']    ?? 0) * 3 + (m['mind-bending'] ?? 0),
    'light-entertainment': (m['laugh']        ?? 0) * 3 + (m['escape'] ?? 0),
    'immersive-worlds':    (m['escape']       ?? 0) * 3 + longDuration,
  };

  const top = (Object.entries(scores) as [SpectatorArchetype, number][])
    .sort(([, a], [, b]) => b - a)[0][0];

  return ARCHETYPE_INFO[top];
}

/** Returns true if the profile has enough data to detect a meaningful archetype */
export function hasEnoughData(profile: UserProfile): boolean {
  const totalMoods = Object.values(profile.frequentMoods).reduce((s, v) => s + v, 0);
  return totalMoods >= 2;
}
