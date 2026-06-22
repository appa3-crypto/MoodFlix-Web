import type { Step } from '../types';

interface Props {
  currentStep: Step;
  pseudo:      string;
  isPremium:   boolean;
  onNavigate:  (step: Step) => void;
}

const DISCOVER_STEPS: Step[] = [
  'mood', 'type', 'duration', 'platform', 'references', 'results', 'quick-type', 'quick-vibe',
];

export function Navigation({ currentStep, pseudo, isPremium, onNavigate }: Props) {
  const isDiscover = DISCOVER_STEPS.includes(currentStep) || currentStep === 'home';
  const isHistory  = currentStep === 'history';
  const isPremiumTab = currentStep === 'premium';
  const isProfile  = currentStep === 'profile' || currentStep === 'settings';

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Navigation principale">
      <button
        className={`bottom-nav-btn ${isDiscover ? 'active' : ''}`}
        onClick={() => onNavigate('home')}
        aria-label="Découvrir"
      >
        <span className="nav-icon">🎬</span>
        <span className="nav-label">Découvrir</span>
      </button>

      <button
        className={`bottom-nav-btn ${isHistory ? 'active' : ''}`}
        onClick={() => onNavigate('history')}
        aria-label="Historique"
      >
        <span className="nav-icon">🕐</span>
        <span className="nav-label">Historique</span>
      </button>

      <button
        className={`bottom-nav-btn ${isPremiumTab ? 'active' : ''} ${isPremium ? 'nav-premium-active' : ''}`}
        onClick={() => onNavigate('premium')}
        aria-label={isPremium ? 'Premium actif' : 'Passer à Premium'}
      >
        <span className="nav-icon">👑</span>
        <span className="nav-label">{isPremium ? 'Premium' : 'Premium'}</span>
        {!isPremium && <span className="nav-badge" />}
      </button>

      <button
        className={`bottom-nav-btn ${isProfile ? 'active' : ''}`}
        onClick={() => onNavigate('profile')}
        aria-label="Profil"
      >
        <span className="nav-icon">👤</span>
        <span className="nav-label">{pseudo ? pseudo.slice(0, 8) : 'Profil'}</span>
      </button>
    </nav>
  );
}
