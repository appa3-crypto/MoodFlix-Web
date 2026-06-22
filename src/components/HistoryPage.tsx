import { useState, useEffect, useRef } from 'react';
import type { UserProfile, Recommendation, SatisfactionRating } from '../types';
import { getPosterByTmdbId } from '../services/tmdbService';
import { PosterImage } from './PosterImage';
import { ItemDetailSheet } from './ItemDetailSheet';
import type { DetailItem } from './ItemDetailSheet';
import { track } from '../utils/analytics';

interface Props {
  profile:     UserProfile;
  allItems:    Recommendation[];
  onMoveToSeen:  (id: number) => void;
  onRemoveFromList: (id: number, list: DetailItem['listKey']) => void;
  onRate:      (id: number, rating: SatisfactionRating) => void;
}

type TabKey = 'want' | 'liked' | 'seen' | 'abandoned' | 'disliked';

const TABS: { key: TabKey; label: string; emptyLabel: string; emptyHint: string }[] = [
  { key: 'want',      label: '🎯 À regarder', emptyLabel: 'Ta liste est vide',          emptyHint: 'Ajoute des films depuis les recommandations.' },
  { key: 'liked',     label: '❤️ Aimés',      emptyLabel: 'Aucun coup de cœur encore',  emptyHint: 'Note un contenu adoré pour le retrouver ici.' },
  { key: 'seen',      label: '👁️ Déjà vus',   emptyLabel: 'Aucun contenu vu encore',    emptyHint: 'Marque un film ou une série comme vu.' },
  { key: 'abandoned', label: '🚫 Abandonnés',  emptyLabel: 'Aucun contenu abandonné',   emptyHint: 'Les contenus abandonnés apparaîtront ici.' },
  { key: 'disliked',  label: '👎 Pas mon style', emptyLabel: 'Aucun contenu rejeté', emptyHint: 'Les contenus refusés sont exclus de tes recommandations.' },
];

export function HistoryPage({ profile, allItems, onMoveToSeen, onRemoveFromList, onRate }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('want');
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [posterFetched, setPosterFetched] = useState<Record<number, string>>({});
  const fetchedIds = useRef(new Set<number>());
  const tabBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => { track('history_viewed'); }, []);

  // Item ID lists per tab
  const likedSet = new Set(profile.likedItems);
  const lists: Record<TabKey, number[]> = {
    want:      [...profile.wantToWatchItems].reverse(),
    liked:     [...profile.likedItems].reverse(),
    seen:      [...profile.seenItems.filter(id => !likedSet.has(id))].reverse(),
    disliked:  [...profile.dislikedItems].reverse(),
    abandoned: [...(profile.abandonedItems ?? [])].reverse(),
  };

  const activeIds = lists[activeTab];

  // Lazy-fetch TMDB posters for items without stored posterUrl
  const itemMap = new Map(allItems.map(i => [i.id, i]));

  useEffect(() => {
    const allIds = Object.values(lists).flat();
    for (const id of allIds) {
      if (fetchedIds.current.has(id)) continue;
      const meta = profile.itemMetaStore[id];
      const item = itemMap.get(id);
      if (meta?.posterUrl || item?.posterUrl) continue;
      const tmdbId = meta?.tmdbId ?? item?.tmdbId;
      const type   = meta?.type ?? item?.type;
      if (!tmdbId) continue;
      fetchedIds.current.add(id);
      getPosterByTmdbId(tmdbId, type === 'series').then(url => {
        if (url) setPosterFetched(prev => ({ ...prev, [id]: url }));
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  function resolve(id: number) {
    const meta = profile.itemMetaStore[id];
    const full = itemMap.get(id);
    if (!meta && !full) return null;
    return {
      meta: meta ?? {
        title:       full!.title,
        type:        full!.type,
        posterUrl:   full!.posterUrl,
        posterEmoji: full!.posterEmoji,
        posterColor: full!.posterColor,
        tmdbId:      full!.tmdbId,
      },
      fullItem: full,
    };
  }

  function openDetail(id: number, listKey: TabKey) {
    const resolved = resolve(id);
    if (!resolved) return;
    const posterUrl = resolved.meta.posterUrl ?? posterFetched[id];
    setSelectedItem({
      id,
      meta: { ...resolved.meta, posterUrl },
      fullItem: resolved.fullItem,
      listKey,
    });
  }

  function handleMarkSeen(id: number) {
    onMoveToSeen(id);
    setSelectedItem(null);
  }

  function handleRemove(id: number, list: DetailItem['listKey']) {
    onRemoveFromList(id, list);
    setSelectedItem(null);
  }

  function handleRate(id: number, rating: SatisfactionRating) {
    onRate(id, rating);
    // Update selectedItem satisfaction locally (parent will re-render)
    setSelectedItem(prev => prev ? { ...prev } : null);
  }

  const totalItems = Object.values(lists).flat().length;

  return (
    <div className="page-container page-history">
      <h1 className="page-title">Mon historique</h1>

      {totalItems === 0 ? (
        <div className="history-empty">
          <div className="history-empty-icon">🎬</div>
          <p className="history-empty-text">
            Ton historique est vide.<br />
            Lance une recherche ou calibre tes goûts !
          </p>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="history-tab-bar" ref={tabBarRef} role="tablist">
            {TABS.map(tab => {
              const count = lists[tab.key].length;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`history-tab ${activeTab === tab.key ? 'history-tab-active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span className="history-tab-label">{tab.label}</span>
                  {count > 0 && (
                    <span className="history-tab-count">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="history-tab-content" role="tabpanel">
            {activeIds.length === 0 ? (
              <div className="history-tab-empty">
                <p className="history-tab-empty-label">
                  {TABS.find(t => t.key === activeTab)?.emptyLabel}
                </p>
                <p className="history-tab-empty-hint">
                  {TABS.find(t => t.key === activeTab)?.emptyHint}
                </p>
              </div>
            ) : (
              <div className="history-grid">
                {activeIds.map(id => {
                  const resolved = resolve(id);
                  if (!resolved) return null;
                  const { meta, fullItem } = resolved;
                  const posterUrl = meta.posterUrl ?? posterFetched[id] ?? fullItem?.posterUrl ?? null;
                  const satisfaction = profile.satisfactionLog.find(e => e.itemId === id);
                  const RATING_EMOJI: Record<string, string> = {
                    loved: '❤️', good: '👍', ok: '😐', disappointed: '😔', bad: '👎',
                  };

                  return (
                    <button
                      key={id}
                      className="history-cell"
                      onClick={() => openDetail(id, activeTab)}
                      aria-label={`Voir les détails de ${meta.title}`}
                    >
                      <div className="history-poster-wrap">
                        <PosterImage
                          src={posterUrl}
                          alt={meta.title}
                          emoji={meta.posterEmoji}
                          color={meta.posterColor}
                          className="history-poster-fill"
                          objectFit="cover"
                          objectPosition="center top"
                        />
                        <span className="history-type-badge">
                          {meta.type === 'movie' ? '🎬' : '📺'}
                        </span>
                        {satisfaction && (
                          <span className="history-rating-badge">
                            {RATING_EMOJI[satisfaction.rating]}
                          </span>
                        )}
                      </div>
                      <p className="history-poster-title">{meta.title}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {selectedItem && (
        <ItemDetailSheet
          item={selectedItem}
          profile={profile}
          onClose={() => setSelectedItem(null)}
          onMarkSeen={handleMarkSeen}
          onRate={handleRate}
          onRemove={handleRemove}
        />
      )}
    </div>
  );
}
