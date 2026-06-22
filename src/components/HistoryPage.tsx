import { useState, useEffect, useRef } from 'react';
import type { UserProfile, Recommendation } from '../types';
import { getPosterByTmdbId } from '../services/tmdbService';

interface Props {
  profile: UserProfile;
  allItems: Recommendation[];
}

const CATEGORIES = [
  { key: 'wantToWatchItems' as const, label: '❤️ Ça me tente',  accent: '#EC4899' },
  { key: 'seenItems'        as const, label: '👁️ Déjà vus',     accent: '#8B5CF6' },
  { key: 'dislikedItems'    as const, label: '🚫 Pas mon style', accent: '#6B7280' },
  { key: 'tooLongItems'     as const, label: '⏱️ Trop long',     accent: '#F59E0B' },
];

const RATING_EMOJI: Record<string, string> = {
  loved: '❤️', good: '👍', ok: '😐', disappointed: '😔', bad: '👎',
};

export function HistoryPage({ profile, allItems }: Props) {
  const [posterCache, setPosterCache] = useState<Record<number, string>>({});
  const fetchedIds = useRef(new Set<number>());

  function getItem(id: number) {
    return allItems.find(i => i.id === id);
  }
  function getSatisfaction(id: number) {
    return profile.satisfactionLog.find(e => e.itemId === id);
  }

  // Fetch TMDB posters for calibration items that have tmdbId but no posterUrl
  useEffect(() => {
    const allIds = CATEGORIES.flatMap(c => profile[c.key]);
    for (const id of allIds) {
      const item = getItem(id);
      if (!item || item.posterUrl || !item.tmdbId || fetchedIds.current.has(item.id)) continue;
      fetchedIds.current.add(item.id);
      getPosterByTmdbId(item.tmdbId, item.type === 'series').then(url => {
        if (url) setPosterCache(prev => ({ ...prev, [item.id]: url }));
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasHistory = CATEGORIES.some(c => profile[c.key].length > 0);

  if (!hasHistory) {
    return (
      <div className="page-container">
        <h1 className="page-title">Mon historique</h1>
        <div className="history-empty">
          <div className="history-empty-icon">🎬</div>
          <p className="history-empty-text">
            Ton historique est vide.
            <br />
            Lance une recherche pour commencer !
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container page-scroll">
      <h1 className="page-title">Mon historique</h1>

      {CATEGORIES.map(({ key, label, accent }) => {
        const ids = profile[key];
        if (ids.length === 0) return null;
        // Most recent first
        const sorted = [...ids].reverse();

        return (
          <div key={key} className="history-section">
            <h2 className="history-section-title" style={{ color: accent }}>
              {label}
              <span className="history-section-count">{ids.length}</span>
            </h2>

            <div className="history-grid">
              {sorted.map(id => {
                const item = getItem(id);
                if (!item) return null;
                const satisfaction = getSatisfaction(id);
                const posterUrl = item.posterUrl ?? posterCache[item.id] ?? null;

                return (
                  <div key={id} className="history-cell">
                    <div
                      className="history-poster-wrap"
                      style={{ background: item.posterColor }}
                    >
                      {posterUrl ? (
                        <img
                          src={posterUrl}
                          alt={item.title}
                          className="history-poster-img"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <span className="history-poster-fallback">{item.posterEmoji}</span>
                      )}

                      {/* Rating badge */}
                      {satisfaction && (
                        <span className="history-rating-badge">
                          {RATING_EMOJI[satisfaction.rating]}
                        </span>
                      )}

                      {/* Type badge */}
                      <span className="history-type-badge">
                        {item.type === 'movie' ? '🎬' : '📺'}
                      </span>
                    </div>

                    <p className="history-poster-title">{item.title}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
