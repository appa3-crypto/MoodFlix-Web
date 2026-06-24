import type { UserChoices, Recommendation, ScoredRecommendation, UserProfile, QuickVibe } from '../types';

// ── DEBUG ────────────────────────────────────────────────────────────────────
const DEBUG = import.meta.env.DEV;

// ── MOOD → GENRE COMPATIBILITY ───────────────────────────────────────────────
// Maps each mood to a minimum score threshold for genre-specific attributes.
// Used to penalize items that are clearly wrong for the requested mood.

const MOOD_HUMOR_MIN: Partial<Record<string, number>> = {
  laugh: 4,   // comédies doivent avoir un score humour significatif
};

const MOOD_FEAR_MIN: Partial<Record<string, number>> = {
  scared: 4,  // horreur doit faire peur
};

const MOOD_EMOTION_MIN: Partial<Record<string, number>> = {
  moved: 6,   // drames doivent émouvoir
};

// Tags qui signalent un contenu incompatible avec "laugh"
const LAUGH_INCOMPATIBLE_TAGS = new Set([
  'war', 'guerre', 'genocide', 'concentration-camp', 'holocaust',
  'serial-killer', 'torture', 'gore', 'extreme-violence',
]);

// ── LIKED-TAG MAP ────────────────────────────────────────────────────────────

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
    for (const mood of item.moods) {
      const key = `mood:${mood}`;
      tagMap.set(key, (tagMap.get(key) ?? 0) + 2);
    }
  }
  return tagMap;
}

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

// ── EXPLAIN SCORE (debug) ────────────────────────────────────────────────────

export interface ScoreExplanation {
  total: number;
  moodMatch: boolean;
  reasons: string[];
  penalties: string[];
}

// ── CORE SCORER ──────────────────────────────────────────────────────────────

