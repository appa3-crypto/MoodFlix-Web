import type { Mood } from '../types';

interface MoodOption {
  value: Mood;
  label: string;
  emoji: string;
  description: string;
  bgKey: string;
  imageSrc: string;
}

const MOODS: MoodOption[] = [
  {
    value: 'laugh',
    label: 'Rire',
    emoji: '😊',
    description: 'Comédie, légèreté,\nbonne humeur',
    bgKey: 'laugh',
    imageSrc: '/moods/rire.jpg',
  },
  {
    value: 'scared',
    label: 'Frissonner',
    emoji: '👻',
    description: 'Horreur, suspense,\nmontée d\'adrénaline',
    bgKey: 'scared',
    imageSrc: '/moods/frissonner.jpg',
  },
  {
    value: 'moved',
    label: 'Être émus',
    emoji: '❤️',
    description: 'Émotion, drama,\nhistoires touchantes',
    bgKey: 'moved',
    imageSrc: '/moods/emu.jpg',
  },
  {
    value: 'escape',
    label: "M'évader",
    emoji: '🧭',
    description: 'Aventure, voyage,\nautre monde',
    bgKey: 'escape',
    imageSrc: '/moods/evader.jpg',
  },
  {
    value: 'mind-bending',
    label: 'Me retourner le cerveau',
    emoji: '🧠',
    description: 'Twists, énigmes,\nunivers complexes',
    bgKey: 'mindbending',
    imageSrc: '/moods/cerveau.jpg',
  },
  {
    value: 'surprised',
    label: 'Surprends-moi',
    emoji: '✨',
    description: 'Inattendu, original,\nje me laisse guider',
    bgKey: 'surprised',
    imageSrc: '/moods/surprends.jpg',
  },
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
            className={`mood-card mood-bg-${mood.bgKey}${selected === mood.value ? ' mood-card-selected' : ''}`}
            onClick={() => onSelect(mood.value)}
            aria-pressed={selected === mood.value}
          >
            {/* Real photo — fallback to CSS gradient if missing */}
            <img
              src={mood.imageSrc}
              alt=""
              className="mood-card-img"
              draggable={false}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />

            {/* Text content */}
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
