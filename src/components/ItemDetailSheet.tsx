import { useEffect } from 'react';
import type { UserProfile, Recommendation, ItemMeta, SatisfactionRating } from '../types';
import { PosterImage } from './PosterImage';

export interface DetailItem {
  id:          number;
  meta:        ItemMeta;
  fullItem?:   Recommendation;
  listKey:     'want' | 'liked' | 'seen' | 'vus' | 'disliked' | 'abandoned';
}

interface Props {
  item:         DetailItem;
  profile:      UserProfile;
  onClose:      () => void;
  onMarkSeen:   (id: number) => void;
  onRate:       (id: number, rating: SatisfactionRating) => void;
  onRemove:     (id: number, list: DetailItem['listKey']) => void;
}

const RATING_CONFIG: { value: SatisfactionRating; emoji: string; label: string }[] = [
  { value: 'loved',       emoji: '❤️', label: 'Adoré'  },
  { value: 'good',        emoji: '👍', label: 'Bien'   },
  { value: 'ok',          emoji: '😐', label: 'Moyen'  },
  { value: 'disappointed',emoji: '😔', label: 'Déçu'   },
  { value: 'bad',         emoji: '👎', label: 'Mauvais'},
];

export function ItemDetailSheet({ item, profile, onClose, onMarkSeen, onRate, onRemove }: Props) {
  const { id, meta, fullItem, listKey } = item;
  const satisfaction = profile.satisfactionLog.find(e => e.itemId === id);

  // Merge meta + fullItem for display (fullItem takes priority for richer data)
  const title      = meta.title;
  const type       = meta.type;
  const posterUrl  = meta.posterUrl ?? fullItem?.posterUrl ?? null;
  const posterEmoji = meta.posterEmoji;
  const posterColor = meta.posterColor;
  const overview   = meta.overview ?? fullItem?.overview ?? fullItem?.atmosphere ?? meta.atmosphere ?? null;
  const duration   = meta.duration ?? fullItem?.duration;
  const seasons    = meta.seasons ?? fullItem?.seasons;
  const platforms  = (meta.platforms ?? fullItem?.platforms ?? []).slice(0, 3);
  const tags       = (meta.tags ?? fullItem?.tags ?? []).slice(0, 5);
  const shortReason = meta.shortReason ?? fullItem?.shortReason ?? null;
  const addedAt    = meta.addedAt ?? null;

  // Close on backdrop click or escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const durationLabel = type === 'series'
    ? `${seasons ?? '?'} saison${(seasons ?? 0) > 1 ? 's' : ''}`
    : duration
      ? `${duration} min`
      : null;

  const addedLabel = addedAt
    ? new Date(addedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Détails de ${title}`}>
      <div className="sheet-panel" onClick={e => e.stopPropagation()}>
        {/* Drag handle */}
        <div className="sheet-handle" />

        {/* Poster header */}
        <div className="sheet-poster-wrap">
          <PosterImage
            src={posterUrl}
            alt={title}
            emoji={posterEmoji}
            color={posterColor}
            className="sheet-poster"
            objectFit="cover"
            objectPosition="center top"
          />
          <div className="sheet-poster-gradient" />
          <div className="sheet-poster-info">
            <span className="sheet-type-badge">
              {type === 'movie' ? '🎬 Film' : '📺 Série'}
            </span>
            <h2 className="sheet-title">{title}</h2>
            {durationLabel && <span className="sheet-duration">{durationLabel}</span>}
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {/* Scrollable content */}
        <div className="sheet-body">

          {/* Platforms */}
          {platforms.length > 0 && (
            <div className="sheet-platforms">
              {platforms.map(p => (
                <span key={p} className="sheet-platform-badge">{p}</span>
              ))}
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="sheet-tags">
              {tags.map(t => (
                <span key={t} className="sheet-tag">{t}</span>
              ))}
            </div>
          )}

          {/* Synopsis */}
          {overview && (
            <div className="sheet-section">
              <h3 className="sheet-section-title">Synopsis</h3>
              <p className="sheet-synopsis">{overview}</p>
            </div>
          )}

          {/* Why for me */}
          {shortReason && (
            <div className="sheet-section sheet-why-box">
              <h3 className="sheet-section-title">✨ Pourquoi ce choix</h3>
              <p className="sheet-why-text">{shortReason}</p>
            </div>
          )}

          {/* Your rating */}
          {satisfaction && (
            <div className="sheet-section">
              <h3 className="sheet-section-title">Ta note</h3>
              <div className="sheet-rating-display">
                {RATING_CONFIG.find(r => r.value === satisfaction.rating)?.emoji}
                <span>{RATING_CONFIG.find(r => r.value === satisfaction.rating)?.label}</span>
                <span className="sheet-rating-date">
                  {new Date(satisfaction.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                </span>
              </div>
            </div>
          )}

          {/* Rate / change rating */}
          <div className="sheet-section">
            <h3 className="sheet-section-title">
              {satisfaction ? 'Modifier ta note' : 'Tu l\'as regardé ?'}
            </h3>
            <div className="sheet-rating-row">
              {RATING_CONFIG.map(r => (
                <button
                  key={r.value}
                  className={`sheet-rate-btn ${satisfaction?.rating === r.value ? 'active' : ''}`}
                  onClick={() => onRate(id, r.value)}
                  title={r.label}
                >
                  <span>{r.emoji}</span>
                  <span className="sheet-rate-label">{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Added date */}
          {addedLabel && (
            <p className="sheet-added-date">Ajouté le {addedLabel}</p>
          )}

          {/* Actions */}
          <div className="sheet-actions">
            {listKey === 'want' && (
              <button className="sheet-action-btn sheet-action-primary" onClick={() => onMarkSeen(id)}>
                👁️ Marquer comme vu
              </button>
            )}
            <button
              className="sheet-action-btn sheet-action-danger"
              onClick={() => onRemove(id, listKey)}
            >
              🗑️ Retirer de la liste
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
