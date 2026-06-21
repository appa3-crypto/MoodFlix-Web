import { useState } from 'react';
import type { Platform } from '../types';

interface Props {
  onComplete: (pseudo: string, platforms: Platform[]) => void;
}

const PLATFORMS: { id: Platform; color: string; initial: string }[] = [
  { id: 'Netflix', color: '#E50914', initial: 'N' },
  { id: 'Prime Video', color: '#00A8E1', initial: 'P' },
  { id: 'Disney+', color: '#113CCF', initial: 'D+' },
  { id: 'Canal+', color: '#888', initial: 'C+' },
];

export function ProfileSetup({ onComplete }: Props) {
  const [pseudo, setPseudo] = useState('');
  const [selected, setSelected] = useState<Platform[]>([]);
  const [step, setStep] = useState<'pseudo' | 'platforms'>('pseudo');

  function toggle(p: Platform) {
    setSelected(s => s.includes(p) ? s.filter(x => x !== p) : [...s, p]);
  }

  if (step === 'pseudo') {
    return (
      <div className="setup-screen">
        <div className="setup-glow" />
        <div className="setup-content">
          <div className="setup-logo">MoodFlix</div>
          <div className="setup-badge">Première visite</div>
          <h1 className="setup-headline">Bienvenue !</h1>
          <p className="setup-sub">
            Crée ton profil local pour que MoodFlix apprenne de tes goûts.
            <br />
            <strong>Aucun compte. Aucune donnée envoyée.</strong>
          </p>
          <div className="setup-field">
            <label className="setup-label">Comment tu veux qu'on t'appelle ?</label>
            <input
              className="setup-input"
              type="text"
              placeholder="Ton pseudo..."
              value={pseudo}
              onChange={e => setPseudo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && pseudo.trim() && setStep('platforms')}
              maxLength={30}
              autoFocus
            />
          </div>
          <button
            className="btn-start"
            disabled={!pseudo.trim()}
            onClick={() => setStep('platforms')}
          >
            Continuer →
          </button>
          <p className="setup-disclaimer">Tout reste en local sur ton appareil</p>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-screen">
      <div className="setup-glow" />
      <div className="setup-content">
        <button className="setup-back" onClick={() => setStep('pseudo')}>← Retour</button>
        <h2 className="setup-step-title">Tes plateformes</h2>
        <p className="setup-sub">Sélectionne celles auxquelles tu as accès.</p>
        <div className="setup-platforms">
          {PLATFORMS.map(({ id, color, initial }) => (
            <button
              key={id}
              className={`setup-platform-btn ${selected.includes(id) ? 'active' : ''}`}
              style={selected.includes(id) ? {
                borderColor: color,
                boxShadow: `0 0 20px ${color}35`,
              } : {}}
              onClick={() => toggle(id)}
            >
              <span
                className="setup-platform-logo"
                style={{ background: color }}
              >
                {initial}
              </span>
              <span className="setup-platform-name">{id}</span>
              {selected.includes(id) && <span className="setup-platform-check">✓</span>}
            </button>
          ))}
        </div>
        {selected.length === 0 && (
          <p className="setup-hint">Sélectionne au moins une plateforme</p>
        )}
        <button
          className="btn-start"
          disabled={selected.length === 0}
          onClick={() => onComplete(pseudo.trim(), selected)}
        >
          C'est parti ! ✨
        </button>
      </div>
    </div>
  );
}
