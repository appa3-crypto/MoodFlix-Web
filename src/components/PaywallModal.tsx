interface Props {
  feature:    string;
  onClose:    () => void;
  onActivate: () => void;
}

const FEATURES = [
  '"Choisis pour moi" illimité',
  'Relances illimitées',
  'Mode couple',
  'Statistiques avancées',
  'Historique complet',
];

export function PaywallModal({ feature, onClose, onActivate }: Props) {
  return (
    <div className="paywall-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="paywall-modal">
        <button className="paywall-close" onClick={onClose} aria-label="Fermer">✕</button>

        <div className="paywall-crown">👑</div>
        <h2 className="paywall-title">MoodFlix Premium</h2>
        <p className="paywall-blocked">Fonctionnalité verrouillée :<br /><strong>{feature}</strong></p>

        <ul className="paywall-list">
          {FEATURES.map(f => (
            <li key={f} className="paywall-item">
              <span className="paywall-check">✅</span>
              {f}
            </li>
          ))}
        </ul>

        <div className="paywall-price-block">
          <span className="paywall-amount">2,99 €</span>
          <span className="paywall-period"> / mois</span>
        </div>

        <button className="paywall-btn-primary" onClick={onActivate}>
          👑 Débloquer Premium
        </button>
        <button className="paywall-btn-later" onClick={onClose}>
          Plus tard
        </button>
      </div>
    </div>
  );
}
