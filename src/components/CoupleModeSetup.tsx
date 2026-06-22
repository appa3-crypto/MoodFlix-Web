import { useState } from 'react';
import type { Mood, Duration, ContentType, CouplePrefs, UserProfile, Recommendation } from '../types';
import type { ScoredRecommendation } from '../types';

interface Props {
  profile:  UserProfile;
  allItems: Recommendation[];
  onDismiss: () => void;
}

const MOOD_OPTIONS: { value: Mood; label: string; emoji: string }[] = [
  { value: 'laugh',        label: 'Rire',             emoji: '😄' },
  { value: 'scared',       label: 'Frissonner',       emoji: '👻' },
  { value: 'moved',        label: 'Être émus',        emoji: '❤️' },
  { value: 'escape',       label: "M'évader",         emoji: '🧭' },
  { value: 'mind-bending', label: 'Retourner le cerveau', emoji: '🧠' },
  { value: 'surprised',    label: 'Surprends-moi',    emoji: '✨' },
];

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: 'under-90',    label: 'Moins de 1h30' },
  { value: 'two-hours',   label: '1h30 – 2h' },
  { value: 'evening',     label: '2h +' },
  { value: 'several-days',label: 'Plusieurs épisodes' },
];

// Score an item for person 2 based on their prefs (0–80 scale)
function scoreForP2(item: Recommendation, prefs: CouplePrefs): number {
  let s = 0;
  if (prefs.moods.some(m => item.moods.includes(m))) s += 40;
  if (prefs.duration && item.durationCategory === prefs.duration) s += 20;
  if (prefs.type !== 'both' && item.type === prefs.type) s += 15;
  else if (prefs.type === 'both') s += 5;
  return s;
}

// Score an item for person 1 based on their profile and liked genres
function scoreForP1(item: Recommendation, profile: UserProfile): number {
  let s = 0;
  // Check moods against frequent moods
  const topMood = Object.entries(profile.frequentMoods).sort((a, b) => b[1] - a[1])[0]?.[0] as Mood | undefined;
  if (topMood && item.moods.includes(topMood)) s += 40;
  // Exclude disliked
  if (profile.dislikedItems.includes(item.id) || profile.seenItems.includes(item.id)) s -= 100;
  // Liked genres bonus
  if (profile.satisfactionLog.some(e => e.rating === 'loved' || e.rating === 'good')) s += 10;
  return s;
}

function getCoupleRecs(
  allItems: Recommendation[],
  profile: UserProfile,
  p2: CouplePrefs,
): (ScoredRecommendation & { scoreP1: number; scoreP2: number; scoreCouple: number })[] {
  return allItems
    .filter(item => !profile.dislikedItems.includes(item.id))
    .map(item => {
      const p1 = scoreForP1(item, profile);
      const p2s = scoreForP2(item, p2);
      // Malus si conflit de type fort
      let bonus = 0;
      if (p2.type !== 'both' && profile.preferredType !== 'both' && item.type !== p2.type) bonus -= 25;
      // Bonus si les deux ont une humeur compatible
      if (p2.moods.some(m => item.moods.includes(m)) && item.moods.some(m => m === Object.keys(profile.frequentMoods)[0])) bonus += 15;
      const scoreCouple = Math.max(0, (p1 + p2s) / 2 + bonus);
      return { ...item, score: scoreCouple, scoreP1: p1, scoreP2: p2s, scoreCouple };
    })
    .filter(i => i.scoreCouple > 0)
    .sort((a, b) => b.scoreCouple - a.scoreCouple)
    .slice(0, 5) as (ScoredRecommendation & { scoreP1: number; scoreP2: number; scoreCouple: number })[];
}

