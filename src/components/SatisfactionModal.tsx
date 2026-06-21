import { useState } from 'react';
import type { ScoredRecommendation, SatisfactionRating } from '../types';

interface Props {
  item: ScoredRecommendation;
  onComplete: (rating: SatisfactionRating, reasons: string[]) => void;
  onDismiss: () => void;
}

const RATINGS: { value: SatisfactionRating; emoji: string; label: string }[] = [
  { value: 'loved', emoji: '❤️', label: 'Adoré' },
  { value: 'good', emoji: '👍', label: 'Bien' },
  { value: 'ok', emoji: '😐', label: 'Moyen' },
  { value: 'disappointed', emoji: '😔', label: 'Déçu' },
  { value: 'bad', emoji: '👎', label: 'Nul' },
];

const REASONS = [
  { value: 'trop-lent', label: 'Trop lent' },
  { value: 'trop-previsible', label: 'Trop prévisible' },
  { value: 'mauvaise-fin', label: 'Mauvaise fin' },
  { value: 'trop-complique', label: 'Trop compliqué' },
  { value: 'trop-violent', label: 'Trop violent' },
  { value: 'trop-long', label: 'Trop long' },
  { value: 'pas-immersif', label: 'Pas assez immersif' },
  { value: 'pas-mysterieux', label: 'Pas assez mystérieux' },
];

export function SatisfactionModal({ item, onComplete, onDismiss }: Props) {
  const [rating, setRating] = useState<SatisfactionRating | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);

  function toggleReason(r: string) {
    setReasons(s => s.includes(r) ? s.filter(x => x !== r) : [...s, r]);
  }

  const showReasons = rating === 'ok' || rating === 'disappointed' || rating === 'bad';

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onDismiss} aria-label="Fermer">×</button>

        <p className="modal-eyebrow">Journal de satisfaction</p>
        <h3 className="modal-title">Tu l'as regardé ?</h3>
        <p className="modal-subtitle">{item.title}</p>

        <div className="rating-grid">
          {RATINGS.map(r => (
            <button
              key={r.value}
              className={`rating-btn ${rating === r.value ? 'active' : ''}`}
              onClick={() => setRating(r.value)}
            >
              <span className="rating-emoji">{r.emoji}</span>
              <span className="rating-label">{r.label}</span>
            </button>
          ))}
        </div>

        {rating && showReasons && (
          <div className="reasons-section">
            <p className="reasons-title">
              Pourquoi ? <span className="reasons-optional">(optionnel)</span>
            </p>
            <div className="reasons-grid">
              {REASONS.map(r => (
                <button
                  key={r.value}
                  className={`reason-btn ${reasons.includes(r.value) ? 'active' : ''}`}
                  onClick={() => toggleReason(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {rating && (
          <button
            className="btn-submit-rating"
            onClick={() => onComplete(rating, reasons)}
          >
            Enregistrer mon avis
          </button>
        )}
      </div>
    </div>
  );
}
