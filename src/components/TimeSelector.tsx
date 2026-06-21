import type { Duration } from '../types';

interface TimeOption {
  value: Duration;
  label: string;
  emoji: string;
  description: string;
}

const DURATIONS: TimeOption[] = [
  { value: 'under-90', label: 'Moins de 1h30', emoji: '⚡', description: 'Rapide, compact, efficace' },
  { value: 'two-hours', label: 'Environ 2h', emoji: '🕑', description: 'Un film classique' },
  { value: 'evening', label: 'Toute la soirée', emoji: '🌙', description: '2-3 épisodes ou long métrage' },
  { value: 'several-days', label: 'Plusieurs jours', emoji: '📅', description: 'Je veux me perdre dans une série' },
];

interface Props {
  selected: Duration | null;
  onSelect: (duration: Duration) => void;
}

export function TimeSelector({ selected, onSelect }: Props) {
  return (
    <div className="step-container">
      <div className="step-header">
        <h2 className="step-question">Tu as combien de temps ?</h2>
        <p className="step-subtitle">On va trouver quelque chose qui correspond</p>
      </div>
      <div className="time-grid">
        {DURATIONS.map((d) => (
          <button
            key={d.value}
            className={`time-btn ${selected === d.value ? 'selected' : ''}`}
            onClick={() => onSelect(d.value)}
          >
            <span className="time-emoji">{d.emoji}</span>
            <span className="time-label">{d.label}</span>
            <span className="time-desc">{d.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
