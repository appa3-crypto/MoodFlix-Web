import { useState, useEffect, useRef } from 'react';
import type { UserProfile, Recommendation } from '../types';
import { getPosterByTmdbId } from '../services/tmdbService';

interface Props {
  profile: UserProfile;
  allItems: Recommendation[];
}

interface DisplayItem {
  title: string;
  type: 'movie' | 'series';
  posterUrl?: string;
  posterEmoji: string;
  posterColor: string;
  tmdbId?: number;
}

const SECTIONS = [
  { key: 'liked'     as const, label: '❤️ Aimés',        sub: 'Vus et adorés',           accent: '#EC4899' },
  { key: 'want'      as const, label: '💾 À regarder',   sub: 'Ta liste de films à voir', accent: '#8B5CF6' },
  { key: 'seen'      as const, label: '👁️ Déjà vus',     sub: 'Contenus regardés',        accent: '#3B82F6' },
  { key: 'disliked'  as const, label: '👎 Pas mon style', sub: 'Contenus refusés',         accent: '#6B7280' },
  { key: 'abandoned' as const, label: '🚫 Abandonnés',   sub: 'Commencés mais pas finis', accent: '#F59E0B' },
];

export function HistoryPage({ profile, allItems }: Props) {
  const [posterFetched, setPosterFetched] = useState<Record<number, string>>({});
  const fetchedIds = useRef(new Set<number>());

  // Prevent overlap: items in likedItems don't appear in want/seen sections
  const likedSet = new Set(profile.likedItems);
  const sectionData: Record<string, number[]> = {
    liked:     [...profile.likedItems].reverse(),
    want:      [...profile.wantToWatchItems.filter(id => !likedSet.has(id))].reverse(),
    seen:      [...profile.seenItems.filter(id => !likedSet.has(id))].reverse(),
    disliked:  [...profile.dislikedItems].reverse(),
    abandoned: [...(profile.abandonedItems ?? [])].reverse(),
  };

  // Resolve display data for an id: metaStore first, then allItems lookup
  function resolve(id: number): DisplayItem | null {
    const meta = profile.itemMetaStore?.[id];
    if (meta) return meta;
    const found = allItems.find(i => i.id === id);
    if (found) return found;
    return null;
  }

  // Lazy-fetch TMDB posters for items that have tmdbId but no stored posterUrl
  useEffect(() => {
    const allIds = Object.values(sectionData).flat();
    for (const id of allIds) {
      if (fetchedIds.current.has(id)) continue;
      const item = resolve(id);
      if (!item || item.posterUrl || !item.tmdbId) continue;
      fetchedIds.current.add(id);
      getPosterByTmdbId(item.tmdbId, item.type === 'series').then(url => {
        if (url) setPosterFetched(prev => ({ ...prev, [id]: url }));
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAny = Object.values(sectionData).some(ids => ids.length > 0);

  if (!hasAny) {
    return (
      <div className="page-container">
        <h1 className="page-title">Mon historique</h1>
        <div className="history-empty">
          <div className="history-empty-icon">🎬</div>
          <p className="history-empty-text">
            Ton historique est vide.
            <br />
            Lance une recherche ou calibre tes goûts !
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container page-scroll">
      <h1 className="page-title">Mon historique</h1>

      {SECTIONS.map(section => {
        const ids = sectionData[section.key];
        if (ids.length === 0) return null;

        return (
          <div key={section.key} className="history-section">
            <div className="history-section-header">
              <div>
                <h2 className="history-section-title" style={{ color: section.accent }}>
                  {section.label}
                  <span className="history-section-count">{ids.length}</span>
                </h2>
                <p className="history-section-sub">{section.sub}</p>
              </div>
            </div>

            <div className="history-grid">
              {ids.map(id => {
                const item = resolve(id);
                if (!item) return null;
                const posterUrl = item.posterUrl ?? posterFetched[id] ?? null;

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
                          onError={e => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="history-poster-fallback">{item.posterEmoji}</span>
                      )}
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
