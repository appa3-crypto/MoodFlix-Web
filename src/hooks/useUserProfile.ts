import { useState, useEffect } from 'react';
import type {
  UserProfile,
  Mood,
  Platform,
  SatisfactionEntry,
  ContentType,
  Duration,
  RecommendationHistoryEntry,
  ItemMeta,
  CalibResult,
  WatchPlan,
  AppSettings,
} from '../types';

const STORAGE_KEY = 'moodflix_profile_v2';
const MAX_HISTORY = 60;

const DEFAULT_SETTINGS: AppSettings = {
  notifications: {
    watchReminder:    true,
    dailySuggestions: false,
    newFeatures:      true,
    personalTips:     true,
  },
  preferredPlatforms: [],
};

function defaultProfile(pseudo: string, platforms: Platform[]): UserProfile {
  return {
    pseudo,
    preferredPlatforms: platforms,
    preferredType: 'both',
    preferredDuration: null,
    wantToWatchItems: [],
    seenItems: [],
    dislikedItems: [],
    tooLongItems: [],
    abandonedItems: [],
    likedItems: [],
    frequentMoods: {},
    satisfactionLog: [],
    recommendedHistory: [],
    createdAt: new Date().toISOString(),
    itemMetaStore: {},
    watchPlan: null,
    settings: { ...DEFAULT_SETTINGS, preferredPlatforms: platforms },
  };
}

const CALIB_ID_MIN = 9001;

