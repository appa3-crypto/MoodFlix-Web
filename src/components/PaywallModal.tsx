interface Props {
  feature:    string;
  onClose:    () => void;
  onActivate: () => void;
}

const PERKS = [
  { icon: '🎬', text: 'Recommandations illimitées chaque jour' },
  { icon: '🎲', text: '« Choisis pour moi » illimité' },
  { icon: '💑', text: 'Mode couple' },
  { icon: '📊', text: 'Historique & statistiques complets' },
  { icon: '🚀', text: 'Nouveautés TMDB en priorité' },
];

export function PaywallModal({ feature, onClose, onActivate }: Props) {
  return (
    <div className="paywall-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="paywall-modal">
        <button className="paywall-close" onClick={onClose} aria-label="Fermer">✕</button>

        <div className="paywall-crown">👑</div>
        <h2 className="paywall-title">Arrête de perdre du temps à chercher.</h2>

        {feature && (
          <p className="paywall-blocked">
            <strong>{feature}</strong> est réservé aux membres Premium.
          </p>
        )}

        <ul className="paywall-list">
          {PERKS.map(p => (
            <li key={p.text} className="paywall-item">
              <span className="paywall-icon">{p.icon}</span>
              <span>{p.text}</span>
            </li>
          ))}
        </ul>

        <div className="paywall-price-block">
          <div className="paywall-trial-badge">7 jours gratuits</div>
          <div className="paywall-price-row">
            <span className="paywall-amount">2,99 €</span>
            <span className="paywall-period"> / mois ensuite</span>
          </div>
          <p className="paywall-reassurance">Annulable à tout moment · Sans engagement</p>
        </div>

        <button className="paywall-btn-primary" onClick={onActivate}>
          Essayer gratuitement — 7 jours
        </button>
        <button className="paywall-btn-later" onClick={onClose}>
          Pas maintenant
        </button>
      </div>
    </div>
  );
}
