import type { UserChoices, Recommendation, ScoredRecommendation, UserProfile, QuickVibe } from '../types';

// Base score for a single item (no noise, no exclusions)
export function scoreRecommendation(
  item: Recommendation,
  choices: UserChoices,
  profile: UserProfile | null
): number {
  let score = 0;

  // === BASE MATCHING ===

  // Mood match — most important (40 pts)
  if (choices.mood && item.moods.includes(choices.mood)) {
    score += 40;
  }

  // Platform match (25 pts)
  if (choices.platforms.length === 0 || choices.platforms.includes('any')) {
    score += 15;
  } else {
    const platformMatch = choices.platforms.some(p => item.platforms.includes(p));
    if (platformMatch) score += 25;
  }

  // Type match (20 pts)
  if (choices.type === 'both' || choices.type === null) {
    score += 10;
  } else if (choices.type === item.type) {
    score += 20;
  }

  // Duration match (15 pts)
  if (choices.duration === null || choices.duration === item.durationCategory) {
    score += 15;
  } else {
    const order = ['under-90', 'two-hours', 'evening', 'several-days'];
    const chosen = order.indexOf(choices.duration);
    const itemDur = order.indexOf(item.durationCategory);
    const diff = Math.abs(chosen - itemDur);
    if (diff === 1) score += 5;
  }

  // Reference bonus (20 pts max)
  if (choices.references.trim()) {
    const refs = choices.references
      .toLowerCase()
      .split(/[,\n]+/)
      .map(r => r.trim())
      .filter(Boolean);

    let refBonus = 0;
    for (const ref of refs) {
      const tagMatch = item.tags.some(
        tag => tag.toLowerCase().includes(ref) || ref.includes(tag.toLowerCase())
      );
      const titleMatch = item.title.toLowerCase().includes(ref);
      if (tagMatch || titleMatch) refBonus += 10;
    }
    score += Math.min(refBonus, 20);
  }

  if (!profile) return score;

  // === PROFILE-BASED ADJUSTMENTS ===

  // Hard exclusions
  if (profile.seenItems.includes(item.id)) return -1000;
  if (profile.dislikedItems.includes(item.id)) return -500;

  // tooLong penalty
  if (profile.tooLongItems.includes(item.id)) score -= 30;
  if (profile.tooLongItems.length >= 3) {
    if (item.durationCategory === 'several-days') score -= 12;
    if (item.duration && item.duration > 150) score -= 8;
  }

  // Recency penalty — items shown recently score lower to create variety
  const histEntry = profile.recommendedHistory.find(e => e.itemId === item.id);
  if (histEntry) {
    const daysSince = (Date.now() - new Date(histEntry.date).getTime()) / 86_400_000;
    if (daysSince < 1)       score -= 30;
    else if (daysSince < 3)  score -= 18;
    else if (daysSince < 7)  score -= 8;
  }

  // Platform preference bonus
  const platformOverlap = profile.preferredPlatforms.filter(p => item.platforms.includes(p));
  if (platformOverlap.length > 0) score += 8;

  // Frequent mood bonus
  if (choices.mood) {
    const freq = profile.frequentMoods[choices.mood] ?? 0;
    if (freq >= 3) score += 5;
  }

  // Satisfaction-driven adjustments
  const badReasons = profile.satisfactionLog
    .filter(e => e.rating === 'disappointed' || e.rating === 'bad')
    .flatMap(e => e.reasons);

  if (badReasons.includes('trop-lent') && ['evening', 'several-days'].includes(item.durationCategory)) score -= 6;
  if (badReasons.includes('trop-complique') && item.complexityScore >= 8) score -= 6;
  if (badReasons.includes('trop-violent') && item.fearScore >= 8) score -= 6;
  if (badReasons.includes('pas-mysterieux') && item.mysteryScore <= 4) score -= 4;

  // Loved content bonus (simple)
  if (
    profile.satisfactionLog.some(e => e.rating === 'loved') &&
    item.mysteryScore >= 8 &&
    badReasons.length === 0
  ) {
    score += 3;
  }

  return score;
}

// Tiny noise injected to break ties between close-scoring items
function noise(): number {
  return (Math.random() - 0.5) * 8; // ±4 pts
}

