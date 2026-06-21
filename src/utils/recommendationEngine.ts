import type { UserChoices, Recommendation, ScoredRecommendation, UserProfile, QuickVibe } from '../types';

// Build a frequency map of tags+moods from items the user liked/saved
// Used to reward items semantically similar to what the user already enjoyed
function buildLikedTagMap(
  profile: UserProfile | null,
  allItems: Recommendation[],
): Map<string, number> {
  if (!profile) return new Map();

  const likedIds = new Set([
    ...profile.wantToWatchItems,
    ...profile.likedItems,
    ...profile.satisfactionLog
      .filter(e => e.rating === 'loved' || e.rating === 'good')
      .map(e => e.itemId),
  ]);

  if (likedIds.size === 0) return new Map();

  const tagMap = new Map<string, number>();
  for (const item of allItems) {
    if (!likedIds.has(item.id)) continue;
    for (const tag of item.tags) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
    // Moods have higher weight — they're stronger signals
    for (const mood of item.moods) {
      const key = `mood:${mood}`;
      tagMap.set(key, (tagMap.get(key) ?? 0) + 2);
    }
  }
  return tagMap;
}

// Compute tag similarity bonus for a single item (max 30 pts)
function tagSimilarityBonus(
  item: Recommendation,
  likedTagMap: Map<string, number>,
): number {
  if (likedTagMap.size === 0) return 0;
  let bonus = 0;
  for (const tag of item.tags) {
    bonus += (likedTagMap.get(tag) ?? 0) * 4;
  }
  for (const mood of item.moods) {
    bonus += (likedTagMap.get(`mood:${mood}`) ?? 0) * 5;
  }
  return Math.min(30, bonus);
}