function migrate(raw: Partial<UserProfile> & Record<string, unknown>): UserProfile {
  const liked       = new Set((raw.likedItems as number[] | undefined) ?? []);
  const wantToWatch = (raw.wantToWatchItems as number[] | undefined) ?? [];
  const seenItems   = (raw.seenItems as number[] | undefined) ?? [];

  return {
    ...defaultProfile(raw.pseudo ?? 'Anonyme', raw.preferredPlatforms ?? []),
    ...raw,
    wantToWatchItems: wantToWatch.filter(id => id < CALIB_ID_MIN),
    seenItems: seenItems.filter(id => id < CALIB_ID_MIN || liked.has(id)),
    recommendedHistory: (raw.recommendedHistory as RecommendationHistoryEntry[] | undefined) ?? [],
    preferredType: (raw.preferredType as ContentType | undefined) ?? 'both',
    preferredDuration: (raw.preferredDuration as Duration | null | undefined) ?? null,
    itemMetaStore: (raw.itemMetaStore as Record<number, ItemMeta> | undefined) ?? {},
    watchPlan: (raw.watchPlan as WatchPlan | null | undefined) ?? null,
    abandonedItems: (raw.abandonedItems as number[] | undefined) ?? [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings as AppSettings | undefined),
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        ...((raw.settings as AppSettings | undefined)?.notifications),
      },
    },
  } as UserProfile;
}

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const raw = JSON.parse(stored) as Partial<UserProfile>;
        setProfile(migrate(raw as Partial<UserProfile> & Record<string, unknown>));
      }
    } catch {
      // ignore corrupt storage
    }
    setIsLoading(false);
  }, []);

  function save(p: UserProfile) {
    setProfile(p);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      // ignore storage errors (quota exceeded etc.)
    }
  }

  function createProfile(pseudo: string, platforms: Platform[]) {
    save(defaultProfile(pseudo, platforms));
  }

  function resetProfile() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setProfile(null);
  }

  function updatePseudo(pseudo: string) {
    if (!profile) return;
    save({ ...profile, pseudo: pseudo.trim().slice(0, 20) || profile.pseudo });
  }

  function updateSettings(settings: AppSettings) {
    if (!profile) return;
    save({ ...profile, settings });
  }

  function recordMood(mood: Mood) {
    if (!profile) return;
    save({
      ...profile,
      frequentMoods: {
        ...profile.frequentMoods,
        [mood]: (profile.frequentMoods[mood] ?? 0) + 1,
      },
    });
  }

  function recordPreferences(type: ContentType, duration: Duration | null, platforms: Platform[]) {
    if (!profile) return;
    save({ ...profile, preferredType: type, preferredDuration: duration, preferredPlatforms: platforms });
  }

  function updatePreferences(type: ContentType, duration: Duration | null, platforms: Platform[]) {
    if (!profile) return;
    save({ ...profile, preferredType: type, preferredDuration: duration, preferredPlatforms: platforms });
  }

  function recordAction(itemId: number, action: 'like' | 'seen' | 'dislike' | 'too-long', meta?: ItemMeta) {
    if (!profile) return;
    const updated = { ...profile };

    updated.wantToWatchItems = updated.wantToWatchItems.filter(id => id !== itemId);
    updated.seenItems        = updated.seenItems.filter(id => id !== itemId);
    updated.dislikedItems    = updated.dislikedItems.filter(id => id !== itemId);
    updated.tooLongItems     = updated.tooLongItems.filter(id => id !== itemId);

    const metaWithDate: ItemMeta | undefined = meta
      ? { ...meta, addedAt: meta.addedAt ?? new Date().toISOString() }
      : undefined;

    if (action === 'like')     updated.wantToWatchItems = [...updated.wantToWatchItems, itemId];
    if (action === 'seen')     updated.seenItems        = [...updated.seenItems, itemId];
    if (action === 'dislike')  updated.dislikedItems    = [...updated.dislikedItems, itemId];
    if (action === 'too-long') updated.tooLongItems     = [...updated.tooLongItems, itemId];

    if (metaWithDate) {
      updated.itemMetaStore = { ...updated.itemMetaStore, [itemId]: metaWithDate };
    }

    save(updated);
  }

  function undoAction(itemId: number) {
    if (!profile) return;
    save({
      ...profile,
      wantToWatchItems: profile.wantToWatchItems.filter(id => id !== itemId),
      seenItems:        profile.seenItems.filter(id => id !== itemId),
      dislikedItems:    profile.dislikedItems.filter(id => id !== itemId),
      tooLongItems:     profile.tooLongItems.filter(id => id !== itemId),
    });
  }

  // Move an item from wantToWatch → seenItems (used from history detail sheet)
  function moveToSeen(itemId: number) {
    if (!profile) return;
    const updated = { ...profile };
    updated.wantToWatchItems = updated.wantToWatchItems.filter(id => id !== itemId);
    if (!updated.seenItems.includes(itemId)) {
      updated.seenItems = [...updated.seenItems, itemId];
    }
    const meta = updated.itemMetaStore[itemId];
    if (meta) {
      updated.itemMetaStore = {
        ...updated.itemMetaStore,
        [itemId]: { ...meta, addedAt: meta.addedAt ?? new Date().toISOString() },
      };
    }
    save(updated);
  }

  // Remove an item from a specific list
  function removeFromList(itemId: number, list: 'want' | 'liked' | 'seen' | 'disliked' | 'abandoned') {
    if (!profile) return;
    const updated = { ...profile };
    if (list === 'want')      updated.wantToWatchItems = updated.wantToWatchItems.filter(id => id !== itemId);
    if (list === 'liked')     updated.likedItems       = updated.likedItems.filter(id => id !== itemId);
    if (list === 'seen')      updated.seenItems        = updated.seenItems.filter(id => id !== itemId);
    if (list === 'disliked')  updated.dislikedItems    = updated.dislikedItems.filter(id => id !== itemId);
    if (list === 'abandoned') updated.abandonedItems   = (updated.abandonedItems ?? []).filter(id => id !== itemId);
    save(updated);
  }

  function addSatisfaction(entry: SatisfactionEntry) {
    if (!profile) return;
    const existing = profile.satisfactionLog.filter(e => e.itemId !== entry.itemId);
    const updated = { ...profile, satisfactionLog: [...existing, entry] };

    if (entry.rating === 'loved' || entry.rating === 'good') {
      if (!updated.likedItems.includes(entry.itemId)) {
        updated.likedItems = [...updated.likedItems, entry.itemId];
      }
    }

    save(updated);
  }

  function recordRecommendedHistory(entries: RecommendationHistoryEntry[]) {
    if (!profile) return;
    const newIds = new Set(entries.map(e => e.itemId));
    const kept = profile.recommendedHistory.filter(e => !newIds.has(e.itemId));
    save({
      ...profile,
      recommendedHistory: [...kept, ...entries].slice(-MAX_HISTORY),
    });
  }

  function planWatch(plan: WatchPlan) {
    if (!profile) return;
    save({ ...profile, watchPlan: plan });
  }

  function updateWatchPlan(updates: Partial<WatchPlan>) {
    if (!profile || !profile.watchPlan) return;
    save({ ...profile, watchPlan: { ...profile.watchPlan, ...updates } });
  }

  function confirmWatched() {
    if (!profile || !profile.watchPlan) return;
    const { itemId } = profile.watchPlan;
    const meta = profile.itemMetaStore[itemId];
    const updated = { ...profile };
    updated.watchPlan = { ...updated.watchPlan!, status: 'watched', watchedAt: new Date().toISOString() };
    updated.wantToWatchItems = updated.wantToWatchItems.filter(id => id !== itemId);
    updated.seenItems = [...updated.seenItems.filter(id => id !== itemId), itemId];
    if (meta) updated.itemMetaStore = { ...updated.itemMetaStore, [itemId]: meta };
    save(updated);
  }

  function confirmAbandoned() {
    if (!profile || !profile.watchPlan) return;
    const { itemId } = profile.watchPlan;
    const updated = { ...profile };
    updated.watchPlan = { ...updated.watchPlan!, status: 'abandoned' };
    if (!updated.abandonedItems.includes(itemId)) {
      updated.abandonedItems = [...updated.abandonedItems, itemId];
    }
    save(updated);
  }

  function batchCalibration(ratings: CalibResult[]) {
    if (!profile) return;
    let updated = { ...profile };
    const metaStore = { ...updated.itemMetaStore };
    const historyEntries: RecommendationHistoryEntry[] = [];

    for (const r of ratings) {
      const { itemId, title, action } = r;

      updated.wantToWatchItems = updated.wantToWatchItems.filter(id => id !== itemId);
      updated.seenItems        = updated.seenItems.filter(id => id !== itemId);
      updated.dislikedItems    = updated.dislikedItems.filter(id => id !== itemId);
      updated.likedItems       = updated.likedItems.filter(id => id !== itemId);

      metaStore[itemId] = {
        title: r.title,
        type: r.type,
        posterUrl: r.posterUrl,
        posterEmoji: r.posterEmoji,
        posterColor: r.posterColor,
        tmdbId: r.tmdbId,
        addedAt: new Date().toISOString(),
      };

      if (action === 'liked') {
        updated.seenItems  = [...updated.seenItems, itemId];
        updated.likedItems = [...updated.likedItems, itemId];
        const existing = updated.satisfactionLog.filter(e => e.itemId !== itemId);
        updated.satisfactionLog = [
          ...existing,
          { itemId, rating: 'loved', reasons: ['calibration'], date: new Date().toISOString() },
        ];
        historyEntries.push({ itemId, title, date: new Date().toISOString(), mood: null });
      } else if (action === 'disliked') {
        updated.dislikedItems = [...updated.dislikedItems, itemId];
      }
    }

    if (historyEntries.length > 0) {
      const newIds = new Set(historyEntries.map(e => e.itemId));
      const kept = updated.recommendedHistory.filter(e => !newIds.has(e.itemId));
      updated.recommendedHistory = [...kept, ...historyEntries].slice(-MAX_HISTORY);
    }

    updated.itemMetaStore = metaStore;
    save(updated);
  }

  return {
    profile,
    isLoading,
    createProfile,
    resetProfile,
    updatePseudo,
    updateSettings,
    recordMood,
    recordPreferences,
    updatePreferences,
    planWatch,
    updateWatchPlan,
    confirmWatched,
    confirmAbandoned,
    recordAction,
    undoAction,
    moveToSeen,
    removeFromList,
    addSatisfaction,
    recordRecommendedHistory,
    batchCalibration,
  };
}
