import type { UserChoices, Recommendation, ScoredRecommendation, UserProfile, QuickVibe } from '../types';

// ── DEBUG ────────────────────────────────────────────────────────────────────
const DEBUG = import.meta.env.DEV;

// ── MOOD → GENRE COMPATIBILITY ───────────────────────────────────────────────

const MOOD_FEAR_MIN: Partial<Record<string, number>> = {
  scared: 4,
};

const MOOD_EMOTION_MIN: Partial<Record<string, number>> = {
  moved: 6,
};

// Tags qui signalent un contenu incompatible avec "laugh"
const LAUGH_INCOMPATIBLE_TAGS = new Set([
  'war', 'guerre', 'genocide', 'concentration-camp', 'holocaust',
  'serial-killer', 'torture', 'gore', 'extreme-violence',
]);

// ── INFER INTENT ─────────────────────────────────────────────────────────────
// Déduit l'intention principale d'un contenu depuis ses scores internes.
// Utilisé pour le scoring, le prompt IA et le debug overlay.

export type RecommendationIntent =
  | 'pure_comedy' | 'light_fun' | 'emotional_drama' | 'dark_thriller'
  | 'mystery' | 'action_escape' | 'comfort_watch' | 'mind_bending';

export function inferIntent(item: { humorScore: number; fearScore: number; emotionScore: number; mysteryScore: number; complexityScore: number; tags: string[] }): RecommendationIntent {
  const h = item.humorScore, f = item.fearScore, e = item.emotionScore;
  const m = item.mysteryScore, c = item.complexityScore;
  const hasAction = item.tags.some(t =>
    ['action', 'aventure', 'superhero', 'heist', 'espionnage', 'adventure', 'western'].includes(t)
  );

  if (f >= 7) return 'dark_thriller';
  if (m >= 8 && c >= 7) return 'mind_bending';
  if (m >= 6 && m > h) return 'mystery';
  if (h >= 7 && e < 8 && f < 5) return 'pure_comedy';
  if (hasAction && f >= 4) return 'action_escape';
  if (e >= 8 && h < 6) return 'emotional_drama';
  if (h >= 5) return 'light_fun';
  if (e >= 6) return 'comfort_watch';
  return 'light_fun';
}

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
    // ── Système gradué RIRE ──────────────────────────────────────────────────
    // NIVEAU 1 : comédie pure — humour dominant, pas de peur intense, pas de drame lourd
    if (item.humorScore >= 7 && item.fearScore < 5 && item.emotionScore < 8) {
      score += 15;
      pos.push(`+15 comédie pure (humour:${item.humorScore}/10)`);
    }
    // NIVEAU 2 : rire léger — humor correct → neutre (ni bonus ni pénalité)
    // NIVEAU 3 : peu drôle
    else if (item.humorScore < 5 && item.humorScore >= 3) {
      score -= 20;
      neg.push(`-20 contenu peu drôle (humour:${item.humorScore}/10)`);
    }
    // NIVEAU 4 : pas drôle du tout
    else if (item.humorScore < 3) {
      score -= 35;
      neg.push(`-35 contenu non comique (humour:${item.humorScore}/10)`);
    }

    // Pénalité si le mystère domine l'humour (thriller-comédie, ex: Knives Out)
    if (item.mysteryScore >= 7 && item.mysteryScore > item.humorScore) {
      score -= 12;
      neg.push(`-12 thriller avant tout (mystère:${item.mysteryScore} > humour:${item.humorScore})`);
    }

    // Pénalité si c'est principalement émotionnel (drama-comédie, ex: Forrest Gump, La La Land)
    if (item.emotionScore >= 8 && item.humorScore < 8) {
      score -= 10;
      neg.push(`-10 drame émotionnel prédominant (émotion:${item.emotionScore}/10)`);
    }

    // Horreur intense incompatible avec une soirée comique
    if (item.fearScore >= 8) {
      score -= 15;
      neg.push(`-15 horreur intense (peur:${item.fearScore}/10)`);
    }

    // Tags thématiquement incompatibles
    const badTag = item.tags.find(t => LAUGH_INCOMPATIBLE_TAGS.has(t));
    if (badTag) {
      score -= 25;
      neg.push(`-25 tag incompatible: ${badTag}`);
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

  // === MIND-BENDING: le contenu doit être complexe ou mystérieux ===
  if (moodRequested === 'mind-bending') {
    if (item.mysteryScore < 5 && item.complexityScore < 6) {
      score -= 15;
      neg.push(`-15 pas assez complexe/mystérieux (mystère:${item.mysteryScore} complexité:${item.complexityScore})`);
    }
    // Comédie légère sans profondeur → incompatible
    if (item.humorScore >= 8 && item.mysteryScore < 3) {
      score -= 10;
      neg.push(`-10 comédie légère incompatible avec mind-bending`);
    }
  }

  // === ESCAPE: l'évasion nécessite de l'énergie ou de l'aventure ===
  if (moodRequested === 'escape') {
    const hasEscapeEnergy = item.fearScore >= 4 ||
      item.tags.some(t => ['action', 'aventure', 'superhero', 'heist', 'espionnage', 'adventure', 'western'].includes(t));
    // Un drame pur sans rythme va décevoir pour "s'évader"
    if (!hasEscapeEnergy && item.emotionScore >= 7 && item.humorScore < 4) {
      score -= 12;
      neg.push(`-12 drame lourd sans énergie d'évasion (émotion:${item.emotionScore} action:${item.fearScore})`);
    }
  }

  // === SURPRISED: doit avoir un potentiel de surprise (mystère, twist, complexité) ===
  if (moodRequested === 'surprised') {
    if (item.mysteryScore < 4 && item.complexityScore < 5) {
      score -= 12;
      neg.push(`-12 peu de potentiel de surprise (mystère:${item.mysteryScore} complexité:${item.complexityScore})`);
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

// Renvoie un objet lisible pour le mode debug UI — miroir exact de scoreRecommendation
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

  // Mood match
  if (moodRequested) {
    if (moodMatches) { total += 60; reasons.push(`+60 Humeur "${moodRequested}" ✓`); }
    else { total -= 50; penalties.push(`-50 Humeur ✗ (${item.moods.join('/')} ≠ ${moodRequested})`); }
  }

  // Genre compat
  if (moodRequested === 'laugh') {
    if (item.humorScore >= 7 && item.fearScore < 5 && item.emotionScore < 8) {
      total += 15; reasons.push(`+15 Comédie pure (humour ${item.humorScore}/10)`);
    } else if (item.humorScore < 5 && item.humorScore >= 3) {
      total -= 20; penalties.push(`-20 Peu drôle (humour ${item.humorScore}/10)`);
    } else if (item.humorScore < 3) {
      total -= 35; penalties.push(`-35 Non comique (humour ${item.humorScore}/10)`);
    }
    if (item.mysteryScore >= 7 && item.mysteryScore > item.humorScore) {
      total -= 12; penalties.push(`-12 Thriller avant tout (mystère ${item.mysteryScore})`);
    }
    if (item.emotionScore >= 8 && item.humorScore < 8) {
      total -= 10; penalties.push(`-10 Drame émotionnel prédominant`);
    }
    if (item.fearScore >= 8) { total -= 15; penalties.push(`-15 Horreur intense`); }
    const badTag = item.tags.find(t => LAUGH_INCOMPATIBLE_TAGS.has(t));
    if (badTag) { total -= 25; penalties.push(`-25 Tag incompatible: ${badTag}`); }
  }
  if (moodRequested === 'scared' && item.fearScore < 4) {
    total -= 15; penalties.push(`-15 Peu effrayant (peur ${item.fearScore}/10)`);
  }
  if (moodRequested === 'moved') {
    if (item.emotionScore < 6) { total -= 15; penalties.push(`-15 Peu émouvant (émotion ${item.emotionScore}/10)`); }
    if (item.emotionScore <= 3 && item.humorScore <= 2) { total -= 10; penalties.push(`-10 Contenu trop sec`); }
  }
  if (moodRequested === 'mind-bending') {
    if (item.mysteryScore < 5 && item.complexityScore < 6) {
      total -= 15; penalties.push(`-15 Peu complexe (mystère:${item.mysteryScore} complexité:${item.complexityScore})`);
    }
    if (item.humorScore >= 8 && item.mysteryScore < 3) {
      total -= 10; penalties.push(`-10 Comédie légère incompatible`);
    }
  }
  if (moodRequested === 'escape') {
    const hasEnergy = item.fearScore >= 4 ||
      item.tags.some(t => ['action', 'aventure', 'superhero', 'heist', 'espionnage', 'adventure', 'western'].includes(t));
    if (!hasEnergy && item.emotionScore >= 7 && item.humorScore < 4) {
      total -= 12; penalties.push(`-12 Drame lourd sans énergie d'évasion`);
    }
  }
  if (moodRequested === 'surprised') {
    if (item.mysteryScore < 4 && item.complexityScore < 5) {
      total -= 12; penalties.push(`-12 Peu de potentiel de surprise`);
    }
  }

  // Tag similarity
  const tagBonus = tagSimilarityBonus(item, likedTagMap);
  if (tagBonus > 0) { total += tagBonus; reasons.push(`+${tagBonus} Goûts similaires`); }

  // Duration
  if (choices.duration === null || choices.duration === item.durationCategory) {
    total += 15; reasons.push('+15 Durée ✓');
  } else {
    const order = ['under-90', 'two-hours', 'evening', 'several-days'];
    const diff  = Math.abs(order.indexOf(choices.duration) - order.indexOf(item.durationCategory));
    if (diff === 1) { total += 5; reasons.push('+5 Durée proche'); }
  }

  // Platform
  if (!choices.platforms.length || choices.platforms.includes('any')) {
    total += 8; reasons.push('+8 Toutes plateformes');
  } else if (choices.platforms.some(p => item.platforms.includes(p))) {
    total += 12; reasons.push(`+12 Plateforme ${choices.platforms.filter(p => item.platforms.includes(p))[0]}`);
  }

  // Type
  if (!choices.type || choices.type === 'both') { total += 5; }
  else if (choices.type === item.type) { total += 10; reasons.push(`+10 Type ${item.type}`); }

  // Profile exclusions
  if (profile?.seenItems.includes(item.id)) { total = -1000; penalties.push('Déjà vu (-1000)'); }
  else if (profile?.dislikedItems.includes(item.id)) { total = -500; penalties.push('Pas mon style (-500)'); }
  else if (profile) {
    if (profile.tooLongItems.includes(item.id)) { total -= 30; penalties.push('-30 Signalé trop long'); }
    const hist = profile.recommendedHistory.find(e => e.itemId === item.id);
    if (hist) {
      const days = (Date.now() - new Date(hist.date).getTime()) / 86_400_000;
      if (days < 1) { total -= 30; penalties.push('-30 Proposé aujourd\'hui'); }
      else if (days < 3) { total -= 18; penalties.push(`-18 Proposé il y a ${Math.round(days)}j`); }
      else if (days < 7) { total -= 8; penalties.push(`-8 Proposé il y a ${Math.round(days)}j`); }
    }
  }

  return { total, moodMatch: moodMatches, reasons, penalties };
}

// ── EXPLAIN RECOMMENDATION ───────────────────────────────────────────────────

export interface RecommendationExplanation {
  title:      string;
  score:      number;
  moodMatch:  boolean;
  positives:  string[];
  negatives:  string[];
  summary:    string;
}

export function explainRecommendation(
  item: Recommendation,
  choices: UserChoices,
  profile: UserProfile | null,
  likedTagMap: Map<string, number> = new Map(),
): RecommendationExplanation {
  const moodRequested = choices.mood;
  const moodMatches   = moodRequested ? item.moods.includes(moodRequested) : true;
  const score         = scoreRecommendation(item, choices, profile, likedTagMap);

  const positives: string[] = [];
  const negatives: string[] = [];

  // Mood
  if (moodMatches && moodRequested) {
    const labels: Record<string, string> = {
      laugh: 'rire', scared: 'frissonner', moved: "s'émouvoir",
      escape: "s'évader", surprised: 'être surpris', 'mind-bending': 'réfléchir',
    };
    positives.push(`Correspond à ton envie de ${labels[moodRequested] ?? moodRequested}`);
  } else if (moodRequested) {
    negatives.push(`Humeur ne correspond pas (${item.moods.join(', ')})`);
  }

  // Scores forts
  if (item.humorScore >= 7)     positives.push(`Très drôle (humour ${item.humorScore}/10)`);
  else if (item.humorScore >= 5) positives.push(`Bon niveau d'humour (${item.humorScore}/10)`);
  if (item.emotionScore >= 8)   positives.push(`Très émouvant (${item.emotionScore}/10)`);
  if (item.fearScore >= 7 && moodRequested === 'scared') positives.push(`Frisson garanti (${item.fearScore}/10)`);
  if (item.mysteryScore >= 8)   positives.push(`Riche en mystère (${item.mysteryScore}/10)`);
  if (item.complexityScore >= 8) positives.push(`Histoire complexe et dense`);

  // Plateforme
  const matchingPlatforms = choices.platforms.filter(p => item.platforms.includes(p));
  if (matchingPlatforms.length > 0) {
    positives.push(`Disponible sur ${matchingPlatforms[0]}`);
  }

  // Durée
  if (choices.duration === item.durationCategory) {
    positives.push('Durée parfaite pour ce soir');
  } else if (choices.duration) {
    negatives.push(`Durée différente de ta demande (${item.durationCategory})`);
  }

  // Goûts similaires
  const tagBonus = tagSimilarityBonus(item, likedTagMap);
  if (tagBonus >= 15) positives.push('Très proche de tes contenus favoris');
  else if (tagBonus >= 8) positives.push('Proche de tes goûts');

  // Historique
  if (profile?.tooLongItems.includes(item.id)) {
    negatives.push("Tu avais trouvé ça trop long");
  }
  const histEntry = profile?.recommendedHistory.find(e => e.itemId === item.id);
  if (histEntry) {
    const days = (Date.now() - new Date(histEntry.date).getTime()) / 86_400_000;
    if (days < 7) negatives.push(`Déjà proposé il y a ${Math.round(days)}j`);
  }

  // Summary
  let summary: string;
  if (score >= 80)     summary = `Excellent — ${item.title} correspond parfaitement à ta demande.`;
  else if (score >= 50) summary = `Bon match — ${item.title} devrait te plaire ce soir.`;
  else if (score >= 10) summary = `Match correct — ${item.title} mérite une chance.`;
  else if (score > 0)  summary = `Match faible — ${item.title} est une suggestion de dernier recours.`;
  else summary = `Hors humeur — ${item.title} ne correspond pas exactement, mais rien de mieux n'est disponible.`;

  return {
    title:     item.title,
    score,
    moodMatch: moodMatches,
    positives: positives.slice(0, 4),
    negatives: negatives.slice(0, 3),
    summary,
  };
}

// ── HYBRID AI ARCHITECTURE ───────────────────────────────────────────────────
// Pipeline : scoring local → pré-sélection candidats → re-ranking IA → fallback local
// GEMINI_API_KEY reste côté serveur dans /api/rank-with-ai (Vercel serverless)

const MOOD_LABELS_FR: Record<string, string> = {
  laugh: 'rire', scared: 'frissonner', moved: "s'émouvoir",
  escape: "s'évader", surprised: 'être surpris', 'mind-bending': 'réfléchir / être surpris',
};

const INTENT_LABELS_FR: Record<string, string> = {
  pure_comedy: 'comédie pure', light_fun: 'divertissement léger',
  emotional_drama: 'drame émotionnel', dark_thriller: 'thriller sombre',
  mystery: 'mystère / polar', action_escape: 'action / aventure',
  comfort_watch: 'feel-good', mind_bending: 'film à twists / complexe',
};

export interface AIRankingCandidate {
  id:     number;
  title:  string;
  type:   'movie' | 'series';
  intent: string;
  moods:  string[];
  tags:   string[];
  duration:  string;
  platforms: string[];
  synopsis:  string;
  localScore: number;
  scores: { humour: number; peur: number; émotion: number; mystère: number; complexité: number };
}

export interface AIRankingContext {
  mood:       string;
  moodLabel:  string;
  type:       string;
  duration:   string;
  platforms:  string[];
  candidates: AIRankingCandidate[];
  profile: {
    pseudo:         string;
    topMoods:       string[];
    likedTitles:    string[];
    dislikedTitles: string[];
    seenCount:      number;
    preferredPlatforms: string[];
    badReasons:     string[];
  };
}

export function buildAIPrompt(
  candidates: ScoredRecommendation[],
  choices:    UserChoices,
  profile:    UserProfile | null,
): AIRankingContext {
  const topMoods = Object.entries(profile?.frequentMoods ?? {})
    .sort(([, a], [, b]) => b - a).slice(0, 3).map(([m]) => m);

  const likedIds = new Set([
    ...(profile?.wantToWatchItems ?? []),
    ...(profile?.likedItems ?? []),
    ...(profile?.satisfactionLog ?? []).filter(e => e.rating === 'loved' || e.rating === 'good').map(e => e.itemId),
  ]);
  const dislikedIds = new Set([
    ...(profile?.dislikedItems ?? []),
    ...(profile?.satisfactionLog ?? []).filter(e => e.rating === 'disappointed' || e.rating === 'bad').map(e => e.itemId),
  ]);
  const allHistory = profile?.recommendedHistory ?? [];
  const likedTitles   = allHistory.filter(e => likedIds.has(e.itemId)).map(e => e.title).slice(-5);
  const dislikedTitles = allHistory.filter(e => dislikedIds.has(e.itemId)).map(e => e.title).slice(-3);

  const badReasons = (profile?.satisfactionLog ?? [])
    .filter(e => e.rating === 'disappointed' || e.rating === 'bad')
    .flatMap(e => e.reasons).filter((r, i, a) => a.indexOf(r) === i);

  return {
    mood:      choices.mood ?? 'unknown',
    moodLabel: choices.mood ? (MOOD_LABELS_FR[choices.mood] ?? choices.mood) : 'non précisée',
    type:      choices.type ?? 'both',
    duration:  choices.duration ?? 'all',
    platforms: choices.platforms,
    candidates: candidates.slice(0, 10).map(c => ({
      id:     c.id,
      title:  c.title,
      type:   c.type,
      intent: INTENT_LABELS_FR[(c.recommendationIntent ?? inferIntent(c)) as string] ?? c.recommendationIntent ?? '',
      moods:  c.moods,
      tags:   c.tags.slice(0, 6),
      duration:  c.durationCategory,
      platforms: c.availableOn ?? c.platforms,
      synopsis:  (c.overview ?? c.atmosphere ?? '').slice(0, 200),
      localScore: c.score,
      scores: {
        humour:     c.humorScore,
        peur:       c.fearScore,
        émotion:    c.emotionScore,
        mystère:    c.mysteryScore,
        complexité: c.complexityScore,
      },
    })),
    profile: {
      pseudo:              profile?.pseudo ?? 'utilisateur',
      topMoods,
      likedTitles,
      dislikedTitles,
      seenCount:           (profile?.seenItems ?? []).length,
      preferredPlatforms:  profile?.preferredPlatforms ?? [],
      badReasons,
    },
  };
}

// Applique le re-ranking IA sur une liste de candidats déjà scorés localement.
// Retourne les candidats re-ordonnés avec aiRank + aiReason.
// Fallback instantané vers l'ordre local si l'IA échoue ou dépasse 3 secondes.
export async function reRankWithAI(
  candidates: ScoredRecommendation[],
  choices:    UserChoices,
  profile:    UserProfile | null,
): Promise<ScoredRecommendation[]> {
  if (candidates.length === 0) return candidates;

  const context = buildAIPrompt(candidates, choices, profile);

  const aiCall = fetch('/api/rank-with-ai', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(context),
  });

  // 3 secondes max avant fallback local
  const timeoutPromise = new Promise<Response>((_, reject) =>
    setTimeout(() => reject(new Error('ai_timeout')), 3000)
  );

  try {
    const res = await Promise.race([aiCall, timeoutPromise]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as { rankedIds?: number[]; reasons?: Record<string, string> };
    if (!data.rankedIds?.length) throw new Error('empty');

    const reasons = data.reasons ?? {};

    const reordered: ScoredRecommendation[] = [];
    for (let idx = 0; idx < data.rankedIds.length; idx++) {
      const id   = data.rankedIds[idx];
      const item = candidates.find(c => c.id === id);
      if (item) reordered.push({ ...item, aiRank: idx + 1, aiReason: reasons[String(id)] ?? '' });
    }

    // Ajoute les candidats non classés par l'IA (dans leur ordre local)
    const rankedSet = new Set(data.rankedIds);
    const unranked  = candidates.filter(c => !rankedSet.has(c.id));

    return [...reordered, ...unranked];
  } catch {
    // Fallback silencieux : ordre local inchangé
    return candidates;
  }
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

  // Scoring + intent
  const scored = candidates
    .map(item => ({
      ...item,
      score: scoreRecommendation(item, choices, profile, likedTagMap),
      recommendationIntent: inferIntent(item),
    }))
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
