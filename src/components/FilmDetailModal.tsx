import { useState, useEffect } from 'react';
import type { ScoredRecommendation, UserProfile, Mood } from '../types';
import { getTrailerKey } from '../services/tmdbService';

type Reaction = 'like' | 'seen' | 'dislike' | 'too-long' | null;

interface Props {
  item:      ScoredRecommendation;
  profile:   UserProfile | null;
  mood:      Mood | null;
  reaction:  Reaction;
  onAction:  (action: Exclude<Reaction, null>) => void;
  onClose:   () => void;
}

type TrailerState = 'idle' | 'loading' | 'ready' | 'none';

// Scroll lock compatible iOS Safari: freezes the body at current scroll position
function lockBody(): () => void {
  const scrollY = window.scrollY;
  document.body.style.position   = 'fixed';
  document.body.style.top        = `-${scrollY}px`;
  document.body.style.width      = '100%';
  document.body.style.overflowY  = 'scroll';
  return () => {
    document.body.style.position  = '';
    document.body.style.top       = '';
    document.body.style.width     = '';
    document.body.style.overflowY = '';
    window.scrollTo(0, scrollY);
  };
}

export function FilmDetailModal({ item, reaction, onAction, onClose }: Props) {
  const [trailerState, setTrailerState] = useState<TrailerState>('idle');
  const [trailerKey,   setTrailerKey]   = useState<string | null>(null);
  const [heroFailed,   setHeroFailed]   = useState(false);

  // Scroll lock (iOS-compatible: position:fixed technique)
  useEffect(() => lockBody(), []);

  // Fermer sur Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  async function loadTrailer() {
    if (!item.tmdbId) { setTrailerState('none'); return; }
    setTrailerState('loading');
    const key = await getTrailerKey(item.tmdbId, item.type === 'series');
    if (key) { setTrailerKey(key); setTrailerState('ready'); }
    else setTrailerState('none');
  }

  const heroSrc = !heroFailed ? (item.backdropUrl ?? item.posterUrl ?? null) : null;

  const releaseYear = item.releaseDate
    ? new Date(item.releaseDate).getFullYear()
    : null;

  const durationLabel = item.type === 'series'
    ? `${item.seasons ?? '?'} saison${(item.seasons ?? 0) > 1 ? 's' : ''}`
    : item.duration ? `${item.duration} min` : null;

  const platforms = item.availableOn?.length ? item.availableOn : (item.platforms ?? []);

  function act(action: Exclude<Reaction, null>) {
    onAction(action);
    if (action !== 'like' || reaction === 'like') onClose();
  }

  return (
    <div
      className="fdm-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Détails de ${item.title}`}
    >
      <div className="fdm-panel">
        {/* ── Hero ── */}
        <div className="fdm-hero" style={{ background: item.posterColor }}>
          {heroSrc && (
            <img
              src={heroSrc}
              className="fdm-hero-img"
              alt={item.title}
              onError={() => setHeroFailed(true)}
            />
          )}
          <div className="fdm-hero-gradient" />
          <button className="fdm-close" onClick={onClose} aria-label="Fermer">✕</button>

          <div className="fdm-hero-info">
            <span className="fdm-type-badge">
              {item.type === 'movie' ? '🎬 Film' : '📺 Série'}
            </span>
            <h2 className="fdm-title">{item.title}</h2>
            <div className="fdm-meta-row">
              {releaseYear && <span>{releaseYear}</span>}
              {durationLabel && <><span className="fdm-dot">·</span><span>{durationLabel}</span></>}
              {item.voteAverage && item.voteAverage > 0 && (
                <><span className="fdm-dot">·</span><span>★ {item.voteAverage.toFixed(1)}</span></>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="fdm-body">

          {/* Plateformes */}
          {platforms.length > 0 && (
            <div className="fdm-platforms">
              {platforms.map(p => (
                <span key={p} className="fdm-platform-tag">{p}</span>
              ))}
            </div>
          )}

          {/* Synopsis complet */}
          {(item.overview || item.atmosphere) && (
            <div className="fdm-section">
              <h3 className="fdm-section-title">Synopsis</h3>
              <p className="fdm-synopsis">{item.overview || item.atmosphere}</p>
            </div>
          )}

          {/* Pourquoi pour moi */}
          {item.shortReason && (
            <div className="fdm-section fdm-why-box">
              <h3 className="fdm-section-title">✨ Pourquoi pour toi</h3>
              <p className="fdm-why-text">{item.shortReason}</p>
            </div>
          )}

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="fdm-tags">
              {item.tags.map(t => <span key={t} className="fdm-tag">{t}</span>)}
            </div>
          )}

          {/* ── Trailer ── */}
          <div className="fdm-trailer-section">
            {trailerState === 'idle' && (
              <button className="fdm-trailer-btn" onClick={loadTrailer}>
                <span className="fdm-play-icon">▶</span> Voir le trailer
              </button>
            )}

            {trailerState === 'loading' && (
              <button className="fdm-trailer-btn fdm-trailer-loading" disabled>
                ⏳ Recherche du trailer…
              </button>
            )}

            {trailerState === 'ready' && trailerKey && (
              <div>
                <div className="fdm-trailer-wrap">
                  <iframe
                    src={`https://www.youtube.com/embed/${trailerKey}?rel=0&modestbranding=1&autoplay=1&playsinline=1`}
                    title={`Trailer — ${item.title}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="fdm-trailer-iframe"
                  />
                </div>
                <a
                  href={`https://www.youtube.com/watch?v=${trailerKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fdm-yt-link"
                  onClick={e => e.stopPropagation()}
                >
                  ↗ Ouvrir sur YouTube
                </a>
              </div>
            )}

            {trailerState === 'none' && (
              <p className="fdm-no-trailer">Aucun trailer disponible pour ce titre.</p>
            )}
          </div>

          {/* ── Actions ── */}
          <div className="fdm-actions">
            <button
              className={`fdm-action-primary${reaction === 'like' ? ' active' : ''}`}
              onClick={() => act('like')}
            >
              {reaction === 'like' ? '❤️ Dans ta liste !' : '❤️ Ça me tente'}
            </button>
            <div className="fdm-action-row">
              <button className="fdm-action-sm" onClick={() => act('seen')}>👁️ Déjà vu</button>
              <button className="fdm-action-sm" onClick={() => act('dislike')}>🚫 Pas mon style</button>
              <button className="fdm-action-sm" onClick={() => act('too-long')}>⏱️ Trop long</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
