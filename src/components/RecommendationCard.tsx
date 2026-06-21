import { useState } from 'react';
import type { ScoredRecommendation, SatisfactionRating, UserProfile } from '../types';
import { SatisfactionModal } from './SatisfactionModal';

interface Props {
  item: ScoredRecommendation;
  rank: number;
  profile: UserProfile | null;
  onAction: (itemId: number, action: 'like' | 'seen' | 'dislike' | 'too-long') => void;
  onUndo: (itemId: number) => void;
  onSatisfaction: (itemId: number, rating: SatisfactionRating, reasons: string[]) => void;
}

type Reaction = 'like' | 'seen' | 'dislike' | 'too-long' | null;

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  if (value === 0) return null;
  return (
    <div className="score-bar-row">
      <span className="score-bar-label">{label}</span>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${value * 10}%`, background: color }} />
      </div>
    </div>
  );
}

export function RecommendationCard({ item, rank, profile, onAction, onUndo, onSatisfaction }: Props) {
  function getInitialReaction(): Reaction {
    if (!profile) return null;
    if (profile.wantToWatchItems.includes(item.id)) return 'like';
    if (profile.seenItems.includes(item.id)) return 'seen';
    if (profile.dislikedItems.includes(item.id)) return 'dislike';
    if (profile.tooLongItems.includes(item.id)) return 'too-long';
    return null;
  }

  const [reaction, setReaction] = useState<Reaction>(getInitialReaction);
  const [showModal, setShowModal] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const existingSatisfaction = profile?.satisfactionLog.find(e => e.itemId === item.id);

  function showFeedback(msg: string) {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 2500);
  }

  function handleAction(action: 'like' | 'seen' | 'dislike' | 'too-long') {
    const next: Reaction = reaction === action ? null : action;
    setReaction(next);
    if (next) {
      onAction(item.id, next);
      if (next === 'like') showFeedback('Ajouté à ton profil ✨');
      else if (next === 'dislike') showFeedback('On évitera ce style 👌');
      else if (next === 'too-long') showFeedback('On évitera les contenus trop longs ⏱️');
      else if (next === 'seen') showFeedback('Noté ! 👁️');
    } else {
      onUndo(item.id);
    }
  }

  function handleSatisfactionComplete(rating: SatisfactionRating, reasons: string[]) {
    onSatisfaction(item.id, rating, reasons);
    setShowModal(false);
  }

  const durationLabel =
    item.type === 'series'
      ? `${item.seasons} saison${(item.seasons ?? 0) > 1 ? 's' : ''}`
      : item.duration
        ? `${item.duration} min`
        : '–';

  // Dismissed state (non-like reactions collapse the card)
  if (reaction === 'seen' || reaction === 'dislike' || reaction === 'too-long') {
    return (
      <div className="card card-dismissed">
        <span className="card-dismissed-emoji">
          {reaction === 'seen' ? '👁️' : reaction === 'dislike' ? '🚫' : '⏱️'}
        </span>
        <p className="card-dismissed-title">{item.title}</p>
        <p className="card-dismissed-text">
          {reaction === 'seen' && 'Déjà vu — on comprend !'}
          {reaction === 'dislike' && 'Pas ton style, c\'est noté.'}
          {reaction === 'too-long' && 'Trop long pour ce soir.'}
        </p>
        {reaction === 'seen' && !existingSatisfaction && (
          <button className="btn-rate-small" onClick={() => setShowModal(true)}>
            ⭐ Tu as aimé ?
          </button>
        )}
        <button className="btn-undo" onClick={() => handleAction(reaction)}>
          Annuler
        </button>
        {showModal && (
          <SatisfactionModal
            item={item}
            onComplete={handleSatisfactionComplete}
            onDismiss={() => setShowModal(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`card ${reaction === 'like' ? 'card-liked' : ''}`}>
      {/* Feedback toast */}
      {feedbackMsg && (
        <div className="card-feedback" role="status">{feedbackMsg}</div>
      )}

      {/* Poster */}
      <div className="card-poster" style={{ background: item.posterColor }}>
        {item.posterUrl ? (
          <>
            <img
              src={item.posterUrl}
              alt={item.title}
              className="card-poster-img"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="card-poster-gradient" />
          </>
        ) : (
          <span className="card-poster-emoji">{item.posterEmoji}</span>
        )}
        <div className="card-rank">#{rank}</div>
        <div className="card-type-badge">
          {item.type === 'movie' ? '🎬 Film' : '📺 Série'}
        </div>
        {item.isDiscovery && (
          <div className="discovery-badge">🔍 Découverte du soir</div>
        )}
      </div>

      {/* Body */}
      <div className="card-body">
        <div className="card-meta">
          <h3 className="card-title">{item.title}</h3>
          <div className="card-tags-row">
            <span className="card-tag card-tag-platform">{item.platforms[0]}</span>
            <span className="card-tag card-tag-duration">{durationLabel}</span>
          </div>
        </div>

        <p className="card-atmosphere">{item.atmosphere}</p>

        <div className="score-bars">
          <ScoreBar label="Mystère" value={item.mysteryScore} color="#8B5CF6" />
          <ScoreBar label="Émotion" value={item.emotionScore} color="#EC4899" />
          <ScoreBar label="Peur" value={item.fearScore} color="#EF4444" />
          <ScoreBar label="Humour" value={item.humorScore} color="#F59E0B" />
          <ScoreBar label="Complexité" value={item.complexityScore} color="#3B82F6" />
        </div>

        <div className="card-reasons">
          <div className="card-reason card-reason-why">
            <span className="reason-icon">✨</span>
            <p>{item.shortReason}</p>
          </div>
          <div className="card-reason card-reason-risk">
            <span className="reason-icon">⚠️</span>
            <p>{item.disappointmentRisk}</p>
          </div>
        </div>

        <div className="card-actions">
          <button
            className={`action-btn action-like ${reaction === 'like' ? 'active' : ''}`}
            onClick={() => handleAction('like')}
          >
            {reaction === 'like' ? '❤️ Ajouté !' : '❤️ Ça me tente'}
          </button>
          <div className="action-secondary">
            <button className="action-btn-sm" onClick={() => handleAction('seen')}>
              👁️ Déjà vu
            </button>
            <button className="action-btn-sm" onClick={() => handleAction('dislike')}>
              🚫 Pas mon style
            </button>
            <button className="action-btn-sm" onClick={() => handleAction('too-long')}>
              ⏱️ Trop long
            </button>
          </div>
        </div>

        {reaction === 'like' && !existingSatisfaction && (
          <button className="btn-rate" onClick={() => setShowModal(true)}>
            ⭐ Tu l'as regardé ? Donne ton avis
          </button>
        )}
        {reaction === 'like' && existingSatisfaction && (
          <button className="btn-rate btn-rate-done" onClick={() => setShowModal(true)}>
            ✓ Avis enregistré — modifier ?
          </button>
        )}
      </div>

      {showModal && (
        <SatisfactionModal
          item={item}
          onComplete={handleSatisfactionComplete}
          onDismiss={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
