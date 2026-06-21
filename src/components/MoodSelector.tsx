import type { Mood } from '../types';

interface MoodOption {
  value: Mood;
  label: string;
  emoji: string;
  description: string;
  bgKey: string;
}

// Order matches the reference design: 3×2 grid
const MOODS: MoodOption[] = [
  { value: 'laugh',        label: 'Rire',                  emoji: '😊', description: 'Comédie, légèreté,\nbonne humeur',                    bgKey: 'laugh'       },
  { value: 'scared',       label: 'Frissonner',             emoji: '👻', description: 'Horreur, suspense,\nmontée d\'adrénaline',             bgKey: 'scared'      },
  { value: 'moved',        label: 'Être émus',              emoji: '❤️', description: 'Émotion, drama,\nhistoires touchantes',                bgKey: 'moved'       },
  { value: 'escape',       label: "M'évader",               emoji: '🧭', description: 'Aventure, voyage,\nautre monde',                       bgKey: 'escape'      },
  { value: 'mind-bending', label: 'Me retourner le cerveau',emoji: '🧠', description: 'Twists, énigmes,\nunivers complexes',                  bgKey: 'mindbending' },
  { value: 'surprised',    label: 'Surprends-moi',          emoji: '✨', description: 'Inattendu, original,\nje me laisse guider',             bgKey: 'surprised'   },
];

interface Props {
  selected: Mood | null;
  onSelect: (mood: Mood) => void;
}

export function MoodSelector({ selected, onSelect }: Props) {
  return (
    <div className="mood-screen">
      <div className="mood-screen-header">
        <h2 className="mood-screen-title">
          Qu'est-ce que tu veux <span className="mood-title-accent">ressentir</span> ce soir ?
        </h2>
        <p className="mood-screen-sub">Choisis l'ambiance qui te correspond</p>
      </div>

      <div className="mood-card-grid">
        {MOODS.map(mood => (
          <button
            key={mood.value}
            className={`mood-card mood-bg-${mood.bgKey} ${selected === mood.value ? 'mood-card-selected' : ''}`}
            onClick={() => onSelect(mood.value)}
            aria-pressed={selected === mood.value}
          >
            <div className="mood-card-content">
              <span className={`mood-card-badge mood-badge-${mood.bgKey}`}>
                {mood.emoji}
              </span>
              <span className="mood-card-label">{mood.label}</span>
              <span className="mood-card-desc">{mood.description}</span>
            </div>
          </button>
        ))}
      </div>

      <p className="mood-screen-hint">
        ✦ MoodFlix va te proposer 3 recommandations qui correspondent parfaitement à ton humeur.
      </p>
    </div>
  );
}
