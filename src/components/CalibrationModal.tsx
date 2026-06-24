import { useState, useEffect, useRef } from 'react';
import type { Recommendation, CalibResult } from '../types';

export type CalibRating = 'liked' | 'disliked' | 'seen';

interface Props {
  onComplete:     (results: CalibResult[]) => void;
  onDismiss:      () => void;
  excludeIds?:    number[];
  catalog?:       Recommendation[];
  isLoadingDeck?: boolean;
}

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined;
const DECK_SIZE = 10;

async function fetchPosterUrl(tmdbId: number, isTV: boolean): Promise<string | null> {
  if (!TMDB_KEY) return null;
  try {
    const type = isTV ? 'tv' : 'movie';
    const res = await fetch(
      `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}&language=fr-FR`
    );
    if (!res.ok) return null;
    const data = await res.json() as { poster_path?: string };
    return data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null;
  } catch {
    return null;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildDeck(catalog: Recommendation[], excludeIds: number[]): Recommendation[] {
  const excludeSet = new Set(excludeIds);
  // Filtre uniquement les exclus (pas de filtre ID — les items TMDB ont des IDs variables)
  const available = catalog.filter(i => !excludeSet.has(i.id));
  return shuffle(available).slice(0, DECK_SIZE);
}

export function CalibrationModal({ onComplete, onDismiss, excludeIds = [], catalog = [], isLoadingDeck = false }: Props) {
  // Deck courant (toujours vide à l'initialisation — catalog arrive en async via TMDB)
  const [deck,        setDeck]        = useState<Recommendation[]>([]);
  const [index,       setIndex]       = useState(0);
  const [dragX,       setDragX]       = useState(0);
  const [isDragging,  setIsDragging]  = useState(false);
  const [dragStartX,  setDragStartX]  = useState(0);
  const [exiting,     setExiting]     = useState<'left' | 'right' | null>(null);
  const [results,     setResults]     = useState<CalibResult[]>([]);
  const [showTutorial, setShowTutorial] = useState(true);
  const [posterUrls,  setPosterUrls]  = useState<Record<number, string>>({});
  const fetchedIds       = useRef(new Set<number>());
  // Mémoire de session : tous les items montrés dans ce modal (toutes decks confondues)
  const sessionSeenIds   = useRef(new Set<number>(excludeIds));

  const item     = deck[index];
  const nextItem = deck[index + 1];

  // Reconstruire le deck quand le catalog TMDB arrive (catalog passe de [] à [items])
  useEffect(() => {
    if (catalog.length > 0) {
      // Construire la deck en excluant TOUT ce qui a déjà été montré dans cette session
      const allExcluded = Array.from(sessionSeenIds.current);
      const newDeck = buildDeck(catalog, allExcluded);
      if (newDeck.length > 0) {
        setDeck(newDeck);
        setIndex(0);
        setPosterUrls({});
        fetchedIds.current = new Set();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.length]);

  function reshuffleDeck() {
    // Marquer tous les items du deck courant + items déjà notés comme vus dans cette session
    deck.forEach(item => sessionSeenIds.current.add(item.id));
    results.forEach(r => sessionSeenIds.current.add(r.itemId));

    const allExcluded = Array.from(sessionSeenIds.current);
    const newDeck = buildDeck(catalog, allExcluded);

    if (newDeck.length === 0) return; // Plus rien de nouveau dans ce catalog
    setDeck(newDeck);
    setIndex(0);
    setResults([]);
    setPosterUrls({});
    fetchedIds.current = new Set();
    setShowTutorial(false);
  }

  // Précharger poster du card courant + suivant
  useEffect(() => {
    const toFetch = [deck[index], deck[index + 1]].filter(Boolean);
    for (const it of toFetch) {
      if (!it || fetchedIds.current.has(it.id)) continue;
      // Si le poster est déjà dans les données du catalogue, l'utiliser directement
      if (it.posterUrl) {
        setPosterUrls(prev => ({ ...prev, [it.id]: it.posterUrl! }));
        fetchedIds.current.add(it.id);
        continue;
      }
      if (!it.tmdbId) continue;
      fetchedIds.current.add(it.id);
      fetchPosterUrl(it.tmdbId, it.type === 'series').then(url => {
        if (url) setPosterUrls(prev => ({ ...prev, [it.id]: url }));
      });
    }
  }, [index, deck]);

  if (!item) {
    return (
      <div className="calib-overlay">
        <div className="calib-header">
          <div className="calib-header-left">
            <h2 className="calib-title">Calibre tes goûts</h2>
            <p className="calib-sub">
              {isLoadingDeck ? 'Chargement des films TMDB…' : 'Plus de nouvelles propositions'}
            </p>
          </div>
          <div className="calib-header-right">
            <button className="calib-close" onClick={onDismiss}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          {isLoadingDeck
            ? <>
                <div className="loading-spinner" />
                <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Sélection de films variés en cours…</p>
              </>
            : <>
                <p style={{ fontSize: 40 }}>🎬</p>
                <p style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, textAlign: 'center', padding: '0 24px' }}>
                  Pas assez de nouvelles propositions pour le moment.
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '0 24px' }}>
                  Réessaie plus tard — de nouveaux contenus TMDB seront disponibles.
                </p>
                <button className="btn-primary" style={{ marginTop: 8 }} onClick={onDismiss}>
                  Fermer
                </button>
              </>
          }
        </div>
      </div>
    );
  }

  function hideTutorial() {
    if (showTutorial) setShowTutorial(false);
  }

  function commitSwipe() {
    if (dragX > 80) triggerSwipe('right');
    else if (dragX < -80) triggerSwipe('left');
    else setDragX(0);
  }

  function makeResult(action: CalibResult['action']): CalibResult {
    return {
      itemId:      item.id,
      title:       item.title,
      type:        item.type as 'movie' | 'series',
      action,
      posterUrl:   posterUrls[item.id] ?? item.posterUrl ?? undefined,
      posterEmoji: item.posterEmoji,
      posterColor: item.posterColor,
      tmdbId:      item.tmdbId,
      overview:    item.overview,
      voteAverage: item.voteAverage,
      backdropUrl: item.backdropUrl,
      releaseDate: item.releaseDate,
    };
  }

  function triggerSwipe(dir: 'left' | 'right') {
    hideTutorial();
    setIsDragging(false);
    setExiting(dir);
    if (dir === 'right') navigator.vibrate?.(20);
    else navigator.vibrate?.([10, 10]);
    const action: CalibResult['action'] = dir === 'right' ? 'liked' : 'disliked';
    const newResults = [...results, makeResult(action)];

    setTimeout(() => {
      setExiting(null);
      setDragX(0);
      setResults(newResults);
      if (index + 1 >= deck.length) {
        onComplete(newResults);
      } else {
        setIndex(i => i + 1);
      }
    }, 360);
  }

  function handleSkip() {
    hideTutorial();
    const newResults = [...results, makeResult('seen')];
    setResults(newResults);
    if (index + 1 >= deck.length) {
      onComplete(newResults);
    } else {
      setIndex(i => i + 1);
    }
  }

  // Mouse drag
  function onMouseDown(e: React.MouseEvent) {
    if (exiting) return;
    hideTutorial();
    setIsDragging(true);
    setDragStartX(e.clientX);
    e.preventDefault();
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging || exiting) return;
    setDragX(e.clientX - dragStartX);
  }
  function onMouseUp() {
    if (!isDragging) return;
    setIsDragging(false);
    commitSwipe();
  }

  // Touch drag
  function onTouchStart(e: React.TouchEvent) {
    if (exiting) return;
    hideTutorial();
    setIsDragging(true);
    setDragStartX(e.touches[0].clientX);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging || exiting) return;
    setDragX(e.touches[0].clientX - dragStartX);
  }
  function onTouchEnd() {
    if (!isDragging) return;
    setIsDragging(false);
    commitSwipe();
  }

  const progress       = (index / deck.length) * 100;
  const cardStyle: React.CSSProperties = exiting
    ? {}
    : { transform: `translateX(${dragX}px) rotate(${dragX * 0.025}deg)` };
  const likeOpacity = dragX > 25 && !exiting ? Math.min(1, dragX / 80) : 0;
  const nopeOpacity = dragX < -25 && !exiting ? Math.min(1, -dragX / 80) : 0;

  const currentPoster = posterUrls[item.id] ?? item.posterUrl ?? null;
  const nextPoster    = nextItem ? (posterUrls[nextItem.id] ?? nextItem.posterUrl ?? null) : null;

  return (
    <div
      className="calib-overlay"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Header */}
      <div className="calib-header">
        <div className="calib-header-left">
          <h2 className="calib-title">Calibre tes goûts</h2>
          <p className="calib-sub">Dis-nous ce que tu as déjà vu</p>
        </div>
        <div className="calib-header-right">
          <span className="calib-counter">{index + 1} / {deck.length}</span>
          <button
            className="calib-reshuffle"
            onClick={reshuffleDeck}
            title="Nouvelle sélection de 10 films"
            aria-label="Générer une nouvelle calibration"
          >
            🎲
          </button>
          <button className="calib-close" onClick={onDismiss}>✕</button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="calib-progress-track">
        <div className="calib-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Card stack */}
      <div className="calib-stack">
        {/* Background card (next) */}
        {nextItem && (
          <div className={`calib-card calib-card-behind ${exiting ? 'calib-card-promoting' : ''}`}>
            {nextPoster
              ? <img src={nextPoster} className="calib-poster" alt="" draggable={false} />
              : <div className="calib-poster-fallback" style={{ background: nextItem.posterColor }} />
            }
            <div className="calib-card-gradient" />
            <div className="calib-card-info">
              <p className="calib-card-title">{nextItem.title}</p>
            </div>
          </div>
        )}

        {/* Active card */}
        <div
          className={`calib-card calib-card-active ${isDragging ? 'calib-card-dragging' : ''} ${exiting ? `calib-card-exit-${exiting}` : ''}`}
          style={cardStyle}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Poster */}
          {currentPoster
            ? <img src={currentPoster} className="calib-poster" alt={item.title} draggable={false} />
            : <div className="calib-poster-fallback calib-poster-loading" style={{ background: item.posterColor }} />
          }

          <div className="calib-card-gradient" />

          {/* LIKE stamp */}
          <div className="calib-stamp calib-stamp-like" style={{ opacity: likeOpacity }}>
            ❤️ J'adore !
          </div>

          {/* NOPE stamp */}
          <div className="calib-stamp calib-stamp-nope" style={{ opacity: nopeOpacity }}>
            👎 Non merci
          </div>

          {/* Card info */}
          <div className="calib-card-info">
            <p className="calib-card-title">{item.title}</p>
            <p className="calib-card-type">
              {item.type === 'movie' ? '🎬 Film' : '📺 Série'}
            </p>
          </div>

          {/* Tutorial overlay */}
          {showTutorial && (
            <div className="calib-tutorial">
              <div className="calib-tut-side calib-tut-left">
                <span className="calib-tut-arrow">←</span>
                <span className="calib-tut-label">Pas pour moi</span>
              </div>
              <div className="calib-tut-center">
                <div className="calib-tut-hand">👆</div>
                <span className="calib-tut-label">Glisse pour voter</span>
              </div>
              <div className="calib-tut-side calib-tut-right">
                <span className="calib-tut-label">J'ai adoré</span>
                <span className="calib-tut-arrow">→</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contextual hint */}
      <p className="calib-hint-text">
        {dragX > 40 ? '❤️ Relâche pour adorer !'
         : dragX < -40 ? '👎 Relâche pour passer !'
         : 'Glisse ← pas pour moi   ·   j\'adore →'}
      </p>

      {/* Action buttons */}
      <div className="calib-buttons">
        <button
          className="calib-btn-action calib-btn-nope"
          onClick={() => triggerSwipe('left')}
          disabled={!!exiting}
          aria-label="Pas pour moi"
        >
          👎
        </button>
        <button
          className="calib-btn-skip"
          onClick={handleSkip}
          disabled={!!exiting}
        >
          ⏭️ Jamais vu
        </button>
        <button
          className="calib-btn-action calib-btn-like"
          onClick={() => triggerSwipe('right')}
          disabled={!!exiting}
          aria-label="J'ai adoré"
        >
          ❤️
        </button>
      </div>
    </div>
  );
}
