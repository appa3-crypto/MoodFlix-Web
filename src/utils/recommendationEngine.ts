import type { UserChoices, Recommendation, ScoredRecommendation, UserProfile, QuickVibe } from '../types';

// Detailed score breakdown with console debug output
export function scoreRecommendation(
  item: Recommendation,
  choices: UserChoices,
  profile: UserProfile | null
): number {
  let score = 0;
  const log: string[] = [];

  // === BASE MATCHING ===

  // Mood match (40 pts)
  if (choices.mood && item.moods.includes(choices.mood)) {
    score += 40;
    log.push(`  +40 humeur (${choices.mood})`);
  } else if (choices.mood) {
    log.push(`   +0 humeur (${item.moods.join('/')} ≠ ${choices.mood})`);
  }

  // Platform match (25 pts)
  if (choices.platforms.length === 0 || choices.platforms.includes('any')) {
    score += 15;
    log.push(`  +15 plateforme (toutes)`);
  } else {
    const matching = choices.platforms.filter(p => item.platforms.includes(p));
    if (matching.length > 0) {
      score += 25;
      log.push(`  +25 plateforme (${matching.join(', ')})`);
    } else {
      log.push(`   +0 plateforme (aucune parmi ${item.platforms.join(', ')})`);
    }
  }

  // Type match (20 pts)
  if (choices.type === 'both' || choices.type === null) {
    score += 10;
    log.push(`  +10 type (les deux)`);
  } else if (choices.type === item.type) {
    score += 20;
    log.push(`  +20 type (${item.type} ✓)`);
  } else {
    log.push(`   +0 type (${item.type} ≠ ${choices.type})`);
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
    const refFinal = Math.min(refBonus, 20);
    if (refFinal > 0) {
      score += refFinal;
      log.push(`  +${refFinal} références`);
    }
  }

  if (!profile) {
    console.debug(`[MoodFlix] ${item.title} (${item.type})\n${log.join('\n')}\n  → Score: ${score}`);
    return score;
  }

  // === PROFILE-BASED ADJUSTMENTS ===

  // Hard exclusions
  if (profile.seenItems.includes(item.id)) {
    log.push(`  -∞ déjà vu`);
    console.debug(`[MoodFlix] ${item.title} (${item.type})\n${log.join('\n')}\n  → Score: -1000 (exclu)`);
    return -1000;
  }
  if (profile.dislikedItems.includes(item.id)) {
    log.push(`  -∞ pas mon style`);
    console.debug(`[MoodFlix] ${item.title} (${item.type})\n${log.join('\n')}\n  → Score: -500 (exclu)`);
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

  // Recency penalty
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

  // Platform preference bonus
  const platformOverlap = profile.preferredPlatforms.filter(p => item.platforms.includes(p));
  if (platformOverlap.length > 0) {
    score += 8;
    log.push(`   +8 plateforme favorite (${platformOverlap.join(', ')})`);
  }

  // Frequent mood bonus
  if (choices.mood) {
    const freq = profile.frequentMoods[choices.mood] ?? 0;
    if (freq >= 3) {
      score += 5;
      log.push(`   +5 humeur favorite (${freq}×)`);
    }
  }

  // Satisfaction-driven adjustments
  const badReasons = profile.satisfactionLog
    .filter(e => e.rating === 'disappointed' || e.rating === 'bad')
    .flatMap(e => e.reasons);

  if (badReasons.includes('trop-lent') && ['evening', 'several-days'].includes(item.durationCategory)) {
    score -= 6;
    log.push(`   -6 rythme lent signalé`);
  }
  if (badReasons.includes('trop-complique') && item.complexityScore >= 8) {
    score -= 6;
    log.push(`   -6 trop complexe signalé`);
  }
  if (badReasons.includes('trop-violent') && item.fearScore >= 8) {
    score -= 6;
    log.push(`   -6 violence signalée`);
  }
  if (badReasons.includes('pas-mysterieux') && item.mysteryScore <= 4) {
    score -= 4;
    log.push(`   -4 pas assez mystérieux signalé`);
  }

  if (
    profile.satisfactionLog.some(e => e.rating === 'loved') &&
    item.mysteryScore >= 8 &&
    badReasons.length === 0
  ) {
    score += 3;
    log.push(`   +3 haute note mystère`);
  }

  console.debug(`[MoodFlix] ${item.title} (${item.type})\n${log.join('\n')}\n  → Score: ${score}`);
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

  console.debug(
    `[MoodFlix] === Recherche ===\n` +
    `  humeur: ${choices.mood ?? 'aucune'}\n` +
    `  type: ${choices.type ?? 'tous'}\n` +
    `  durée: ${choices.duration ?? 'toutes'}\n` +
    `  plateformes: ${choices.platforms.join(', ') || 'toutes'}\n` +
    `  références: ${choices.references || 'aucune'}`
  );

  const scored = items
    .filter(item => !excludeIds.includes(item.id))
    // Hard filter: type — aucune série si "film" demandé et vice-versa
    .filter(item => {
      if (!choices.type || choices.type === 'both') return true;
      const pass = item.type === choices.type;
      if (!pass) console.debug(`[MoodFlix] ✗ ${item.title} — filtré (type ${item.type} ≠ ${choices.type})`);
      return pass;
    })
    // Hard filter: plateformes — exclure si aucune plateforme commune
    .filter(item => {
      if (!choices.platforms.length || choices.platforms.includes('any')) return true;
      const pass = choices.platforms.some(p => item.platforms.includes(p));
      if (!pass) console.debug(`[MoodFlix] ✗ ${item.title} — filtré (plateformes: ${item.platforms.join(', ')})`);
      return pass;
    })
    .map(item => ({ ...item, score: scoreRecommendation(item, choices, profile) }))
    .filter(item => item.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      return Math.abs(diff) < 10 ? diff + noise() : diff;
    });

  console.debug(`[MoodFlix] ${scored.length} candidats après filtres et score`);

  if (scored.length === 0) return [];
  if (scored.length <= count) return scored;
  if (count < 3) return scored.slice(0, count);

  // 2 top + 1 découverte
  const main = scored.slice(0, count - 1);
  const mainIds = new Set(main.map(i => i.id));

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
    // Same hard filters as getTopRecommendations
    .filter(item => !choices.type || choices.type === 'both' || item.type === choices.type)
    .filter(item => {
      if (!choices.platforms.length || choices.platforms.includes('any')) return true;
      return choices.platforms.some(p => item.platforms.includes(p));
    })
    .map(item => ({ ...item, score: scoreRecommendation(item, choices, profile) }))
    .filter(item => item.score > 15 && item.score <= 55)
    .sort((a, b) => b.score - a.score);

  const fresh = candidates.filter(i => !recentIds.has(i.id));
  const gem   = fresh[0] ?? candidates[0] ?? null;

  if (gem) console.debug(`[MoodFlix] 💎 Perle cachée: ${gem.title} (score ${gem.score})`);

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
    // Hard type filter — quick mode also respecte le type choisi
    .filter(item => type === 'both' || item.type === type)
    .map(item => {
      if (profile?.seenItems.includes(item.id)) return { ...item, score: -1000 };
      if (profile?.dislikedItems.includes(item.id)) return { ...item, score: -500 };

      let score = 0;
      if (moods.some(m => item.moods.includes(m))) score += 40;
      if (profile?.tooLongItems.includes(item.id)) score -= 30;
      if (profile?.preferredPlatforms.some(p => item.platforms.includes(p))) score += 8;

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
