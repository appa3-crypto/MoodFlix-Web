import type { Recommendation, UserProfile, Mood } from '../types';

export interface CompatibilityScore {
  total: number;       // 0–100 (displayed as %)
  breakdown: string[]; // up to 3 short reasons
}

export function computeCompatibility(
  item: Recommendation,
  profile: UserProfile | null,
  mood: Mood | null,
): CompatibilityScore {
  if (!profile) return { total: 0, breakdown: [] };

  let raw    = 0;
  const parts: string[] = [];

  // 1. Current mood match (0–30 pts)
  if (mood && item.moods.includes(mood)) {
    raw += 30;
    parts.push('Humeur du moment ✓');
  }

  // 2. Historical mood match (0–24 pts)
  const topMoods = (Object.entries(profile.frequentMoods) as [Mood, number][])
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([m]) => m);

  const moodOverlap = topMoods.filter(m => item.moods.includes(m)).length;
  if (moodOverlap > 0) {
    raw += moodOverlap * 8;
    parts.push(`${moodOverlap} humeur${moodOverlap > 1 ? 's' : ''} favorite${moodOverlap > 1 ? 's' : ''}`);
  }

  // 3. Duration preference (0–15 pts)
  if (profile.preferredDuration && profile.preferredDuration === item.durationCategory) {
    raw += 15;
    parts.push('Durée idéale');
  }

  // 4. Platform preference (0–12 pts — silent)
  if (profile.preferredPlatforms.some(p => item.platforms.includes(p))) {
    raw += 12;
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

  if (badReasons.includes('trop-lent')      && ['evening', 'several-days'].includes(item.durationCategory)) satBonus -= 12;
  if (badReasons.includes('trop-complique') && item.complexityScore >= 8)  satBonus -= 12;
  if (badReasons.includes('trop-violent')   && item.fearScore >= 8)        satBonus -= 12;

  raw += Math.max(0, Math.min(20, satBonus));

  // 6. Tag richness (0–5 pts)
  if (item.tags.length >= 4) raw += 5;

  // ── CURVE ──────────────────────────────────────────────────────────────────
  // Map 0-106 raw pts → 55-100% displayed
  // New user with good mood match (47 raw) → 75%
  // User with history + mood (80 raw)      → 89%
  // Excellent profile alignment (106 raw)  → 100%
  const MAX_RAW = 106;
  const curved  = Math.round(55 + (Math.min(raw, MAX_RAW) / MAX_RAW) * 45);
  const total   = Math.min(100, Math.max(0, curved));

  if (total >= 90 && parts.length < 3) parts.push('Profil très compatible');

  return { total, breakdown: parts.slice(0, 3) };
}

export function compatibilityLabel(total: number): string {
  if (total >= 90) return 'Excellent match';
  if (total >= 78) return 'Très compatible';
  if (total >= 65) return 'Compatible';
  return '';
}