export function getTopRecommendations(
  items: Recommendation[],
  choices: UserChoices,
  profile: UserProfile | null,
  count = 3,
  excludeIds: number[] = []
): ScoredRecommendation[] {
  const scored = items
    .filter(item => !excludeIds.includes(item.id))
    .map(item => ({ ...item, score: scoreRecommendation(item, choices, profile) }))
    .filter(item => item.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      // Inject noise only when scores are very close (within 10 pts)
      return Math.abs(diff) < 10 ? diff + noise() : diff;
    });

  if (scored.length === 0) return [];
  if (scored.length <= count) return scored;
  if (count < 3) return scored.slice(0, count);

  // 2 top recommendations + 1 discovery slot
  const main = scored.slice(0, count - 1);
  const mainIds = new Set(main.map(i => i.id));

  // Discovery: prefer items NOT recently recommended
  const recentIds = new Set(
    (profile?.recommendedHistory ?? [])
      .filter(e => {
        const days = (Date.now() - new Date(e.date).getTime()) / 86_400_000;
        return days < 7;
      })
      .map(e => e.itemId)
  );

  const pool = scored.slice(count - 1).filter(i => !mainIds.has(i.id));
  const freshDiscovery = pool.find(i => !recentIds.has(i.id));
  const discovery = freshDiscovery ?? pool[0];

  if (!discovery) return main;

  return [...main, { ...discovery, isDiscovery: true }];
}

// V4 — Hidden gem: decent score but NOT in the top results, never recently shown
export function getHiddenGem(
  items: Recommendation[],
  choices: UserChoices,
  profile: UserProfile | null,
  excludeIds: number[],
): ScoredRecommendation | null {
  const recentIds = new Set(
    (profile?.recommendedHistory ?? [])
      .filter(e => (Date.now() - new Date(e.date).getTime()) / 86_400_000 < 14)
      .map(e => e.itemId),
  );

  const candidates = items
    .filter(item => !excludeIds.includes(item.id))
    .map(item => ({ ...item, score: scoreRecommendation(item, choices, profile) }))
    .filter(item => item.score > 15 && item.score <= 55) // decent but not top
    .sort((a, b) => b.score - a.score);

  // Prefer items never recently shown
  const fresh = candidates.filter(i => !recentIds.has(i.id));
  const gem   = fresh[0] ?? candidates[0] ?? null;

  return gem ? { ...gem, isDiscovery: false } : null;
}

// Quick mode (2-question flow)
const VIBE_MOODS: Record<QuickVibe, string[]> = {
  light: ['laugh', 'escape'],
  intense: ['moved', 'scared'],
  surprising: ['mind-bending', 'surprised'],
};

export function getQuickRecommendations(
  items: Recommendation[],
  type: 'movie' | 'series' | 'both',
  vibe: QuickVibe,
  profile: UserProfile | null,
  count = 3,
  excludeIds: number[] = []
): ScoredRecommendation[] {
  const moods = VIBE_MOODS[vibe];

  const scored = items
    .filter(item => !excludeIds.includes(item.id))
    .map(item => {
      if (profile?.seenItems.includes(item.id)) return { ...item, score: -1000 };
      if (profile?.dislikedItems.includes(item.id)) return { ...item, score: -500 };

      let score = 0;
      if (moods.some(m => item.moods.includes(m))) score += 40;
      if (type === 'both' || item.type === type) score += 20;
      if (profile?.tooLongItems.includes(item.id)) score -= 30;
      if (profile?.preferredPlatforms.some(p => item.platforms.includes(p))) score += 8;

      // Recency penalty
      const hist = profile?.recommendedHistory.find(e => e.itemId === item.id);
      if (hist) {
        const days = (Date.now() - new Date(hist.date).getTime()) / 86_400_000;
        if (days < 1) score -= 30;
        else if (days < 3) score -= 18;
        else if (days < 7) score -= 8;
      }

      return { ...item, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      return Math.abs(diff) < 10 ? diff + noise() : diff;
    });

  if (scored.length === 0) return [];
  if (scored.length <= count) return scored;

  const main = scored.slice(0, count - 1);
  const pool = scored.slice(count - 1);

  const recentIds = new Set(
    (profile?.recommendedHistory ?? [])
      .filter(e => (Date.now() - new Date(e.date).getTime()) / 86_400_000 < 7)
      .map(e => e.itemId)
  );

  const discovery = pool.find(i => !recentIds.has(i.id)) ?? pool[0];
  return [...main, { ...discovery, isDiscovery: true }];
}
