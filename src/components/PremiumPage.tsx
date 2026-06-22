import { useState } from 'react';
import { track } from '../utils/analytics';

interface Props {
  isPremium:         boolean;
  onActivate:        () => void;
  onClose:           () => void;
}

const FEATURES = [
  { emoji: '♾️', title: 'Recommandations illimitées',  desc: 'Plus de limite quotidienne — cherche autant que tu veux.' },
  { emoji: '🎲', title: '"Choisis pour moi" illimité', desc: 'Laisse MoodFlix décider pour toi, sans restriction.' },
  { emoji: '💑', title: 'Mode couple',                 desc: 'Trouvez un film qui convient à vous deux en 30 secondes.' },
  { emoji: '📊', title: 'Statistiques avancées',       desc: 'Tes tendances, genres préférés, évolution dans le temps.' },
  { emoji: '🧠', title: 'Analyse de profil IA',        desc: 'Insights personnalisés sur ton profil spectateur.' },
  { emoji: '🎯', title: 'Calibration avancée',         desc: 'Recalibration intelligente avec de nouveaux films.' },
  { emoji: '🚀', title: 'Accès anticipé',              desc: 'Tu es le premier à tester les nouvelles fonctionnalités.' },
];

const FAQ = [
  {
    q: 'Pourquoi devenir Premium ?',
    a: 'La version gratuite est limitée à 3 recommandations par jour. Premium supprime toutes ces limites et débloque des fonctionnalités exclusives comme le Mode Couple et l\'analyse IA.',
  },
  {
    q: 'Puis-je annuler à tout moment ?',
    a: 'Oui, tu peux annuler quand tu veux. Ton accès Premium reste actif jusqu\'à la fin de la période payée.',
  },
  {
    q: 'Mes données sont-elles conservées si j\'annule ?',
    a: 'Absolument. Ton historique, tes notes et ton profil restent intacts même après l\'annulation.',
  },
  {
    q: 'Que débloque vraiment Premium ?',
    a: 'Recommandations illimitées, "Choisis pour moi" illimité, Mode Couple, statistiques avancées, analyse IA de profil et accès anticipé aux nouveautés.',
  },
];

export function PremiumPage({ isPremium, onActivate, onClose }: Props) {
  const [plan,    setPlan]    = useState<'monthly' | 'annual'>('annual');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function handleActivate() {
    track('premium_clicked', { plan });
    onActivate();
  }

  if (isPremium) {
    return (
      <div className="page-container page-scroll premium-page">
        <div className="premium-active-hero">
          <span className="premium-active-crown">👑</span>
          <h1 className="premium-active-title">Tu es Premium !</h1>
          <p className="premium-active-sub">Toutes les fonctionnalités sont débloquées pour toi.</p>
        </div>
        <div className="premium-features-list">
          {FEATURES.map((f, i) => (
            <div key={i} className="premium-feature-row">
              <span className="pf-emoji">{f.emoji}</span>
              <div>
                <p className="pf-title">{f.title}</p>
                <p className="pf-desc">{f.desc}</p>
              </div>
              <span className="pf-check">✓</span>
            </div>
          ))}
        </div>
        <button className="btn-premium-close" onClick={onClose}>← Retour</button>
      </div>
    );
  }

  return (
    <div className="page-container page-scroll premium-page">

      {/* Hero */}
      <div className="premium-hero">
        <div className="premium-hero-glow" />
        <span className="premium-hero-crown">👑</span>
        <h1 className="premium-hero-title">MoodFlix Premium</h1>
        <p className="premium-hero-sub">Trouve plus rapidement quoi regarder.</p>
      </div>

      {/* Plan selector */}
      <div className="premium-plan-selector">
        <button
          className={`plan-btn ${plan === 'annual' ? 'plan-active' : ''}`}
          onClick={() => setPlan('annual')}
        >
          <div className="plan-badge">Populaire</div>
          <p className="plan-name">Annuel</p>
          <p className="plan-price">24,99€ <span className="plan-period">/ an</span></p>
          <p className="plan-saving">Économise 30 %</p>
        </button>
        <button
          className={`plan-btn ${plan === 'monthly' ? 'plan-active' : ''}`}
          onClick={() => setPlan('monthly')}
        >
          <p className="plan-name">Mensuel</p>
          <p className="plan-price">2,99€ <span className="plan-period">/ mois</span></p>
          <p className="plan-saving plan-saving-none">Flexible</p>
        </button>
      </div>

      {/* CTA */}
      <button className="btn-premium-cta" onClick={handleActivate}>
        Essayer gratuitement — 7 jours
      </button>
      <p className="premium-cta-sub">Annulable à tout moment · Sans engagement · 2,99€/mois ensuite</p>

      {/* Features list */}
      <div className="premium-features-list">
        {FEATURES.map((f, i) => (
          <div key={i} className="premium-feature-row">
            <span className="pf-emoji">{f.emoji}</span>
            <div>
              <p className="pf-title">{f.title}</p>
              <p className="pf-desc">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison table */}
      <div className="premium-comparison">
        <h2 className="comparison-title">Gratuit vs Premium</h2>
        <div className="comparison-table">
          <div className="comparison-header">
            <span />
            <span className="comparison-col-label">Gratuit</span>
            <span className="comparison-col-label premium-col">Premium</span>
          </div>
          {[
            ['Recommandations / jour', '3', '∞'],
            ['"Choisis pour moi"',     '1/j', '∞'],
            ['Mode couple',            '—',   '✓'],
            ['Analyse IA',             '—',   '✓'],
            ['Statistiques avancées',  '—',   '✓'],
            ['Calibration avancée',    '—',   '✓'],
            ['Accès anticipé',         '—',   '✓'],
          ].map(([feat, free, prem]) => (
            <div key={feat} className="comparison-row">
              <span className="comparison-feat">{feat}</span>
              <span className="comparison-free">{free}</span>
              <span className="comparison-premium">{prem}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="premium-faq">
        <h2 className="faq-title">Questions fréquentes</h2>
        {FAQ.map((item, i) => (
          <div key={i} className="faq-item">
            <button
              className="faq-question"
              onClick={() => setOpenFaq(p => p === i ? null : i)}
              aria-expanded={openFaq === i}
            >
              <span>{item.q}</span>
              <span className="faq-arrow">{openFaq === i ? '▲' : '▼'}</span>
            </button>
            {openFaq === i && (
              <p className="faq-answer">{item.a}</p>
            )}
          </div>
        ))}
      </div>

      {/* Second CTA */}
      <button className="btn-premium-cta btn-premium-cta-secondary" onClick={handleActivate}>
        Commencer mon essai gratuit
      </button>
      <button className="btn-premium-skip" onClick={onClose}>Continuer en gratuit</button>
    </div>
  );
}