export function scoreRecommendation(
  item: Recommendation,
  choices: UserChoices,
  profile: UserProfile | null,
  likedTagMap: Map<string, number> = new Map(),
): number {
  let score = 0;
  const pos: string[] = [];
  const neg: string[] = [];

  // === MOOD MATCH — signal principal ===
  const moodRequested = choices.mood;
  const moodMatches   = moodRequested ? item.moods.includes(moodRequested) : true;

  if (moodRequested) {
    if (moodMatches) {
      score += 60;
      pos.push(`+60 humeur correspondante (${moodRequested})`);
    } else {
      // Pénalité significative si le mood ne correspond pas.
      // L'item ne peut survivre que s'il excelle dans toutes les autres dimensions.
      score -= 50;
      neg.push(`-50 humeur non correspondante (item: ${item.moods.join('/')} ≠ ${moodRequested})`);
    }
  }

  // === GENRE COMPATIBILITY ===
  // Pénalise les items dont les scores internes contredisent le mood demandé.

  if (moodRequested === 'laugh') {
    const humorMin = MOOD_HUMOR_MIN.laugh ?? 4;
    if (item.humorScore < humorMin) {
      score -= 20;
      neg.push(`-20 contenu peu drôle (humorScore ${item.humorScore} < ${humorMin})`);
    }
    if (item.fearScore >= 8) {
      score -= 15;
      neg.push(`-15 horreur intense incompatible avec rire (fearScore ${item.fearScore})`);
    }
    // Tags explicitement incompatibles avec une soirée comique
    const badTag = item.tags.find(t => LAUGH_INCOMPATIBLE_TAGS.has(t));
    if (badTag) {
      score -= 25;
      neg.push(`-25 tag incompatible avec rire: ${badTag}`);
    }
  }

  if (moodRequested === 'scared') {
    if (item.fearScore < (MOOD_FEAR_MIN.scared ?? 4)) {
      score -= 15;
      neg.push(`-15 contenu peu effrayant (fearScore ${item.fearScore})`);
    }
  }

  if (moodRequested === 'moved') {
    if (item.emotionScore < (MOOD_EMOTION_MIN.moved ?? 6)) {
      score -= 15;
      neg.push(`-15 contenu peu émouvant (emotionScore ${item.emotionScore})`);
    }
    // Un film d'action pur (faible émotion + faible humour + high action) va décevoir
    if (item.emotionScore <= 3 && item.humorScore <= 2) {
      score -= 10;
      neg.push(`-10 contenu trop sec pour s'émouvoir`);
    }
  }

  // === TAG SIMILARITY (profil utilisateur) ===
  const tagBonus = tagSimilarityBonus(item, likedTagMap);
  if (tagBonus > 0) {
    score += tagBonus;
    pos.push(`+${tagBonus} similarité avec tes goûts`);
  }

  // === DURÉE ===
  if (choices.duration === null || choices.duration === item.durationCategory) {
    score += 15;
    pos.push(`+15 durée (${item.durationCategory})`);
  } else {
    const order = ['under-90', 'two-hours', 'evening', 'several-days'];
    const chosen  = order.indexOf(choices.duration);
    const itemDur = order.indexOf(item.durationCategory);
    const diff    = Math.abs(chosen - itemDur);
    if (diff === 1) {
      score += 5;
      pos.push(`+5 durée proche (${item.durationCategory})`);
    } else {
      neg.push(`+0 durée éloignée (${item.durationCategory} ≠ ${choices.duration})`);
    }
  }

  // === PLATEFORME ===
  if (!choices.platforms.length || choices.platforms.includes('any')) {
    score += 8;
    pos.push(`+8 toutes plateformes`);
  } else {
    const matching = choices.platforms.filter(p => item.platforms.includes(p));
    if (matching.length > 0) {
      score += 12;
      pos.push(`+12 plateforme (${matching.join(', ')})`);
    }
  }

  // === TYPE ===
  if (!choices.type || choices.type === 'both') {
    score += 5;
  } else if (choices.type === item.type) {
    score += 10;
    pos.push(`+10 type (${item.type})`);
  }

  // === EXCLUSIONS PROFIL ===
  if (profile) {
    if (profile.seenItems.includes(item.id)) {
      if (DEBUG) console.debug(`[MoodFlix] ✗ ${item.title} — exclu (déjà vu)`);
      return -1000;
    }
    if (profile.dislikedItems.includes(item.id)) {
      if (DEBUG) console.debug(`[MoodFlix] ✗ ${item.title} — exclu (pas mon style)`);
      return -500;
    }

    // Pénalité trop long
    if (profile.tooLongItems.includes(item.id)) {
      score -= 30;
      neg.push(`-30 signalé trop long`);
    }
    if (profile.tooLongItems.length >= 3) {
      if (item.durationCategory === 'several-days') {
        score -= 12;
        neg.push(`-12 longue durée (pattern trop-long)`);
      }
      if (item.duration && item.duration > 150) {
        score -= 8;
        neg.push(`-8 durée > 150 min`);
      }
    }

    // Pénalité récence (évite les répétitions récentes)
    const histEntry = profile.recommendedHistory.find(e => e.itemId === item.id);
    if (histEntry) {
      const daysSince = (Date.now() - new Date(histEntry.date).getTime()) / 86_400_000;
      if (daysSince < 1) {
        score -= 30;
        neg.push(`-30 proposé aujourd'hui`);
      } else if (daysSince < 3) {
        score -= 18;
        neg.push(`-18 proposé il y a ${Math.round(daysSince)}j`);
      } else if (daysSince < 7) {
        score -= 8;
        neg.push(`-8 proposé il y a ${Math.round(daysSince)}j`);
      }
    }

    // Bonus plateforme favorite
    if (choices.platforms.length === 0 || choices.platforms.includes('any')) {
      const profilePlatformMatch = profile.preferredPlatforms.some(p => item.platforms.includes(p));
      if (profilePlatformMatch) {
        score += 8;
        pos.push(`+8 plateforme préférée`);
      }
    }

    // Bonus mood habituel
    if (moodRequested) {
      const freq      = profile.frequentMoods[moodRequested] ?? 0;
      const moodBonus = Math.min(12, freq * 2);
      if (moodBonus > 0) {
        score += moodBonus;
        pos.push(`+${moodBonus} humeur habituelle (${freq}×)`);
      }
    }

    // Ajustements satisfaction
    const badReasons = profile.satisfactionLog
      .filter(e => e.rating === 'disappointed' || e.rating === 'bad')
      .flatMap(e => e.reasons);

    if (badReasons.includes('trop-lent') && ['evening', 'several-days'].includes(item.durationCategory)) {
      score -= 10;
      neg.push(`-10 rythme lent signalé`);
    }
    if (badReasons.includes('trop-complique') && item.complexityScore >= 8) {
      score -= 10;
      neg.push(`-10 trop complexe signalé`);
    }
    if (badReasons.includes('trop-violent') && item.fearScore >= 8) {
      score -= 10;
      neg.push(`-10 violence signalée`);
    }
    if (badReasons.includes('pas-mysterieux') && item.mysteryScore <= 4) {
      score -= 6;
      neg.push(`-6 pas assez mystérieux signalé`);
    }
  }

  if (DEBUG) {
    const sign = score >= 0 ? '+' : '';
    console.debug(
      `[MoodFlix] ${moodMatches ? '✓' : '✗'} ${item.title} (${item.type})\n` +
      pos.map(r => `  ${r}`).join('\n') +
      (neg.length ? '\n' + neg.map(r => `  ${r}`).join('\n') : '') +
      `\n  → Score: ${sign}${score}`
    );
  }

  return score;
}

