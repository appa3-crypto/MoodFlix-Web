import { useState, useEffect, useRef } from 'react';
import type { ScoredRecommendation, WatchPlan } from '../types';

interface Props {
  items:          ScoredRecommendation[];
  onConfirm:      (plan: WatchPlan) => void;
  onDismiss:      () => void;
  canRelaunch:    boolean;  // from freemium hook
  onNeedPremium:  () => void;
}

type Phase = 'spinning' | 'result';

export function ChooseForMeModal({ items, onConfirm, onDismiss, canRelaunch, onNeedPremium }: Props) {
  const [phase,       setPhase]       = useState<Phase>('spinning');
  const [displayIdx,  setDisplayIdx]  = useState(0);
  const [chosen,      setChosen]      = useState<ScoredRecommendation | null>(null);
  const [usedIds,     setUsedIds]     = useState<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pick the best item with slight top-weighted randomness
  function pickBest(pool: ScoredRecommendation[]): ScoredRecommendation {
    const sorted = [...pool].sort((a, b) => b.score - a.score);
    const topN   = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.6)));
    return topN[Math.floor(Math.random() * topN.length)] ?? sorted[0];
  }

  function startSpin() {
    setPhase('spinning');
    let count = 0;

    intervalRef.current = setInterval(() => {
      setDisplayIdx(prev => (prev + 1) % items.length);
      count++;
      if (count >= 15) {
        clearInterval(intervalRef.current!);
        const available = items.filter(i => !usedIds.includes(i.id));
        const result    = pickBest(available.length >= 1 ? available : items);
        setChosen(result);
        setPhase('result');
      }
    }, 100);
  }

  useEffect(() => {
    startSpin();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedIds.length]);

  function handleRelaunch() {
    if (!canRelaunch) { onNeedPremium(); return; }
    if (chosen) setUsedIds(prev => [...prev, chosen.id]);
  }

  function handleConfirm() {
    if (!chosen) return;
    const plannedAt = new Date().toISOString();
    const notifyAt  = chosen.duration
      ? new Date(Date.now() + (chosen.duration + 30) * 60_000).toISOString()
      : undefined;
    onConfirm({
      itemId:      chosen.id,
      title:       chosen.title,
      posterUrl:   chosen.posterUrl,
      posterEmoji: chosen.posterEmoji,
      posterColor: chosen.posterColor,
      duration:    chosen.duration,
      plannedAt,
      notifyAt,
      status: 'planned',
      source: 'choose_for_me',
    });
  }

  function handleShare() {
    const text = `Ce soir MoodFlix m'a choisi "${chosen?.title}" 🍿`;
    if (navigator.share) {
      navigator.share({ title: 'MoodFlix', text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text).catch(() => {});
    }
  }

  const display = phase === 'spinning' ? items[displayIdx] : chosen;
  if (!display) return null;

  const durationLabel = chosen
    ? chosen.type === 'series'
      ? `${chosen.seasons ?? '?'} saison${(chosen.seasons ?? 0) > 1 ? 's' : ''}`
      : chosen.duration ? `${chosen.duration} min` : '–'
    : '–';

  return (
    <div className="cfm-overlay" onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="cfm-modal">
        <button className="cfm-close" onClick={onDismiss} aria-label="Fermer">✕</button>

        {/* ── SPINNING ── */}
        {phase === 'spinning' && (
          <div className="cfm-spin-phase">
            <p className="cfm-spin-label">🎲 Sélection en cours…</p>
            <div className="cfm-spin-card" style={{ background: display.posterColor }}>
              {display.posterUrl
                ? <img src={display.posterUrl} className="cfm-spin-poster" alt="" />
                : <span className="cfm-spin-emoji">{display.posterEmoji}</span>
              }
              <div className="cfm-spin-shimmer" />
            </div>
            <p className="cfm-spin-title">{display.title}</p>
          </div>
        )}

        {/* ── RESULT ── */}
        {phase === 'result' && chosen && (
          <div className="cfm-result-phase">
            <p className="cfm-result-eyebrow">Ce soir tu regardes</p>

            <div className="cfm-result-poster" style={{ background: chosen.posterColor }}>
              {chosen.posterUrl
                ? <img src={chosen.posterUrl} className="cfm-result-img" alt={chosen.title} />
                : <span className="cfm-result-fallback">{chosen.posterEmoji}</span>
              }
            </div>

            <h2 className="cfm-result-title">{chosen.title}</h2>

            <div className="cfm-result-meta">
              <span>{chosen.type === 'movie' ? '🎬 Film' : '📺 Série'}</span>
              <span className="cfm-dot">·</span>
              <span>{durationLabel}</span>
              {chosen.voteAverage && chosen.voteAverage > 0 && (
                <><span className="cfm-dot">·</span><span>★ {chosen.voteAverage.toFixed(1)}</span></>
              )}
            </div>

            {chosen.availableOn && chosen.availableOn.length > 0 && (
              <div className="cfm-platforms">
                {chosen.availableOn.map(p => <span key={p} className="cfm-platform-tag">{p}</span>)}
              </div>
            )}

            {chosen.overview || chosen.shortReason ? (
              <p className="cfm-reason">
                ✨ {chosen.overview
                  ? (chosen.overview.length > 120 ? chosen.overview.slice(0, 117) + '…' : chosen.overview)
                  : chosen.shortReason}
              </p>
            ) : null}

            <div className="cfm-actions">
              <button className="cfm-btn-confirm" onClick={handleConfirm}>
                ✅ OK je regarde
              </button>
              <div className="cfm-secondary-actions">
                <button
                  className={`cfm-btn-relaunch ${!canRelaunch ? 'cfm-btn-locked' : ''}`}
                  onClick={handleRelaunch}
                >
                  {canRelaunch ? '🎲 Relancer' : '🔒 Relancer (Premium)'}
                </button>
                <button className="cfm-btn-share" onClick={handleShare}>
                  📤 Partager
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
