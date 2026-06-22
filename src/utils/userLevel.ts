import type { UserProfile } from '../types';

export interface UserLevel {
  level:       number;
  title:       string;
  emoji:       string;
  description: string;
  xp:          number;
  nextXp:      number;
  progress:    number; // 0-100
}

const LEVELS = [
  { level: 1, title: 'Débutant',          emoji: '🍿',  description: 'Bienvenue dans MoodFlix !' },
  { level: 2, title: 'Amateur',           emoji: '🎬',  description: 'Tu commences à trouver tes goûts.' },
  { level: 3, title: 'Cinéphile',         emoji: '🎭',  description: 'Un vrai amateur de cinéma.' },
  { level: 4, title: 'Passionné',         emoji: '🏆',  description: 'Le cinéma, c\'est ta vie.' },
  { level: 5, title: 'Maître du Popcorn', emoji: '👑',  description: 'Tu es une légende du canapé.' },
];

const XP_THRESHOLDS = [0, 5, 15, 30, 50];

function computeXp(profile: UserProfile): number {
  return (
    profile.seenItems.filter(id => id < 9001).length +
    profile.likedItems.length +
    profile.satisfactionLog.length +
    profile.dislikedItems.length +
    Math.floor(profile.recommendedHistory.length / 3)
  );
}

export function getUserLevel(profile: UserProfile): UserLevel {
  const xp = computeXp(profile);

  let levelIdx = 0;
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_THRESHOLDS[i]) { levelIdx = i; break; }
  }

  const lvl = LEVELS[levelIdx];
  const currentThreshold = XP_THRESHOLDS[levelIdx];
  const nextThreshold    = XP_THRESHOLDS[levelIdx + 1] ?? currentThreshold + 1;
  const progress = levelIdx >= LEVELS.length - 1
    ? 100
    : Math.min(100, Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100));

  return {
    ...lvl,
    xp,
    nextXp: nextThreshold,
    progress,
  };
}
