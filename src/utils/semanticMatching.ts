import type { Recommendation, UserProfile, Mood } from '../types';

export interface CompatibilityScore {
  total: number;       // 0–100
  breakdown: string[]; // up to 3 short reasons
}

export function computeCompatibility(
  item: Recommendation,
  profile: UserProfile | null,
  mood: Mood | null,
): CompatibilityScore {
  if (!profile) return { total: 0, breakdown: [] };

  let score    = 0;
  const parts: string[] = [];

  // 1. Current mood match (0–30 pts)
  if (mood && item.moods.includes(mood)) {
    score += 30;
    parts.push('Humeur du moment ✓');
  }

  // 2. Historical mood match (0–24 pts)
  const topMoods = (Object.entries(profile.frequentMoods) as [Mood, number][])
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([m]) => m);

  const moodOverlap = topMoods.filter(m => item.moods.includes(m)).length;
  if (moodOverlap > 0) {
    score += moodOverlap * 8;
    parts.push(`${moodOverlap} humeur${moodOverlap > 1 ? 's' : ''} favorite${moodOverlap > 1 ? 's' : ''}`);
  }

  // 3. Duration preference (0–15 pts)
  if (profile.preferredDuration && profile.preferredDuration === item.durationCategory) {
    score += 15;
    parts.push('Durée idéale');
  }

  // 4. Platform preference (0–12 pts — silent, no breakdown)
  if (profile.preferredPlatforms.some(p => item.platforms.includes(p))) {
    score += 12;
  }

  // 5. Satisfaction alignment (0–20 pts)
  const badReasons = profile.satisfactionLog
    .filter(e => e.rating === 'disappointed' || e.rating === 'bad')
    .flatMap(e => e.reasons);

  const lovedCount = profile.satisfactionLog.filter(
    e => e.rating === 'loved' || e.rating === 'good',
  ).length;

  let satBonus = 0;
  if (lovedCount >= 2) {
    if (item.mysteryScore   >= 7) satBonus += 5;
    if (item.emotionScore   >= 7) satBonus += 5;
    if (item.complexityScore >= 7 && !badReasons.includes('trop-complique')) satBonus += 5;
    if (item.humorScore     >= 7) satBonus += 5;
  }

  // Penalties from known dislikes
  if (badReasons.includes('trop-lent')      && ['evening', 'several-days'].includes(item.durationCategory)) satBonus -= 12;
  if (badReasons.includes('trop-complique') && item.complexityScore >= 8)  satBonus -= 12;
  if (badReasons.includes('trop-violent')   && item.fearScore >= 8)        satBonus -= 12;

  score += Math.max(0, Math.min(20, satBonus));

  // 6. Content richness bonus (0–5 pts)
  if (item.tags.length >= 4) score += 5;

  const total = Math.min(100, Math.max(0, score));

  // Add a bonus reason if score is very high
  if (total >= 80 && parts.length < 3) parts.push('Profil très compatible');

  return { total, breakdown: parts.slice(0, 3) };
}

/** Returns a short label for the compatibility level */
export function compatibilityLabel(total: number): string {
  if (total >= 80) return 'Très compatible';
  if (total >= 60) return 'Bonne compatibilité';
  if (total >= 40) return 'Compatible';
  if (total >= 20) return 'Découverte';
  return '';
}
