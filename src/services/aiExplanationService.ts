import type { ScoredRecommendation, UserProfile, Mood, AIExplanation } from '../types';
import { detectSpectatorProfile, hasEnoughData } from '../utils/spectatorProfile';

const AI_ENABLED = import.meta.env.VITE_AI_PROVIDER === 'enabled';

// ── LOCAL FALLBACK ────────────────────────────────────────────────────────────

const MOOD_LABELS: Record<string, string> = {
  'mind-bending': 'retourner le cerveau',
  scared:         'frissonner',
  laugh:          'rire',
  moved:          "s'émouvoir",
  escape:         "s'évader",
  surprised:      'être surpris',
};

function generateLocalExplanation(
  item: ScoredRecommendation,
  profile: UserProfile | null,
  mood: Mood | null,
): AIExplanation {
  const reasons: string[] = [];

  if (mood && item.moods.includes(mood)) {
    reasons.push(`Correspond à ton envie de ${MOOD_LABELS[mood] ?? mood}`);
  }

  const topScore = Math.max(
    item.mysteryScore,
    item.fearScore,
    item.humorScore,
    item.emotionScore,
  );

  if (item.mysteryScore === topScore && item.mysteryScore >= 6)
    reasons.push('Fort potentiel de mystère et de surprise');
  else if (item.fearScore === topScore && item.fearScore >= 6)
    reasons.push('Intensité et tension garanties');
  else if (item.humorScore === topScore && item.humorScore >= 6)
    reasons.push('Parfait pour décompresser et rire');
  else if (item.emotionScore === topScore && item.emotionScore >= 6)
    reasons.push('Contenu qui touche et émeut');

  const prefPlatforms = profile?.preferredPlatforms ?? [];
  if (prefPlatforms.some(p => item.platforms.includes(p))) {
    reasons.push(`Disponible sur ${item.platforms[0]}`);
  }

  if (reasons.length < 2) reasons.push(item.shortReason);

  const moodMatch = Boolean(mood && item.moods.includes(mood));
  const hasHistory = (profile?.satisfactionLog.length ?? 0) > 0;

  return {
    explanation: item.overview
      ? item.overview.slice(0, 120) + (item.overview.length > 120 ? '…' : '')
      : item.atmosphere,
    reasons:    reasons.slice(0, 3),
    riskLevel:  item.disappointmentRisk,
    confidence: moodMatch ? (hasHistory ? 0.74 : 0.62) : 0.50,
    isLocal:    true,
  };
}

// ── API CALL ─────────────────────────────────────────────────────────────────

export async function getAIExplanation(
  item: ScoredRecommendation,
  profile: UserProfile | null,
  mood: Mood | null,
): Promise<AIExplanation> {
  if (!AI_ENABLED) {
    return generateLocalExplanation(item, profile, mood);
  }

  const topMoods = Object.entries(profile?.frequentMoods ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([m]) => m);

  const badReasons = (profile?.satisfactionLog ?? [])
    .filter(e => e.rating === 'disappointed' || e.rating === 'bad')
    .flatMap(e => e.reasons);

  // Titles of items the user saved/liked — gives context to the AI
  const likedIds = new Set([
    ...(profile?.wantToWatchItems ?? []),
    ...(profile?.likedItems ?? []),
    ...(profile?.satisfactionLog ?? [])
      .filter(e => e.rating === 'loved' || e.rating === 'good')
      .map(e => e.itemId),
  ]);
  const likedTitles = (profile?.recommendedHistory ?? [])
    .filter(e => likedIds.has(e.itemId))
    .map(e => e.title)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(-5);

  // Titles of items the user explicitly rejected
  const dislikedIds = new Set([
    ...(profile?.dislikedItems ?? []),
    ...(profile?.satisfactionLog ?? [])
      .filter(e => e.rating === 'disappointed' || e.rating === 'bad')
      .map(e => e.itemId),
  ]);
  const dislikedTitles = (profile?.recommendedHistory ?? [])
    .filter(e => dislikedIds.has(e.itemId))
    .map(e => e.title)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(-3);

  // Spectator archetype
  const spectatorArchetype = profile && hasEnoughData(profile)
    ? detectSpectatorProfile(profile).label
    : null;

  const body = {
    item: {
      title:          item.title,
      type:           item.type,
      moods:          item.moods,
      tags:           item.tags,
      atmosphere:     item.atmosphere,
      mysteryScore:   item.mysteryScore,
      fearScore:      item.fearScore,
      emotionScore:   item.emotionScore,
      humorScore:     item.humorScore,
      complexityScore:item.complexityScore,
      overview:       item.overview,
      voteAverage:    item.voteAverage,
    },
    mood,
    pseudo:             profile?.pseudo ?? 'toi',
    preferredPlatforms: profile?.preferredPlatforms ?? [],
    topMoods,
    likedTitles,
    dislikedTitles,
    spectatorArchetype,
    satisfactionSummary: {
      loved:       (profile?.satisfactionLog ?? []).filter(e => e.rating === 'loved' || e.rating === 'good').length,
      disappointed:(profile?.satisfactionLog ?? []).filter(e => e.rating === 'disappointed' || e.rating === 'bad').length,
      badReasons,
    },
    wantToWatchCount: profile?.wantToWatchItems.length ?? 0,
  };

  try {
    const res = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data?.explanation) throw new Error('Empty response');

    return { ...data, isLocal: false };
  } catch {
    return generateLocalExplanation(item, profile, mood);
  }
}