export function scoreRecommendation(
  item: Recommendation,
  choices: UserChoices,
  profile: UserProfile | null,
  likedTagMap: Map<string, number> = new Map(),
): number {
  let score = 0;
  const log: string[] = [];

  // === BASE MATCHING ===

  // Mood match — primary signal (60 pts, was 40)
  if (choices.mood && item.moods.includes(choices.mood)) {
    score += 60;
    log.push(`  +60 humeur (${choices.mood})`);
  } else if (choices.mood) {
    log.push(`   +0 humeur (${item.moods.join('/')} ≠ ${choices.mood})`);
  }

  // Tag similarity from liked items (max 30 pts)
  const tagBonus = tagSimilarityBonus(item, likedTagMap);
  if (tagBonus > 0) {
    score += tagBonus;
    log.push(`  +${tagBonus} similarité profil (tags aimés)`);
  }

  // Duration match (15 pts)
  if (choices.duration === null || choices.duration === item.durationCategory) {
    score += 15;
    log.push(`  +15 durée (${item.durationCategory})`);
  } else {
    const order = ['under-90', 'two-hours', 'evening', 'several-days'];
    const chosen = order.indexOf(choices.duration);
    const itemDur = order.indexOf(item.durationCategory);
    const diff = Math.abs(chosen - itemDur);
    if (diff === 1) {
      score += 5;
      log.push(`   +5 durée (proche — ${item.durationCategory})`);
    } else {
      log.push(`   +0 durée (${item.durationCategory} ≠ ${choices.duration})`);
    }
  }

  // Platform match — kept as light bonus since hard filter already enforces
  if (choices.platforms.length === 0 || choices.platforms.includes('any')) {
    score += 8;
    log.push(`   +8 plateforme (toutes)`);
  } else {
    const matching = choices.platforms.filter(p => item.platforms.includes(p));
    if (matching.length > 0) {
      score += 12;
      log.push(`  +12 plateforme (${matching.join(', ')})`);
    }
  }

  // Type match — light bonus since hard filter already enforces
  if (choices.type === 'both' || choices.type === null) {
    score += 5;
  } else if (choices.type === item.type) {
    score += 10;
    log.push(`  +10 type (${item.type} ✓)`);
  }

  if (!profile) {
    console.debug(`[MoodFlix] ${item.title} (${item.type})\n${log.join('\n')}\n  → Score: ${score}`);
    return score;
  }

  // === PROFILE-BASED ADJUSTMENTS ===

  // Hard exclusions
  if (profile.seenItems.includes(item.id)) {
    console.debug(`[MoodFlix] ✗ ${item.title} — exclu (déjà vu)`);
    return -1000;
  }
  if (profile.dislikedItems.includes(item.id)) {
    console.debug(`[MoodFlix] ✗ ${item.title} — exclu (pas mon style)`);
    return -500;
  }

  // tooLong penalty
  if (profile.tooLongItems.includes(item.id)) {
    score -= 30;
    log.push(`  -30 trop long (signalé)`);
  }
  if (profile.tooLongItems.length >= 3) {
    if (item.durationCategory === 'several-days') {
      score -= 12;
      log.push(`  -12 longue durée (pattern trop-long)`);
    }
    if (item.duration && item.duration > 150) {
      score -= 8;
      log.push(`   -8 durée > 150 min`);
    }
  }

  // Recency penalty — avoid repeating recent suggestions
  const histEntry = profile.recommendedHistory.find(e => e.itemId === item.id);
  if (histEntry) {
    const daysSince = (Date.now() - new Date(histEntry.date).getTime()) / 86_400_000;
    if (daysSince < 1) {
      score -= 30;
      log.push(`  -30 recommandé aujourd'hui`);
    } else if (daysSince < 3) {
      score -= 18;
      log.push(`  -18 recommandé il y a ${Math.round(daysSince)}j`);
    } else if (daysSince < 7) {
      score -= 8;
      log.push(`   -8 recommandé il y a ${Math.round(daysSince)}j`);
    }
  }

  // Platform preference bonus (user's saved profile platforms)
  const platformOverlap = profile.preferredPlatforms.filter(p => item.platforms.includes(p));
  if (platformOverlap.length > 0) {
    score += 8;
    log.push(`   +8 plateforme favorite`);
  }

  // Frequent mood bonus — reward consistency
  if (choices.mood) {
    const freq = profile.frequentMoods[choices.mood] ?? 0;
    const moodBonus = Math.min(12, freq * 2);
    if (moodBonus > 0) {
      score += moodBonus;
      log.push(`   +${moodBonus} humeur habituelle (${freq}×)`);
    }
  }

  // Satisfaction-driven adjustments
  const badReasons = profile.satisfactionLog
    .filter(e => e.rating === 'disappointed' || e.rating === 'bad')
    .flatMap(e => e.reasons);

  if (badReasons.includes('trop-lent') && ['evening', 'several-days'].includes(item.durationCategory)) {
    score -= 10;
    log.push(`  -10 rythme lent signalé`);
  }
  if (badReasons.includes('trop-complique') && item.complexityScore >= 8) {
    score -= 10;
    log.push(`  -10 trop complexe signalé`);
  }
  if (badReasons.includes('trop-violent') && item.fearScore >= 8) {
    score -= 10;
    log.push(`  -10 violence signalée`);
  }
  if (badReasons.includes('pas-mysterieux') && item.mysteryScore <= 4) {
    score -= 6;
    log.push(`   -6 pas assez mystérieux signalé`);
  }

  // Bonus for high mystery when user has loved content before
  if (
    profile.satisfactionLog.some(e => e.rating === 'loved') &&
    item.mysteryScore >= 8 &&
    badReasons.length === 0
  ) {
    score += 5;
    log.push(`   +5 haute note mystère + historique positif`);
  }

  console.debug(`[MoodFlix] ${item.title} (${item.type})\n${log.join('\n')}\n  → Score: ${score}`);
  return score;
}

function noise(): number {
  return (Math.random() - 0.5) * 6; // ±3 pts
}

