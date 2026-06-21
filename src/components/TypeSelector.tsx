import type { ContentType } from '../types';

interface TypeOption {
  value: ContentType;
  label: string;
  emoji: string;
  description: string;
}

const TYPES: TypeOption[] = [
  { value: 'movie', label: 'Film', emoji: '🎬', description: 'Terminé en une soirée' },
  { value: 'series', label: 'Série', emoji: '📺', description: 'Pour s\'installer sur la durée' },
  { value: 'both', label: 'Peu importe', emoji: '🎯', description: 'Surprise-moi' },
];

interface Props {
  selected: ContentType | null;
  onSelect: (type: ContentType) => void;
}

export function TypeSelector({ selected, onSelect }: Props) {
  return (
    <div className="step-container">
      <div className="step-header">
        <h2 className="step-question">Tu veux regarder quoi ?</h2>
        <p className="step-subtitle">Film ou série ce soir ?</p>
      </div>
      <div className="type-grid">
        {TYPES.map((t) => (
          <button
            key={t.value}
            className={`type-btn ${selected === t.value ? 'selected' : ''}`}
            onClick={() => onSelect(t.value)}
          >
            <span className="type-emoji">{t.emoji}</span>
            <span className="type-label">{t.label}</span>
            <span className="type-desc">{t.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
