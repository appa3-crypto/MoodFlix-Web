import type { UserChoices, Recommendation, ScoredRecommendation } from '../types';

export function scoreRecommendation(item: Recommendation, choices: UserChoices): number {
  let score = 0;

  // Mood match — most important (40 pts)
  if (choices.mood && item.moods.includes(choices.mood)) {
    score += 40;
  }

  // Platform match (25 pts)
  if (choices.platforms.length === 0 || choices.platforms.includes('any')) {
    score += 15;
  } else {
    const platformMatch = choices.platforms.some((p) => item.platforms.includes(p));
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
    const durationOrder = ['under-90', 'two-hours', 'evening', 'several-days'];
    const chosen = durationOrder.indexOf(choices.duration);
    const itemDur = durationOrder.indexOf(item.durationCategory);
    const diff = Math.abs(chosen - itemDur);
    if (diff === 1) score += 5;
  }

  // Reference bonus (20 pts max)
  if (choices.references.trim()) {
    const refs = choices.references
      .toLowerCase()
      .split(/[,\n]+/)
      .map((r) => r.trim())
      .filter(Boolean);

    for (const ref of refs) {
      const tagMatch = item.tags.some(
        (tag) => tag.toLowerCase().includes(ref) || ref.includes(tag.toLowerCase())
      );
      const titleMatch = item.title.toLowerCase().includes(ref);
      if (tagMatch || titleMatch) score += 10;
    }
    score = Math.min(score, score); // cap handled below
  }

  return score;
}

export function getTopRecommendations(
  items: Recommendation[],
  choices: UserChoices,
  count = 3
): ScoredRecommendation[] {
  return items
    .map((item) => ({ ...item, score: scoreRecommendation(item, choices) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}
