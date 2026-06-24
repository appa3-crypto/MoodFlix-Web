import { useState, useEffect, useRef } from 'react';
import type { UserProfile, Recommendation, SatisfactionRating } from '../types';
import { getPosterByTmdbId, getPosterByTitle } from '../services/tmdbService';
import { PosterImage } from './PosterImage';
import { ItemDetailSheet } from './ItemDetailSheet';
import type { DetailItem } from './ItemDetailSheet';
import { track } from '../utils/analytics';

interface Props {
  profile:          UserProfile;
  allItems:         Recommendation[];
  onMoveToSeen:     (id: number) => void;
  onRemoveFromList: (id: number, list: DetailItem['listKey']) => void;
  onRate:           (id: number, rating: SatisfactionRating) => void;
}

type TabKey = 'want' | 'vus' | 'abandoned' | 'disliked';

const TABS: { key: TabKey; label: string; emptyLabel: string; emptyHint: string }[] = [
  { key: 'want',      label: '🎯 À regarder',    emptyLabel: 'Ta liste est vide',          emptyHint: 'Ajoute des films depuis les recommandations.' },
  { key: 'vus',       label: '✅ Vus & aimés',    emptyLabel: 'Aucun contenu vu encore',    emptyHint: 'Tes films vus et aimés apparaîtront ici.' },
  { key: 'abandoned', label: '🚫 Abandonnés',     emptyLabel: 'Aucun contenu abandonné',   emptyHint: 'Les contenus abandonnés apparaîtront ici.' },
  { key: 'disliked',  label: '👎 Pas mon style',  emptyLabel: 'Aucun contenu rejeté',      emptyHint: 'Les contenus refusés sont exclus de tes recommandations.' },
];

// ── Swipe-to-remove cell (mobile) + hover-✕ (desktop) ──────────────────────

interface SwipeCellProps {
  onOpen:   () => void;
  onRemove: () => void;
  children: React.ReactNode;
}

