import type { UserProfile, Recommendation } from '../types';

const MOOD_LABELS: Record<string, string> = {
  'mind-bending': 'les films qui retournent le cerveau',
  scared:         'les thrillers et films d\'horreur',
  laugh:          'les comédies',
  moved:          'les films émouvants',
  escape:         'les films d\'évasion',
  surprised:      'les films à rebondissements',
};

const PLATFORM_LABELS: Record<string, string> = {
  Netflix:       'Netflix',
  'Prime Video': 'Prime Video',
  'Disney+':     'Disney+',
  'Canal+':      'Canal+',
  'Apple TV+':   'Apple TV+',
  Max:           'Max',
};

export function generateInsights(profile: UserProfile, allItems: Recommendation[]): string[] {
  const insights: string[] = [];
  const itemMap = new Map(allItems.map(i => [i.id, i]));

  // Not enough data
  const totalActions =
    profile.seenItems.length + profile.likedItems.length + profile.satisfactionLog.length;
  if (totalActions < 3) return [];

  // 1 — Favourite mood
  const moodEntries = Object.entries(profile.frequentMoods)
    .sort(([, a], [, b]) => b - a);
  if (moodEntries.length > 0 && moodEntries[0][1] >= 2) {
    const topMood = moodEntries[0][0];
    insights.push(`Tu sembles préférer ${MOOD_LABELS[topMood] ?? topMood}.`);
  }

  // 2 — Content type preference
  const seenMovies = profile.seenItems.filter(id => {
    const meta = profile.itemMetaStore[id];
    const item = itemMap.get(id);
    return (meta?.type ?? item?.type) === 'movie';
  }).length;
  const seenSeries = profile.seenItems.filter(id => {
    const meta = profile.itemMetaStore[id];
    const item = itemMap.get(id);
    return (meta?.type ?? item?.type) === 'series';
  }).length;
  if (seenMovies > seenSeries * 2) {
    insights.push('Tu regardes principalement des films plutôt que des séries.');
  } else if (seenSeries > seenMovies * 2) {
    insights.push('Tu es plutôt adepte des séries — tu aimes t\'immerger dans des univers longs.');
  }

  // 3 — Duration preference
  if (profile.preferredDuration === 'under-90') {
    insights.push('Tu préfères les contenus courts — moins de 1h30.');
  } else if (profile.preferredDuration === 'evening') {
    insights.push('Tu aimes te lancer dans de grandes soirées cinéma.');
  }

  // 4 — Satisfaction rate
  const satLog = profile.satisfactionLog;
  if (satLog.length >= 5) {
    const positives = satLog.filter(e => e.rating === 'loved' || e.rating === 'good').length;
    const rate = Math.round(positives / satLog.length * 100);
    if (rate >= 80) {
      insights.push(`MoodFlix te correspond bien — ${rate}% de tes visionnages t'ont plu.`);
    } else if (rate < 50) {
      insights.push('Les recommandations peuvent encore être affinées — continue à noter tes visionnages.');
    }
  }

  // 5 — Favourite platform
  const plat = profile.preferredPlatforms.filter(p => p !== 'any');
  if (plat.length === 1 && PLATFORM_LABELS[plat[0]]) {
    insights.push(`${PLATFORM_LABELS[plat[0]]} est ta plateforme principale.`);
  }

  // 6 — Liked titles
  const lovedCount = satLog.filter(e => e.rating === 'loved').length;
  if (lovedCount >= 3) {
    insights.push(`Tu as adoré ${lovedCount} contenus jusqu'ici — ton profil est bien défini.`);
  }

  // 7 — Calibration quality
  const calibLiked = profile.likedItems.filter(id => id >= 9001).length;
  if (calibLiked >= 5) {
    insights.push(`Tu as calibré ${calibLiked} films classiques aimés — tes recommandations sont précises.`);
  }

  return insights.slice(0, 5);
}
