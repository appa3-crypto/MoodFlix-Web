import { useState, useEffect, useRef } from 'react';
import calibrationRaw from '../data/calibration.json';
import type { CalibResult } from '../types';

export type CalibRating = 'liked' | 'disliked' | 'seen';

interface Props {
  onComplete: (results: CalibResult[]) => void;
  onDismiss: () => void;
}

interface CalibItem {
  id: number;
  title: string;
  type: string;
  tmdbId: number;
  posterColor: string;
  posterEmoji: string;
}

const ITEMS = calibrationRaw as CalibItem[];
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined;

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

export function CalibrationModal({ onComplete, onDismiss }: Props) {
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [exiting, setExiting] = useState<'left' | 'right' | null>(null);
  const [results, setResults] = useState<CalibResult[]>([]);
  const [showTutorial, setShowTutorial] = useState(true);
  const [posterUrls, setPosterUrls] = useState<Record<number, string>>({});
  const fetchedIds = useRef(new Set<number>());

  const item = ITEMS[index];
  const nextItem = ITEMS[index + 1];

  // Preload poster for current card and next card
  useEffect(() => {
    const toFetch = [ITEMS[index], ITEMS[index + 1]].filter(Boolean);
    for (const it of toFetch) {
      if (!fetchedIds.current.has(it.id)) {
        fetchedIds.current.add(it.id);
        fetchPosterUrl(it.tmdbId, it.type === 'series').then(url => {
          if (url) setPosterUrls(prev => ({ ...prev, [it.id]: url }));
        });
      }
    }
  }, [index]);

  if (!item) return null;

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
      itemId: item.id,
      title: item.title,
      type: item.type as 'movie' | 'series',
      action,
      posterUrl: posterUrls[item.id] ?? undefined,
      posterEmoji: item.posterEmoji,
      posterColor: item.posterColor,
      tmdbId: item.tmdbId,
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
      if (index + 1 >= ITEMS.length) {
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
    if (index + 1 >= ITEMS.length) {
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

  const progress = (index / ITEMS.length) * 100;

  const cardStyle: React.CSSProperties = exiting
    ? {}
    : { transform: `translateX(${dragX}px) rotate(${dragX * 0.025}deg)` };

  const likeOpacity = dragX > 25 && !exiting ? Math.min(1, dragX / 80) : 0;
  const nopeOpacity = dragX < -25 && !exiting ? Math.min(1, -dragX / 80) : 0;

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
          <span className="calib-counter">{index + 1} / {ITEMS.length}</span>
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
            {posterUrls[nextItem.id]
              ? <img src={posterUrls[nextItem.id]} className="calib-poster" alt="" draggable={false} />
              : <div className="calib-poster-fallback" style={{ background: nextItem.posterColor }}>
                  <span className="calib-poster-emoji">{nextItem.posterEmoji}</span>
                </div>
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
          {posterUrls[item.id]
            ? <img src={posterUrls[item.id]} className="calib-poster" alt={item.title} draggable={false} />
            : <div className="calib-poster-fallback" style={{ background: item.posterColor }}>
                <span className={`calib-poster-emoji ${TMDB_KEY ? 'calib-poster-loading' : ''}`}>{item.posterEmoji}</span>
              </div>
          }

          {/* Bottom gradient */}
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

          {/* Tutorial overlay on first card */}
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