function SwipeCell({ onOpen, onRemove, children }: SwipeCellProps) {
  const [offset, setOffset]     = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startX    = useRef(0);
  const startY    = useRef(0);
  const direction = useRef<'h' | 'v' | null>(null);
  const SNAP      = 72;

  function onTouchStart(e: React.TouchEvent) {
    startX.current    = e.touches[0].clientX;
    startY.current    = e.touches[0].clientY;
    direction.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!direction.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      direction.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (direction.current !== 'h') return;
    e.preventDefault();
    const base = revealed ? -SNAP + dx : dx;
    setOffset(Math.max(-SNAP - 20, Math.min(0, base)));
  }

  function onTouchEnd() {
    if (direction.current !== 'h') return;
    if (offset < -SNAP / 2) {
      setOffset(-SNAP);
      setRevealed(true);
    } else {
      setOffset(0);
      setRevealed(false);
    }
  }

  function handleClick() {
    if (revealed) { setOffset(0); setRevealed(false); }
    else onOpen();
  }

  return (
    <div className="history-swipe-wrap">
      {/* Red delete layer behind the card */}
      <div className="history-swipe-bg" aria-hidden onClick={onRemove}>
        <span className="history-swipe-icon">🗑️</span>
      </div>
      {/* Swipeable card surface */}
      <div
        className={`history-swipe-cell${revealed ? ' revealed' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleClick}
      >
        {children}
        {/* Desktop ✕ button shown on hover */}
        <button
          className="history-cell-remove"
          aria-label="Retirer"
          onClick={e => { e.stopPropagation(); onRemove(); }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function HistoryPage({ profile, allItems, onMoveToSeen, onRemoveFromList, onRate }: Props) {
  const [activeTab,    setActiveTab]    = useState<TabKey>('want');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [posterFetched, setPosterFetched] = useState<Record<number, string>>({});
  const [loadingIds,   setLoadingIds]   = useState<Set<number>>(new Set());
  const fetchedIds  = useRef(new Set<number>());
  const tabBarRef   = useRef<HTMLDivElement>(null);

  useEffect(() => { track('history_viewed'); }, []);

  // Reset search when switching tabs
  useEffect(() => { setSearchQuery(''); }, [activeTab]);

  const likedSet = new Set(profile.likedItems);
  const vusIds   = [...new Set([...profile.seenItems, ...profile.likedItems])].reverse();

  const lists: Record<TabKey, number[]> = {
    want:      [...profile.wantToWatchItems].reverse(),
    vus:       vusIds,
    disliked:  [...profile.dislikedItems].reverse(),
    abandoned: [...(profile.abandonedItems ?? [])].reverse(),
  };

  const itemMap = new Map(allItems.map(i => [i.id, i]));

  // Lazy-fetch posters with title-search fallback + skeleton tracking
  useEffect(() => {
    const allIds = Object.values(lists).flat();
    const newLoadingIds: number[] = [];

    for (const id of allIds) {
      if (fetchedIds.current.has(id)) continue;
      const meta = profile.itemMetaStore[id];
      const item = itemMap.get(id);
      if (meta?.posterUrl || item?.posterUrl) continue;
      fetchedIds.current.add(id);
      newLoadingIds.push(id);

      const tmdbId = meta?.tmdbId ?? item?.tmdbId;
      const type   = meta?.type   ?? item?.type;
      const title  = meta?.title  ?? item?.title;

      const done = (url: string | null) => {
        setLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        if (url) setPosterFetched(prev => ({ ...prev, [id]: url }));
      };

      if (tmdbId) {
        getPosterByTmdbId(tmdbId, type === 'series').then(url => {
          if (url) done(url);
          else if (title) getPosterByTitle(title).then(done);
          else done(null);
        });
      } else if (title) {
        getPosterByTitle(title).then(done);
      } else {
        done(null);
      }
    }

    if (newLoadingIds.length > 0) {
      setLoadingIds(prev => new Set([...prev, ...newLoadingIds]));
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
    setSelectedItem({ id, meta: { ...resolved.meta, posterUrl }, fullItem: resolved.fullItem, listKey });
  }

  function handleMarkSeen(id: number) { onMoveToSeen(id); setSelectedItem(null); }

  function handleRemove(id: number, list: DetailItem['listKey']) {
    onRemoveFromList(id, list);
    setSelectedItem(null);
  }

  function handleRate(id: number, rating: SatisfactionRating) {
    onRate(id, rating);
    setSelectedItem(prev => prev ? { ...prev } : null);
  }

  const RATING_EMOJI: Record<string, string> = {
    loved: '❤️', good: '👍', ok: '😐', disappointed: '😔', bad: '👎',
  };

  const activeIds = lists[activeTab];
  const filteredIds = searchQuery.trim()
    ? activeIds.filter(id => {
        const meta = profile.itemMetaStore[id];
        const item = itemMap.get(id);
        const title = (meta?.title ?? item?.title ?? '').toLowerCase();
        return title.includes(searchQuery.toLowerCase());
      })
    : activeIds;

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
                  {count > 0 && <span className="history-tab-count">{count}</span>}
                </button>
              );
            })}
          </div>

          {/* Search bar */}
          {activeIds.length > 4 && (
            <div className="history-search-wrap">
              <span className="history-search-icon">🔍</span>
              <input
                className="history-search-input"
                type="search"
                placeholder="Rechercher un titre…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Rechercher dans la liste"
              />
              {searchQuery && (
                <button className="history-search-clear" onClick={() => setSearchQuery('')} aria-label="Effacer">✕</button>
              )}
            </div>
          )}

          {/* Tab content */}
          <div className="history-tab-content" role="tabpanel">
            {filteredIds.length === 0 ? (
              <div className="history-tab-empty">
                {searchQuery ? (
                  <p className="history-tab-empty-label">Aucun résultat pour « {searchQuery} »</p>
                ) : (
                  <>
                    <p className="history-tab-empty-label">{TABS.find(t => t.key === activeTab)?.emptyLabel}</p>
                    <p className="history-tab-empty-hint">{TABS.find(t => t.key === activeTab)?.emptyHint}</p>
                  </>
                )}
              </div>
            ) : (
              <div className="history-grid">
                {filteredIds.map(id => {
                  const resolved = resolve(id);
                  if (!resolved) return null;
                  const { meta, fullItem } = resolved;
                  const posterUrl  = meta.posterUrl ?? posterFetched[id] ?? fullItem?.posterUrl ?? null;
                  const isLoading  = loadingIds.has(id);
                  const isLiked    = likedSet.has(id);
                  const satisfaction = profile.satisfactionLog.find(e => e.itemId === id);
                  const badgeEmoji = satisfaction
                    ? RATING_EMOJI[satisfaction.rating]
                    : (activeTab === 'vus' && isLiked ? '❤️' : null);

                  return (
                    <SwipeCell
                      key={id}
                      onOpen={() => openDetail(id, activeTab)}
                      onRemove={() => { onRemoveFromList(id, activeTab); }}
                    >
                      <div className="history-poster-wrap">
                        <PosterImage
                          src={posterUrl}
                          alt={meta.title}
                          emoji={meta.posterEmoji ?? ''}
                          color={meta.posterColor ?? '#1a1a2e'}
                          className="history-poster-fill"
                          objectFit="cover"
                          objectPosition="center top"
                          loading={isLoading}
                        />
                        <span className="history-type-badge">
                          {meta.type === 'movie' ? '🎬' : '📺'}
                        </span>
                        {badgeEmoji && (
                          <span className="history-rating-badge">{badgeEmoji}</span>
                        )}
                      </div>
                      <p className="history-poster-title">{meta.title}</p>
                    </SwipeCell>
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
