import { useState } from 'react';

interface Props {
  onComplete: () => void;
}

const SLIDES = [
  {
    emoji: '🍿',
    title: "MoodFlix t'évite de scroller pendant 30 minutes.",
    sub: "Plus de débats interminables sur « qu'est-ce qu'on regarde ? » Ce soir, tu décides en 30 secondes.",
  },
  {
    emoji: '🎭',
    title: 'Dis ton humeur. On fait le reste.',
    sub: 'Ton humeur, ton temps dispo, tes plateformes. Trois questions. L\'app s\'adapte à toi.',
  },
  {
    emoji: '🎯',
    title: '3 recommandations faites pour toi.',
    sub: 'Personnalisées selon tes goûts. Sur tes plateformes. Sans pub, sans inscription.',
  },
];

export function OnboardingScreen({ onComplete }: Props) {
  const [idx, setIdx] = useState(0);
  const isLast = idx === SLIDES.length - 1;
  const slide   = SLIDES[idx];

  return (
    <div className="onb-screen">
      <button className="onb-skip" onClick={onComplete}>Passer</button>

      <div className="onb-content">
        <div className="onb-emoji">{slide.emoji}</div>
        <h1 className="onb-title">{slide.title}</h1>
        <p className="onb-sub">{slide.sub}</p>
      </div>

      <div className="onb-footer">
        <div className="onb-dots">
          {SLIDES.map((_, i) => (
            <div key={i} className={`onb-dot ${i === idx ? 'onb-dot-active' : ''}`} />
          ))}
        </div>
        <button
          className="onb-btn"
          onClick={() => (isLast ? onComplete() : setIdx(i => i + 1))}
        >
          {isLast ? 'Commencer →' : 'Suivant →'}
        </button>
      </div>
    </div>
  );
}