// Renvoie un objet lisible pour le mode debug UI
export function explainScore(
  item: Recommendation,
  choices: UserChoices,
  profile: UserProfile | null,
  likedTagMap: Map<string, number>,
): ScoreExplanation {
  const moodRequested = choices.mood;
  const moodMatches   = moodRequested ? item.moods.includes(moodRequested) : true;
  const reasons: string[] = [];
  const penalties: string[] = [];
  let total = 0;

  if (moodRequested) {
    if (moodMatches) { total += 60; reasons.push('Humeur ✓'); }
    else { total -= 50; penalties.push(`Humeur ✗ (${moodRequested})`); }
  }

  if (moodRequested === 'laugh' && item.humorScore < 4) {
    total -= 20; penalties.push(`Peu drôle (${item.humorScore}/10)`);
  }
  if (moodRequested === 'scared' && item.fearScore < 4) {
    total -= 15; penalties.push(`Peu effrayant (${item.fearScore}/10)`);
  }
  if (moodRequested === 'moved' && item.emotionScore < 6) {
    total -= 15; penalties.push(`Peu émouvant (${item.emotionScore}/10)`);
  }

  const tagBonus = tagSimilarityBonus(item, likedTagMap);
  if (tagBonus > 0) { total += tagBonus; reasons.push(`Goûts similaires +${tagBonus}`); }

  if (!choices.duration || choices.duration === item.durationCategory) {
    total += 15; reasons.push('Durée ✓');
  } else {
    total += 5; // rough
  }

  if (!choices.platforms.length || choices.platforms.includes('any') ||
      choices.platforms.some(p => item.platforms.includes(p))) {
    total += 12; reasons.push('Plateforme ✓');
  }

  if (profile?.seenItems.includes(item.id)) { total = -1000; penalties.push('Déjà vu'); }
  if (profile?.dislikedItems.includes(item.id)) { total = -500; penalties.push('Pas mon style'); }

  return { total, moodMatch: moodMatches, reasons, penalties };
}

// ── NOISE ────────────────────────────────────────────────────────────────────

function noise(): number {
  return (Math.random() - 0.5) * 6;
}

