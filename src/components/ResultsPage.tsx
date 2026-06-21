import type { ScoredRecommendation, UserChoices, UserProfile, SatisfactionRating } from '../types';
import { RecommendationCard } from './RecommendationCard';

interface Props {
  results: ScoredRecommendation[];
  choices: UserChoices;
  profile: UserProfile | null;
  isQuickMode: boolean;
  onRestart: () => void;
  onAction: (itemId: number, action: 'like' | 'seen' | 'dislike' | 'too-long') => void;
  onUndo: (itemId: number) => void;
  onSatisfaction: (itemId: number, rating: SatisfactionRating, reasons: string[]) => void;
  onSuggestOther: () => void;
}

const MOOD_LABELS: Record<string, string> = {
  'mind-bending': '🌀 Retourner le cerveau',
  scared: '😱 Frissonner',
  laugh: '😂 Rire',
  moved: '🥺 S\'émouvoir',
  escape: '✈️ S\'évader',
  surprised: '🎲 Être surpris',
};

export function ResultsPage({
  results,
  choices,
  profile,
  isQuickMode,
  onRestart,
  onAction,
  onUndo,
  onSatisfaction,
  onSuggestOther,
}: Props) {
  const moodLabel = choices.mood ? MOOD_LABELS[choices.mood] : null;
  const name = profile?.pseudo ?? null;
  const hasResults = results.length > 0;

  return (
    <div className="results-page">
      <div className="results-header">
        <div className="results-logo">MoodFlix</div>

        {isQuickMode ? (
          <p className="results-quick-badge">🎲 Mode &quot;Je sais pas&quot;</p>
        ) : moodLabel ? (
          <div className="results-context">
            <span className="results-mood-badge">{moodLabel}</span>
          </div>
        ) : null}

        <h2 className="results-title">
          {hasResults ? (
            <>
              {name ? `Pour toi, ${name} — ` : 'Ce soir, '}
              <span className="results-accent">
                {results.length} recommandation{results.length > 1 ? 's' : ''} ciblée{results.length > 1 ? 's' : ''}.
              </span>
            </>
          ) : (
            'Hmm, plus de suggestions disponibles…'
          )}
        </h2>

        {!hasResults && (
          <p className="results-empty">
            Tu as vu ou refusé tous les contenus correspondants. Reviens après avoir regardé quelques suggestions !
          </p>
        )}
      </div>

      {hasResults && (
        <div className="results-cards">
          {results.map((item, i) => (
            <RecommendationCard
              key={item.id}
              item={item}
              rank={i + 1}
              profile={profile}
              onAction={onAction}
              onUndo={onUndo}
              onSatisfaction={onSatisfaction}
            />
          ))}
        </div>
      )}

      <div className="results-footer">
        {hasResults && (
          <button className="btn-suggest-other" onClick={onSuggestOther}>
            🔀 Me proposer autre chose
          </button>
        )}
        <button className="btn-restart" onClick={onRestart}>
          🔄 Nouvelle recherche
        </button>
        <p className="results-footer-text">
          {profile
            ? 'Recommandations personnalisées · variété automatique'
            : 'Recommandations basées sur tes choix du moment.'}
          <br />
          <span className="results-footer-sub">MoodFlix V2 — Données locales</span>
        </p>
      </div>
    </div>
  );
}
