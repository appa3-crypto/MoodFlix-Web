import { useState, useEffect } from 'react';
import type { ScoredRecommendation, SatisfactionRating, UserProfile, Mood, AIExplanation } from '../types';
import { SatisfactionModal } from './SatisfactionModal';
import { getAIExplanation } from '../services/aiExplanationService';
import { computeCompatibility, compatibilityLabel } from '../utils/semanticMatching';

interface Props {
  item:          ScoredRecommendation;
  rank:          number;
  profile:       UserProfile | null;
  mood:          Mood | null;
  onAction:      (itemId: number, action: 'like' | 'seen' | 'dislike' | 'too-long') => void;
  onUndo:        (itemId: number) => void;
  onSatisfaction:(itemId: number, rating: SatisfactionRating, reasons: string[]) => void;
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

export function RecommendationCard({ item, rank, profile, mood, onAction, onUndo, onSatisfaction }: Props) {
  function getInitialReaction(): Reaction {
    if (!profile) return null;
    if (profile.wantToWatchItems.includes(item.id)) return 'like';
    if (profile.seenItems.includes(item.id))        return 'seen';
    if (profile.dislikedItems.includes(item.id))    return 'dislike';
    if (profile.tooLongItems.includes(item.id))     return 'too-long';
    return null;
  }

  const [reaction,           setReaction]           = useState<Reaction>(getInitialReaction);
  const [showModal,          setShowModal]           = useState(false);
  const [feedbackMsg,        setFeedbackMsg]         = useState<string | null>(null);
  const [explanation,        setExplanation]         = useState<AIExplanation | null>(null);
  const [loadingExplanation, setLoadingExplanation]  = useState(false);
  const [showExplanation,    setShowExplanation]     = useState(false);
  const [heroFailed,         setHeroFailed]          = useState(false);

  useEffect(() => { setHeroFailed(false); }, [item.id, item.backdropUrl, item.posterUrl]);

  const compat              = computeCompatibility(item, profile, mood);
  const compatLabel         = compatibilityLabel(compat.total);
  const existingSatisfaction= profile?.satisfactionLog.find(e => e.itemId === item.id);

  // Pick best available hero image: backdrop > poster
  const heroSrc = !heroFailed
    ? (item.backdropUrl ?? item.posterUrl ?? null)
    : null;

  function showFeedback(msg: string) {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 2500);
  }

  function handleAction(action: 'like' | 'seen' | 'dislike' | 'too-long') {
    const next: Reaction = reaction === action ? null : action;
    setReaction(next);
    if (next) {
      onAction(item.id, next);
      if (next === 'like')     showFeedback('Ajouté à ton profil ✨');
      if (next === 'dislike')  showFeedback("On évitera ce style 👌");
      if (next === 'too-long') showFeedback('On évitera les contenus trop longs ⏱️');
      if (next === 'seen')     showFeedback('Noté ! 👁️');
    } else {
      onUndo(item.id);
    }
  }

