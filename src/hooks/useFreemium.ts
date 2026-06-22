import { useState } from 'react';

const PREMIUM_KEY = 'moodflix_premium';
const USAGE_KEY   = 'moodflix_usage';

interface DailyUsage {
  date:         string; // 'YYYY-MM-DD'
  chooseForMe:  number;
  relaunches:   number;
}

// Free tier daily limits
export const FREE_LIMITS = {
  chooseForMe: 2,   // "Choisis pour moi" per day
  relaunches:  3,   // relaunches inside the modal per day
} as const;

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function loadUsage(): DailyUsage {
  try {
    const s = localStorage.getItem(USAGE_KEY);
    if (!s) return { date: todayStr(), chooseForMe: 0, relaunches: 0 };
    const u = JSON.parse(s) as DailyUsage;
    if (u.date !== todayStr()) return { date: todayStr(), chooseForMe: 0, relaunches: 0 };
    return u;
  } catch {
    return { date: todayStr(), chooseForMe: 0, relaunches: 0 };
  }
}

function persistUsage(u: DailyUsage) {
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch {}
}

export function useFreemium() {
  const [isPremium, setIsPremium] = useState<boolean>(() => {
    try { return localStorage.getItem(PREMIUM_KEY) === 'true'; } catch { return false; }
  });
  const [usage, setUsage] = useState<DailyUsage>(loadUsage);

  function canUse(feature: 'chooseForMe' | 'relaunches'): boolean {
    if (isPremium) return true;
    return usage[feature] < FREE_LIMITS[feature];
  }

  function consume(feature: 'chooseForMe' | 'relaunches') {
    if (isPremium) return;
    const updated = { ...usage, [feature]: usage[feature] + 1 };
    setUsage(updated);
    persistUsage(updated);
  }

  function activatePremium() {
    try { localStorage.setItem(PREMIUM_KEY, 'true'); } catch {}
    setIsPremium(true);
  }

  function getRemainingUses(feature: 'chooseForMe' | 'relaunches'): number {
    if (isPremium) return Infinity;
    return Math.max(0, FREE_LIMITS[feature] - usage[feature]);
  }

  return { isPremium, canUse, consume, activatePremium, getRemainingUses };
}
