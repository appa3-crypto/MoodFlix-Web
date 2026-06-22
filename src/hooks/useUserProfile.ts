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
} from '../types';

const STORAGE_KEY = 'moodflix_profile_v2';
const MAX_HISTORY = 60;

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
    likedItems: [],
    frequentMoods: {},
    satisfactionLog: [],
    recommendedHistory: [],
    createdAt: new Date().toISOString(),
    itemMetaStore: {},
  };
}

// Calibration item IDs start at 9001
const CALIB_ID_MIN = 9001;

// Migrate older profiles that lack new fields
function migrate(raw: Partial<UserProfile> & Record<string, unknown>): UserProfile {
  const liked      = new Set((raw.likedItems as number[] | undefined) ?? []);
  const wantToWatch = (raw.wantToWatchItems as number[] | undefined) ?? [];
  const seenItems   = (raw.seenItems as number[] | undefined) ?? [];

  return {
    ...defaultProfile(raw.pseudo ?? 'Anonyme', raw.preferredPlatforms ?? []),
    ...raw,
    // Remove calibration items wrongly added to wantToWatch by old code
    wantToWatchItems: wantToWatch.filter(id => id < CALIB_ID_MIN),
    // Remove calibration-skip items from seenItems (only keep liked calibration items)
    seenItems: seenItems.filter(id => id < CALIB_ID_MIN || liked.has(id)),
    recommendedHistory: (raw.recommendedHistory as RecommendationHistoryEntry[] | undefined) ?? [],
    preferredType: (raw.preferredType as ContentType | undefined) ?? 'both',
    preferredDuration: (raw.preferredDuration as Duration | null | undefined) ?? null,
    itemMetaStore: (raw.itemMetaStore as Record<number, ItemMeta> | undefined) ?? {},
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }

  function createProfile(pseudo: string, platforms: Platform[]) {
    save(defaultProfile(pseudo, platforms));
  }

  function resetProfile() {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
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
    updated.seenItems = updated.seenItems.filter(id => id !== itemId);
    updated.dislikedItems = updated.dislikedItems.filter(id => id !== itemId);
    updated.tooLongItems = updated.tooLongItems.filter(id => id !== itemId);

    if (action === 'like') updated.wantToWatchItems = [...updated.wantToWatchItems, itemId];
    if (action === 'seen') updated.seenItems = [...updated.seenItems, itemId];
    if (action === 'dislike') updated.dislikedItems = [...updated.dislikedItems, itemId];
    if (action === 'too-long') updated.tooLongItems = [...updated.tooLongItems, itemId];

    if (meta) {
      updated.itemMetaStore = { ...updated.itemMetaStore, [itemId]: meta };
    }

    save(updated);
  }

  function undoAction(itemId: number) {
    if (!profile) return;
    save({
      ...profile,
      wantToWatchItems: profile.wantToWatchItems.filter(id => id !== itemId),
      seenItems: profile.seenItems.filter(id => id !== itemId),
      dislikedItems: profile.dislikedItems.filter(id => id !== itemId),
      tooLongItems: profile.tooLongItems.filter(id => id !== itemId),
    });
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

  // Calibration semantics:
  //   liked    = seen + loved  → likedItems + seenItems, shown in history ❤️
  //   disliked = not my style  → dislikedItems only (may not have watched, not in seenItems)
  //   seen     = jamais vu     → nothing recorded, item stays available for discovery recs
  function batchCalibration(ratings: CalibResult[]) {
    if (!profile) return;
    let updated = { ...profile };
    const metaStore = { ...updated.itemMetaStore };
    const historyEntries: RecommendationHistoryEntry[] = [];

    for (const r of ratings) {
      const { itemId, title, action } = r;

      // Clean from all lists first (idempotent)
      updated.wantToWatchItems = updated.wantToWatchItems.filter(id => id !== itemId);
      updated.seenItems        = updated.seenItems.filter(id => id !== itemId);
      updated.dislikedItems    = updated.dislikedItems.filter(id => id !== itemId);
      updated.likedItems       = updated.likedItems.filter(id => id !== itemId);

      // Persist snapshot for HistoryPage poster display
      metaStore[itemId] = {
        title: r.title,
        type: r.type,
        posterUrl: r.posterUrl,
        posterEmoji: r.posterEmoji,
        posterColor: r.posterColor,
        tmdbId: r.tmdbId,
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
        // Style preference only — NOT in seenItems, they may not have watched it
        updated.dislikedItems = [...updated.dislikedItems, itemId];
      }
      // action === 'seen' (jamais vu) → no list recorded, stays available for discovery
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
    recordMood,
    recordPreferences,
    updatePreferences,
    recordAction,   // (itemId, action, meta?) — meta persists posterUrl
    undoAction,
    addSatisfaction,
    recordRecommendedHistory,
    batchCalibration,
  };
}