export function CoupleModeSetup({ profile, allItems, onDismiss }: Props) {
  const [step, setStep]       = useState<'setup' | 'results'>('setup');
  const [name, setName]       = useState('');
  const [moods, setMoods]     = useState<Mood[]>([]);
  const [duration, setDuration] = useState<Duration | null>(null);
  const [type, setType]       = useState<ContentType>('both');
  const [results, setResults] = useState<ReturnType<typeof getCoupleRecs>>([]);

  function toggleMood(m: Mood) {
    setMoods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  function handleGenerate() {
    const p2: CouplePrefs = { name: name || 'Personne 2', moods, duration, type };
    const recs = getCoupleRecs(allItems, profile, p2);
    setResults(recs);
    setStep('results');
  }

  return (
    <div className="couple-overlay" onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="couple-modal">
        <div className="couple-header">
          <h2 className="couple-title">💑 Mode couple</h2>
          <button className="couple-close" onClick={onDismiss}>✕</button>
        </div>

        {step === 'setup' && (
          <div className="couple-setup">
            <p className="couple-desc">
              Toi ({profile.pseudo}) + quelqu'un d'autre.<br />
              Renseigne les goûts de la 2ᵉ personne.
            </p>

            {/* Name */}
            <div className="couple-field">
              <label className="couple-label">Prénom de la 2ᵉ personne</label>
              <input
                className="couple-input"
                type="text"
                placeholder="Ex : Léa"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={20}
              />
            </div>

            {/* Type */}
            <div className="couple-field">
              <label className="couple-label">Film, série ou peu importe ?</label>
              <div className="couple-options-row">
                {(['movie', 'series', 'both'] as ContentType[]).map(t => (
                  <button
                    key={t}
                    className={`couple-opt ${type === t ? 'couple-opt-active' : ''}`}
                    onClick={() => setType(t)}
                  >
                    {t === 'movie' ? '🎬 Film' : t === 'series' ? '📺 Série' : '🎲 Peu importe'}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="couple-field">
              <label className="couple-label">Durée disponible</label>
              <div className="couple-options-row">
                {DURATION_OPTIONS.map(d => (
                  <button
                    key={d.value}
                    className={`couple-opt ${duration === d.value ? 'couple-opt-active' : ''}`}
                    onClick={() => setDuration(d.value)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Moods */}
            <div className="couple-field">
              <label className="couple-label">Humeurs aimées (plusieurs OK)</label>
              <div className="couple-moods-grid">
                {MOOD_OPTIONS.map(m => (
                  <button
                    key={m.value}
                    className={`couple-mood-btn ${moods.includes(m.value) ? 'couple-mood-active' : ''}`}
                    onClick={() => toggleMood(m.value)}
                  >
                    <span className="couple-mood-emoji">{m.emoji}</span>
                    <span className="couple-mood-label">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              className="couple-btn-generate"
              onClick={handleGenerate}
              disabled={moods.length === 0}
            >
              🔍 Trouver le meilleur compromis
            </button>
            {moods.length === 0 && (
              <p className="couple-hint">Sélectionne au moins une humeur pour continuer</p>
            )}
          </div>
        )}

        {step === 'results' && (
          <div className="couple-results">
            <div className="couple-results-header">
              <p className="couple-results-sub">
                Meilleur compromis pour {profile.pseudo} & {name || 'vous deux'}
              </p>
              <button className="couple-back-btn" onClick={() => setStep('setup')}>← Modifier</button>
            </div>

            {results.length === 0 ? (
              <p className="couple-empty">Aucun film ne correspond parfaitement — essaie d'ajuster les goûts.</p>
            ) : results.map((item, idx) => (
              <div key={item.id} className={`couple-card ${idx === 0 ? 'couple-card-top' : ''}`}>
                <div className="couple-card-poster" style={{ background: item.posterColor }}>
                  {item.posterUrl
                    ? <img src={item.posterUrl} className="couple-poster-img" alt="" />
                    : <span className="couple-poster-emoji">{item.posterEmoji}</span>
                  }
                  {idx === 0 && <div className="couple-badge-top">🏆 Meilleur choix</div>}
                </div>
                <div className="couple-card-info">
                  <h3 className="couple-card-title">{item.title}</h3>
                  <p className="couple-card-meta">
                    {item.type === 'movie' ? '🎬 Film' : '📺 Série'}
                    {item.duration ? ` · ${item.duration} min` : ''}
                  </p>
                  <div className="couple-scores">
                    <span className="couple-score">
                      {profile.pseudo}: <strong>{Math.max(0, Math.round(item.scoreP1))}%</strong>
                    </span>
                    <span className="couple-score">
                      {name || 'Eux'}: <strong>{Math.round(item.scoreP2)}%</strong>
                    </span>
                    <span className="couple-score couple-score-total">
                      Couple: <strong>{Math.round(item.scoreCouple)}%</strong>
                    </span>
                  </div>
                  <p className="couple-reason">✨ {item.shortReason}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
