import type { Mood } from '../types';

interface MoodOption {
  value: Mood;
  label: string;
  emoji: string;
  description: string;
}

const MOODS: MoodOption[] = [
  { value: 'mind-bending', label: 'Me retourner le cerveau', emoji: '🌀', description: 'Mystère, twists, complexité' },
  { value: 'scared', label: 'Frissonner', emoji: '😱', description: 'Horreur, suspense, angoisse' },
  { value: 'laugh', label: 'Rire', emoji: '😂', description: 'Comédie, légèreté, fun' },
  { value: 'moved', label: 'Être ému', emoji: '🥺', description: 'Émotion, drama, humanité' },
  { value: 'escape', label: "M'évader", emoji: '✈️', description: 'Aventure, autre monde, voyage' },
  { value: 'surprised', label: 'Surprends-moi', emoji: '🎲', description: 'Inattendu, unique, ovni' },
];

interface Props {
  selected: Mood | null;
  onSelect: (mood: Mood) => void;
}

export function MoodSelector({ selected, onSelect }: Props) {
  return (
    <div className="step-container">
      <div className="step-header">
        <h2 className="step-question">Qu'est-ce que tu veux ressentir ce soir ?</h2>
        <p className="step-subtitle">Choisis l'ambiance qui te correspond</p>
      </div>
      <div className="mood-grid">
        {MOODS.map((mood) => (
          <button
            key={mood.value}
            className={`mood-btn ${selected === mood.value ? 'selected' : ''}`}
            onClick={() => onSelect(mood.value)}
          >
            <span className="mood-emoji">{mood.emoji}</span>
            <span className="mood-label">{mood.label}</span>
            <span className="mood-desc">{mood.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
