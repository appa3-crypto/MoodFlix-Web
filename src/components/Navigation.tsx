import type { Step } from '../types';

interface Props {
  currentStep: Step;
  pseudo: string;
  onNavigate: (step: Step) => void;
}

const DISCOVER_STEPS: Step[] = ['mood', 'type', 'duration', 'platform', 'references', 'results', 'quick-type', 'quick-vibe'];

export function Navigation({ currentStep, pseudo, onNavigate }: Props) {
  const isDiscover = DISCOVER_STEPS.includes(currentStep) || currentStep === 'home';
  const isHistory = currentStep === 'history';
  const isProfile = currentStep === 'profile';

  return (
    <nav className="bottom-nav">
      <button
        className={`bottom-nav-btn ${isDiscover ? 'active' : ''}`}
        onClick={() => onNavigate('mood')}
      >
        <span className="nav-icon">🎬</span>
        <span className="nav-label">Découvrir</span>
      </button>
      <button
        className={`bottom-nav-btn ${isHistory ? 'active' : ''}`}
        onClick={() => onNavigate('history')}
      >
        <span className="nav-icon">🕐</span>
        <span className="nav-label">Historique</span>
      </button>
      <button
        className={`bottom-nav-btn ${isProfile ? 'active' : ''}`}
        onClick={() => onNavigate('profile')}
      >
        <span className="nav-icon">👤</span>
        <span className="nav-label">{pseudo ? pseudo.slice(0, 10) : 'Profil'}</span>
      </button>
    </nav>
  );
}