export function getTopRecommendations(
  items: Recommendation[],
  choices: UserChoices,
  profile: UserProfile | null,
  count = 3,
  excludeIds: number[] = []
): ScoredRecommendation[] {

  const likedTagMap = buildLikedTagMap(profile, items);

  console.debug(
    `[MoodFlix] === Recherche ===\n` +
    `  humeur: ${choices.mood ?? 'aucune'} | type: ${choices.type ?? 'tous'} | ` +
    `durée: ${choices.duration ?? 'toutes'} | plateformes: ${choices.platforms.join(', ') || 'toutes'}\n` +
    (likedTagMap.size > 0
      ? `  Goûts détectés: ${[...likedTagMap.entries()].sort(([,a],[,b])=>b-a).slice(0,5).map(([k,v])=>`${k}(${v})`).join(', ')}`
      : `  Pas encore de profil de goûts`)
  );

  const scored = items
    .filter(item => !excludeIds.includes(item.id))
    // Hard filter: type strict
    .filter(item => {
      if (!choices.type || choices.type === 'both') return true;
      const pass = item.type === choices.type;
      if (!pass) console.debug(`[MoodFlix] ✗ ${item.title} — filtré (${item.type} ≠ ${choices.type})`);
      return pass;
    })
    // Hard filter: plateformes strictes
    .filter(item => {
      if (!choices.platforms.length || choices.platforms.includes('any')) return true;
      const pass = choices.platforms.some(p => item.platforms.includes(p));
      if (!pass) console.debug(`[MoodFlix] ✗ ${item.title} — filtré (plateformes: ${item.platforms.join(', ')})`);
      return pass;
    })
    .map(item => ({ ...item, score: scoreRecommendation(item, choices, profile, likedTagMap) }))
    .filter(item => item.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      return Math.abs(diff) < 8 ? diff + noise() : diff;
    });

  console.debug(`[MoodFlix] ${scored.length} candidats retenus sur ${items.length} total`);

  if (scored.length === 0) return [];
  if (scored.length <= count) return scored;
  if (count < 3) return scored.slice(0, count);

  // Top 2 + 1 découverte fraîche
  const main = scored.slice(0, count - 1);
  const mainIds = new Set(main.map(i => i.id));

  const recentIds = new Set(
    (profile?.recommendedHistory ?? [])
      .filter(e => (Date.now() - new Date(e.date).getTime()) / 86_400_000 < 7)
      .map(e => e.itemId)
  );

  const pool = scored.slice(count - 1).filter(i => !mainIds.has(i.id));
  const freshDiscovery = pool.find(i => !recentIds.has(i.id));
  const discovery = freshDiscovery ?? pool[0];

  if (!discovery) return main;
  return [...main, { ...discovery, isDiscovery: true }];
}

export function getHiddenGem(
  items: Recommendation[],
  choices: UserChoices,
  profile: UserProfile | null,
  excludeIds: number[],
): ScoredRecommendation | null {
  const likedTagMap = buildLikedTagMap(profile, items);

  const recentIds = new Set(
    (profile?.recommendedHistory ?? [])
      .filter(e => (Date.now() - new Date(e.date).getTime()) / 86_400_000 < 14)
      .map(e => e.itemId),
  );

  const candidates = items
    .filter(item => !excludeIds.includes(item.id))
    .filter(item => !choices.type || choices.type === 'both' || item.type === choices.type)
    .filter(item => {
      if (!choices.platforms.length || choices.platforms.includes('any')) return true;
      return choices.platforms.some(p => item.platforms.includes(p));
    })
    .map(item => ({ ...item, score: scoreRecommendation(item, choices, profile, likedTagMap) }))
    .filter(item => item.score > 15 && item.score <= 70)
    .sort((a, b) => b.score - a.score);

  const fresh = candidates.filter(i => !recentIds.has(i.id));
  const gem = fresh[0] ?? candidates[0] ?? null;

  if (gem) console.debug(`[MoodFlix] 💎 Perle cachée: ${gem.title} (score ${gem.score})`);
  return gem ? { ...gem, isDiscovery: false } : null;
}

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
  const likedTagMap = buildLikedTagMap(profile, items);

  const scored = items
    .filter(item => !excludeIds.includes(item.id))
    .filter(item => type === 'both' || item.type === type)
    .map(item => {
      if (profile?.seenItems.includes(item.id)) return { ...item, score: -1000 };
      if (profile?.dislikedItems.includes(item.id)) return { ...item, score: -500 };

      let score = 0;
      if (moods.some(m => item.moods.includes(m))) score += 60;
      if (profile?.tooLongItems.includes(item.id)) score -= 30;
      if (profile?.preferredPlatforms.some(p => item.platforms.includes(p))) score += 8;

      // Tag similarity
      score += tagSimilarityBonus(item, likedTagMap);

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
      return Math.abs(diff) < 8 ? diff + noise() : diff;
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
