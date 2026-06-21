import { useState } from 'react';
import calibrationData from '../data/calibration.json';

export type CalibRating = 'liked' | 'disliked' | 'unseen';

export interface CalibResult {
  itemId: number;
  title: string;
  action: 'liked' | 'disliked';
}

interface Props {
  onComplete: (results: CalibResult[]) => void;
  onDismiss: () => void;
}

export function CalibrationModal({ onComplete, onDismiss }: Props) {
  const [ratings, setRatings] = useState<Record<number, CalibRating>>({});

  function rate(id: number, r: CalibRating) {
    setRatings(prev => ({ ...prev, [id]: r }));
  }

  function handleSubmit() {
    const results: CalibResult[] = [];
    for (const item of calibrationData) {
      const r = ratings[item.id];
      if (r === 'liked' || r === 'disliked') {
        results.push({ itemId: item.id, title: item.title, action: r });
      }
    }
    onComplete(results);
  }

  const ratedCount = Object.keys(ratings).length;

  return (
    <div className="calib-overlay" onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="calib-modal">
        <div className="calib-header">
          <h2 className="calib-title">🎯 Calibre tes goûts</h2>
          <p className="calib-sub">
            Dis-nous ce que tu as déjà vu — MoodFlix apprendra de tes goûts.
          </p>
          <button className="calib-close" onClick={onDismiss} aria-label="Fermer">✕</button>
        </div>

        <div className="calib-list">
          {calibrationData.map(item => {
            const r = ratings[item.id];
            return (
              <div key={item.id} className={`calib-item ${r ? `calib-item-${r}` : ''}`}>
                <div className="calib-item-info">
                  <span className="calib-emoji">{item.posterEmoji}</span>
                  <div className="calib-item-meta">
                    <span className="calib-item-title">{item.title}</span>
                    <span className="calib-item-type">{item.type === 'movie' ? 'Film' : 'Série'}</span>
                  </div>
                </div>
                <div className="calib-btns">
                  <button
                    className={`calib-btn calib-btn-like ${r === 'liked' ? 'active' : ''}`}
                    onClick={() => rate(item.id, r === 'liked' ? 'unseen' : 'liked')}
                    title="J'ai aimé"
                  >
                    ❤️
                  </button>
                  <button
                    className={`calib-btn calib-btn-dislike ${r === 'disliked' ? 'active' : ''}`}
                    onClick={() => rate(item.id, r === 'disliked' ? 'unseen' : 'disliked')}
                    title="Pas fan"
                  >
                    👎
                  </button>
                  <button
                    className={`calib-btn calib-btn-unseen ${r === 'unseen' ? 'active' : ''}`}
                    onClick={() => rate(item.id, r === 'unseen' ? undefined as unknown as CalibRating : 'unseen')}
                    title="Pas vu"
                  >
                    ⏭️
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="calib-footer">
          {ratedCount > 0 && (
            <p className="calib-progress">{ratedCount} / {calibrationData.length} noté{ratedCount > 1 ? 's' : ''}</p>
          )}
          <button
            className="calib-submit"
            onClick={handleSubmit}
          >
            {ratedCount === 0 ? 'Passer →' : `Enregistrer ${ratedCount} avis →`}
          </button>
        </div>
      </div>
    </div>
  );
}