// ── DEDUP BY TITLE ───────────────────────────────────────────────────────────
// Évite que le même film apparaisse deux fois (ex: Knives Out dans recs ET calibration)

function dedupByTitle<T extends { id: number; title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.title.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── GET TOP RECOMMENDATIONS ──────────────────────────────────────────────────

export function getTopRecommendations(
  items: Recommendation[],
  choices: UserChoices,
  profile: UserProfile | null,
  count = 3,
  excludeIds: number[] = [],
): ScoredRecommendation[] {

  const likedTagMap = buildLikedTagMap(profile, items);

  if (DEBUG) {
    console.debug(
      `[MoodFlix] === Recherche ===\n` +
      `  humeur: ${choices.mood ?? 'aucune'} | type: ${choices.type ?? 'tous'} | ` +
      `durée: ${choices.duration ?? 'toutes'} | plateformes: ${choices.platforms.join(', ') || 'toutes'}\n` +
      (likedTagMap.size > 0
        ? `  Goûts: ${[...likedTagMap.entries()].sort(([,a],[,b])=>b-a).slice(0,5).map(([k,v])=>`${k}(${v})`).join(', ')}`
        : `  Pas encore de profil de goûts`)
    );
  }

  // Déduplication par titre avant scoring (évite les doublons recs+calibration)
  const unique = dedupByTitle(items);

  // Filtres durs : type + plateforme
  const candidates = unique
    .filter(item => !excludeIds.includes(item.id))
    .filter(item => {
      if (!choices.type || choices.type === 'both') return true;
      return item.type === choices.type;
    })
    .filter(item => {
      if (!choices.platforms.length || choices.platforms.includes('any')) return true;
      return choices.platforms.some(p => item.platforms.includes(p));
    });

  if (DEBUG) console.debug(`[MoodFlix] ${candidates.length} candidats après filtres durs`);

  // Scoring
  const scored = candidates
    .map(item => ({ ...item, score: scoreRecommendation(item, choices, profile, likedTagMap) }))
    .sort((a, b) => {
      const diff = b.score - a.score;
      return Math.abs(diff) < 8 ? diff + noise() : diff;
    });

  // PASS 1 : items avec score positif (humeur correspondante + critères ok)
  const strong = scored.filter(item => item.score > 0);

  if (DEBUG) console.debug(`[MoodFlix] ${strong.length} candidats score > 0`);

  // PASS 2 : si insuffisant, on élargit à tous les non-exclus (fallback visible)
  // Ces items auront un score négatif — on les marque isDiscovery pour UI différente
  const pool = strong.length >= count ? strong : scored.filter(item => item.score > -80);

  if (DEBUG) console.debug(`[MoodFlix] ${pool.length} candidats finaux`);

  if (pool.length === 0) return [];
  if (pool.length <= count) return pool;
  if (count < 3) return pool.slice(0, count);

  // Top (count-1) + 1 découverte fraîche
  const main   = pool.slice(0, count - 1);
  const mainIds = new Set(main.map(i => i.id));

  const recentIds = new Set(
    (profile?.recommendedHistory ?? [])
      .filter(e => (Date.now() - new Date(e.date).getTime()) / 86_400_000 < 7)
      .map(e => e.itemId)
  );

  const rest            = pool.slice(count - 1).filter(i => !mainIds.has(i.id));
  const freshDiscovery  = rest.find(i => !recentIds.has(i.id));
  const discovery       = freshDiscovery ?? rest[0];

  if (!discovery) return main;
  return [...main, { ...discovery, isDiscovery: true }];
}

// ── HIDDEN GEM ───────────────────────────────────────────────────────────────

export function getHiddenGem(
  items: Recommendation[],
  choices: UserChoices,
  profile: UserProfile | null,
  excludeIds: number[],
): ScoredRecommendation | null {
  const likedTagMap = buildLikedTagMap(profile, items);
  const unique = dedupByTitle(items);

  const recentIds = new Set(
    (profile?.recommendedHistory ?? [])
      .filter(e => (Date.now() - new Date(e.date).getTime()) / 86_400_000 < 14)
      .map(e => e.itemId),
  );

  const candidates = unique
    .filter(item => !excludeIds.includes(item.id))
    .filter(item => !choices.type || choices.type === 'both' || item.type === choices.type)
    .filter(item => {
      if (!choices.platforms.length || choices.platforms.includes('any')) return true;
      return choices.platforms.some(p => item.platforms.includes(p));
    })
    .map(item => ({ ...item, score: scoreRecommendation(item, choices, profile, likedTagMap) }))
    // Perle cachée : ni trop haute ni trop basse — une surprise potentielle
    .filter(item => item.score > 10 && item.score <= 75)
    .sort((a, b) => b.score - a.score);

  const fresh = candidates.filter(i => !recentIds.has(i.id));
  const gem   = fresh[0] ?? candidates[0] ?? null;

  if (gem && DEBUG) console.debug(`[MoodFlix] 💎 Perle cachée: ${gem.title} (score ${gem.score})`);
  return gem ? { ...gem, isDiscovery: false } : null;
}

// ── QUICK MODE ───────────────────────────────────────────────────────────────

const VIBE_MOODS: Record<QuickVibe, string[]> = {
  light:      ['laugh', 'escape'],
  intense:    ['moved', 'scared'],
  surprising: ['mind-bending', 'surprised'],
};

export function getQuickRecommendations(
  items: Recommendation[],
  type: 'movie' | 'series' | 'both',
  vibe: QuickVibe,
  profile: UserProfile | null,
  count = 3,
  excludeIds: number[] = [],
): ScoredRecommendation[] {
  const moods       = VIBE_MOODS[vibe];
  const likedTagMap = buildLikedTagMap(profile, items);
  const unique      = dedupByTitle(items);

  const scored = unique
    .filter(item => !excludeIds.includes(item.id))
    .filter(item => type === 'both' || item.type === type)
    .map(item => {
      if (profile?.seenItems.includes(item.id))    return { ...item, score: -1000 };
      if (profile?.dislikedItems.includes(item.id)) return { ...item, score: -500 };

      let score = 0;
      const moodMatch = moods.some(m => item.moods.includes(m));

      if (moodMatch) {
        score += 60;
      } else {
        // Même pénalité que le mode normal
        score -= 50;
        // Pénalité genre pour vibe "light"
        if (vibe === 'light' && item.humorScore < 4 && item.fearScore >= 7) {
          score -= 20;
        }
      }

      if (profile?.tooLongItems.includes(item.id))            score -= 30;
      if (profile?.preferredPlatforms.some(p => item.platforms.includes(p))) score += 8;

      score += tagSimilarityBonus(item, likedTagMap);

      const hist = profile?.recommendedHistory.find(e => e.itemId === item.id);
      if (hist) {
        const days = (Date.now() - new Date(hist.date).getTime()) / 86_400_000;
        if (days < 1)       score -= 30;
        else if (days < 3)  score -= 18;
        else if (days < 7)  score -= 8;
      }

      return { ...item, score };
    })
    .filter(item => item.score > -80)
    .sort((a, b) => {
      const diff = b.score - a.score;
      return Math.abs(diff) < 8 ? diff + noise() : diff;
    });

  if (scored.length === 0) return [];
  if (scored.length <= count) return scored;

  const main  = scored.slice(0, count - 1);
  const pool  = scored.slice(count - 1);

  const recentIds = new Set(
    (profile?.recommendedHistory ?? [])
      .filter(e => (Date.now() - new Date(e.date).getTime()) / 86_400_000 < 7)
      .map(e => e.itemId)
  );

  const discovery = pool.find(i => !recentIds.has(i.id)) ?? pool[0];
  return [...main, { ...discovery, isDiscovery: true }];
}