  async function handleWhyForMe() {
    if (explanation) {
      setShowExplanation(s => !s);
      return;
    }
    setLoadingExplanation(true);
    setShowExplanation(true);
    const result = await getAIExplanation(item, profile, mood);
    setExplanation(result);
    setLoadingExplanation(false);
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

  // Dismissed state
  if (reaction === 'seen' || reaction === 'dislike' || reaction === 'too-long') {
    return (
      <div className="card card-dismissed">
        <span className="card-dismissed-emoji">
          {reaction === 'seen' ? '👁️' : reaction === 'dislike' ? '🚫' : '⏱️'}
        </span>
        <p className="card-dismissed-title">{item.title}</p>
        <p className="card-dismissed-text">
          {reaction === 'seen'     && 'Déjà vu — on comprend !'}
          {reaction === 'dislike'  && "Pas ton style, c'est noté."}
          {reaction === 'too-long' && 'Trop long pour ce soir.'}
        </p>
        {reaction === 'seen' && !existingSatisfaction && (
          <button className="btn-rate-small" onClick={() => setShowModal(true)}>
            ⭐ Tu as aimé ?
          </button>
        )}
        <button className="btn-undo" onClick={() => handleAction(reaction)}>Annuler</button>
        {showModal && (
          <SatisfactionModal item={item} onComplete={handleSatisfactionComplete} onDismiss={() => setShowModal(false)} />
        )}
      </div>
    );
  }

  return (
    <div className={`card ${reaction === 'like' ? 'card-liked' : ''}`}>
      {feedbackMsg && <div className="card-feedback" role="status">{feedbackMsg}</div>}

      {/* ── HERO (cinematic backdrop / poster) ── */}
      <div className="card-hero" style={{ background: item.posterColor }}>
        {heroSrc && (
          <img
            src={heroSrc}
            alt={item.title}
            className="card-hero-img"
            style={{ objectPosition: item.backdropUrl && !heroFailed ? 'center' : 'center top' }}
            onError={() => setHeroFailed(true)}
          />
        )}
        {!heroSrc && (
          <span className="card-hero-emoji">{item.posterEmoji}</span>
        )}
        <div className="card-hero-gradient" />

        {/* Top row: rank + badges */}
        <div className="card-hero-top">
          <div className="card-rank">#{rank}</div>
          <div className="card-hero-badges">
            {item.isDiscovery && <span className="discovery-badge">🔍 Découverte</span>}
            <span className="card-type-badge">
              {item.type === 'movie' ? '🎬 Film' : '📺 Série'}
            </span>
            {compat.total >= 65 && profile && (
              <span className="compat-badge">{compat.total}%</span>
            )}
          </div>
        </div>

        {/* Bottom: title + meta */}
        <div className="card-hero-info">
          <h3 className="card-title">{item.title}</h3>
          <div className="card-tags-row">
            {item.availableOn && item.availableOn.length > 0 ? (
              item.availableOn.map(p => (
                <span key={p} className="card-tag card-tag-platform card-tag-live">{p}</span>
              ))
            ) : (
              <span className="card-tag card-tag-platform">{item.platforms[0]}</span>
            )}
            <span className="card-tag card-tag-duration">{durationLabel}</span>
            {item.voteAverage && item.voteAverage > 0 && (
              <span className="card-tag card-tag-rating">★ {item.voteAverage.toFixed(1)}</span>
            )}
            {item.fromTMDB && <span className="card-tmdb-badge">TMDB</span>}
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="card-body">
        <p className="card-atmosphere">
          {item.overview
            ? (item.overview.length > 150 ? item.overview.slice(0, 147) + '…' : item.overview)
            : item.atmosphere}
        </p>

        <div className="score-bars">
          <ScoreBar label="Mystère"    value={item.mysteryScore}    color="#8B5CF6" />
          <ScoreBar label="Émotion"    value={item.emotionScore}    color="#EC4899" />
          <ScoreBar label="Peur"       value={item.fearScore}       color="#EF4444" />
          <ScoreBar label="Humour"     value={item.humorScore}      color="#F59E0B" />
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
            <button className="action-btn-sm" onClick={() => handleAction('seen')}>👁️ Déjà vu</button>
            <button className="action-btn-sm" onClick={() => handleAction('dislike')}>🚫 Pas mon style</button>
            <button className="action-btn-sm" onClick={() => handleAction('too-long')}>⏱️ Trop long</button>
          </div>
        </div>

        <button
          className={`btn-why ${loadingExplanation ? 'btn-why-loading' : ''} ${showExplanation && explanation ? 'btn-why-active' : ''}`}
          onClick={handleWhyForMe}
          disabled={loadingExplanation}
        >
          {loadingExplanation ? '⏳ Analyse en cours…' : showExplanation && explanation ? '🧠 Masquer l\'analyse' : '🧠 Pourquoi pour moi ?'}
        </button>

        {showExplanation && (
          <div className="ai-explanation-panel">
            {loadingExplanation ? (
              <div className="ai-loading">
                <div className="ai-loading-dot" /><div className="ai-loading-dot" /><div className="ai-loading-dot" />
              </div>
            ) : explanation ? (
              <>
                <div className="ai-explanation-header">
                  <span className="ai-source-label">
                    {explanation.isLocal ? '✦ Analyse locale' : '✦ IA MoodFlix'}
                  </span>
                  <span className="ai-confidence">
                    {Math.round(explanation.confidence * 100)}% pertinent
                  </span>
                </div>
                <p className="ai-explanation-text">{explanation.explanation}</p>
                <ul className="ai-reasons-list">
                  {explanation.reasons.map((r, i) => (
                    <li key={i} className="ai-reason-item">→ {r}</li>
                  ))}
                </ul>
                <p className="ai-risk-text">{explanation.riskLevel}</p>
                {compatLabel && (
                  <div className="compat-bar-row">
                    <span className="compat-bar-label">{compatLabel}</span>
                    <div className="compat-bar-track">
                      <div className="compat-bar-fill" style={{ width: `${compat.total}%` }} />
                    </div>
                    <span className="compat-bar-pct">{compat.total}%</span>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

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
        <SatisfactionModal item={item} onComplete={handleSatisfactionComplete} onDismiss={() => setShowModal(false)} />
      )}
    </div>
  );
}
