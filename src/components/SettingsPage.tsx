import { useState } from 'react';
import type { UserProfile, AppSettings, NotificationPrefs, Platform, AnimationPref } from '../types';

interface Props {
  profile:          UserProfile;
  onUpdateSettings: (s: AppSettings) => void;
  onUpdatePrefs:    (platforms: Platform[]) => void;
  onUpdatePseudo:   (pseudo: string) => void;
  onReset:          () => void;
  onGoToPremium:    () => void;
  onBack:           () => void;
}

const APP_VERSION = '1.0.0-beta';

const ALL_PLATFORMS: { id: Platform; label: string; emoji: string }[] = [
  { id: 'Netflix',     label: 'Netflix',      emoji: '🔴' },
  { id: 'Prime Video', label: 'Prime Video',  emoji: '🟦' },
  { id: 'Disney+',     label: 'Disney+',      emoji: '🔵' },
  { id: 'Canal+',      label: 'Canal+',       emoji: '⚫' },
  { id: 'Apple TV+',   label: 'Apple TV+',    emoji: '⬜' },
  { id: 'Max',         label: 'Max',          emoji: '🟣' },
  { id: 'Paramount+',  label: 'Paramount+',   emoji: '🌟' },
  { id: 'Crunchyroll', label: 'Crunchyroll',  emoji: '🟠' },
];

const FAQ_SUPPORT = [
  {
    q: 'Les recommandations ne semblent pas correspondre à mes goûts.',
    a: 'Calibre tes goûts depuis la page Profil — plus tu notes de films, meilleures sont les suggestions.',
  },
  {
    q: 'Comment fonctionne le score de compatibilité ?',
    a: 'Il est calculé à partir de tes humeurs, préférences de type/durée et historique de visionnage.',
  },
  {
    q: 'Mes données sont-elles partagées ?',
    a: 'Non. Toutes tes données restent sur ton appareil (localStorage). Aucune donnée n\'est envoyée à des serveurs.',
  },
  {
    q: 'Comment supprimer mes données ?',
    a: 'Utilise le bouton "Réinitialiser mon profil" dans les Paramètres — Compte.',
  },
];

export function SettingsPage({ profile, onUpdateSettings, onUpdatePrefs, onUpdatePseudo, onReset, onGoToPremium, onBack }: Props) {
  const settings = profile.settings!;
  const notifs   = settings.notifications;

  const [platforms, setPlatforms] = useState<Platform[]>(profile.preferredPlatforms);
  const [platformSaved, setPlatformSaved] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [pseudoDraft, setPseudoDraft] = useState(profile.pseudo);
  const [editingPseudo, setEditingPseudo] = useState(false);

  function toggleNotif(key: keyof NotificationPrefs) {
    const updated: AppSettings = {
      ...settings,
      notifications: { ...notifs, [key]: !notifs[key] },
    };
    onUpdateSettings(updated);
  }

  function togglePlatform(p: Platform) {
    setPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
    setPlatformSaved(false);
  }

  function savePlatforms() {
    onUpdatePrefs(platforms);
    setPlatformSaved(true);
    setTimeout(() => setPlatformSaved(false), 2000);
  }

  function savePseudo() {
    const trimmed = pseudoDraft.trim();
    if (trimmed) onUpdatePseudo(trimmed);
    setEditingPseudo(false);
  }

  function handleReset() {
    if (window.confirm('Réinitialiser ton profil ? Tout ton historique sera perdu.')) onReset();
  }

  return (
    <div className="page-container page-scroll settings-page">
      <div className="settings-header">
        <button className="settings-back" onClick={onBack} aria-label="Retour">←</button>
        <h1 className="settings-title">Paramètres</h1>
      </div>

      {/* ── COMPTE ── */}
      <div className="settings-section">
        <h2 className="settings-section-title">Compte</h2>

        <div className="settings-row">
          <div className="settings-row-info">
            <p className="settings-row-label">Pseudo</p>
            <p className="settings-row-value">{profile.pseudo}</p>
          </div>
          <button className="settings-row-action" onClick={() => { setPseudoDraft(profile.pseudo); setEditingPseudo(true); }}>
            Modifier
          </button>
        </div>

        {editingPseudo && (
          <div className="settings-inline-edit">
            <input
              className="settings-input"
              value={pseudoDraft}
              onChange={e => setPseudoDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') savePseudo(); if (e.key === 'Escape') setEditingPseudo(false); }}
              maxLength={20}
              autoFocus
            />
            <button className="settings-save-btn" onClick={savePseudo}>Sauvegarder</button>
          </div>
        )}

        <div className="settings-row">
          <div className="settings-row-info">
            <p className="settings-row-label">Statut</p>
            <p className="settings-row-value">Gratuit</p>
          </div>
          <button className="settings-row-action settings-row-action-accent" onClick={onGoToPremium}>
            Passer Premium
          </button>
        </div>

        <div className="settings-row settings-row-danger" onClick={handleReset}>
          <p className="settings-row-label settings-row-label-danger">Réinitialiser le profil</p>
          <span className="settings-row-arrow">›</span>
        </div>
      </div>

      {/* ── NOTIFICATIONS ── */}
      <div className="settings-section">
        <h2 className="settings-section-title">Notifications</h2>
        <p className="settings-section-desc">Gère les alertes que MoodFlix peut t'envoyer.</p>

        {([
          { key: 'watchReminder'    as const, label: 'Rappel après visionnage',    desc: 'Un rappel pour noter ce que tu as regardé.' },
          { key: 'dailySuggestions' as const, label: 'Suggestions quotidiennes',   desc: 'Une recommandation personnalisée chaque jour.' },
          { key: 'newFeatures'      as const, label: 'Nouveautés MoodFlix',        desc: 'Quand de nouvelles fonctionnalités arrivent.' },
          { key: 'personalTips'     as const, label: 'Conseils personnalisés',     desc: 'Des tips basés sur ton profil spectateur.' },
        ] as { key: keyof NotificationPrefs; label: string; desc: string }[]).map(({ key, label, desc }) => (
          <div key={key} className="settings-row settings-row-toggle">
            <div className="settings-row-info">
              <p className="settings-row-label">{label}</p>
              <p className="settings-row-desc">{desc}</p>
            </div>
            <button
              className={`settings-toggle ${notifs[key] ? 'settings-toggle-on' : ''}`}
              onClick={() => toggleNotif(key)}
              role="switch"
              aria-checked={notifs[key]}
              aria-label={label}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        ))}
      </div>

      {/* ── PLATEFORMES ── */}
      <div className="settings-section">
        <h2 className="settings-section-title">Plateformes de streaming</h2>
        <p className="settings-section-desc">
          Sélectionne tes abonnements actifs — les recommandations les prioriseront.
        </p>
        <div className="settings-platforms-grid">
          {ALL_PLATFORMS.map(p => (
            <button
              key={p.id}
              className={`settings-platform-btn ${platforms.includes(p.id) ? 'active' : ''}`}
              onClick={() => togglePlatform(p.id)}
            >
              <span>{p.emoji}</span>
              <span>{p.label}</span>
              {platforms.includes(p.id) && <span className="settings-platform-check">✓</span>}
            </button>
          ))}
        </div>
        <button
          className="btn-save-settings"
          onClick={savePlatforms}
          disabled={platforms.length === 0}
        >
          {platformSaved ? '✓ Enregistré !' : 'Enregistrer mes plateformes'}
        </button>
      </div>

      {/* ── PRÉFÉRENCES DE CONTENU ── */}
      <div className="settings-section">
        <h2 className="settings-section-title">Préférences de contenu</h2>
        <p className="settings-section-desc">
          Ajuste les types de contenu proposés dans les recommandations.
        </p>

        <div className="settings-row settings-row-stack">
          <div className="settings-row-info">
            <p className="settings-row-label">Animation &amp; Famille</p>
            <p className="settings-row-desc">
              Quelle place donner aux films d'animation et contenus familiaux dans tes recommandations ?
            </p>
          </div>
          <div className="settings-anim-options">
            {([
              { value: 'love',      label: 'J\'adore',     desc: 'Inclure librement' },
              { value: 'sometimes', label: 'Parfois',      desc: 'Max 1 sur 5' },
              { value: 'rarely',    label: 'Rarement',     desc: 'Pénalisé' },
              { value: 'never',     label: 'Jamais',       desc: 'Exclu' },
            ] as { value: AnimationPref; label: string; desc: string }[]).map(opt => (
              <button
                key={opt.value}
                className={`settings-anim-btn ${settings.animationPref === opt.value ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ ...settings, animationPref: opt.value })}
                aria-pressed={settings.animationPref === opt.value}
              >
                <span className="settings-anim-label">{opt.label}</span>
                <span className="settings-anim-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── SUPPORT ── */}
      <div className="settings-section">
        <h2 className="settings-section-title">Support &amp; aide</h2>

        <div className="support-faq">
          {FAQ_SUPPORT.map((item, i) => (
            <div key={i} className="faq-item">
              <button
                className="faq-question"
                onClick={() => setOpenFaq(p => p === i ? null : i)}
                aria-expanded={openFaq === i}
              >
                <span>{item.q}</span>
                <span className="faq-arrow">{openFaq === i ? '▲' : '▼'}</span>
              </button>
              {openFaq === i && <p className="faq-answer">{item.a}</p>}
            </div>
          ))}
        </div>

        <div className="settings-row" onClick={() => window.open('mailto:appa3@live.fr?subject=MoodFlix%20Bug')}>
          <p className="settings-row-label">Signaler un bug</p>
          <span className="settings-row-arrow">›</span>
        </div>
        <div className="settings-row" onClick={() => window.open('mailto:appa3@live.fr?subject=MoodFlix%20Feedback')}>
          <p className="settings-row-label">Contacter l'équipe</p>
          <span className="settings-row-arrow">›</span>
        </div>
      </div>

      {/* ── À PROPOS ── */}
      <div className="settings-section">
        <h2 className="settings-section-title">À propos</h2>

        <div className="about-block">
          <p className="about-title">🎬 MoodFlix</p>
          <p className="about-text">
            MoodFlix résout un problème universel : impossible de choisir quoi regarder.
            En quelques questions sur ton humeur du moment, l'application sélectionne les
            contenus qui te correspondent vraiment — films ou séries, peu importe la plateforme.
          </p>
          <p className="about-text">
            Tes données restent sur ton appareil. Aucun compte, aucune pub.
          </p>
          <div className="about-version">
            <span>Version</span>
            <span className="about-version-num">{APP_VERSION}</span>
          </div>
        </div>

        <div className="settings-row">
          <p className="settings-row-label">Exporter mes données</p>
          <button
            className="settings-row-action"
            onClick={() => {
              const data = JSON.stringify(profile, null, 2);
              const blob = new Blob([data], { type: 'application/json' });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement('a');
              a.href     = url;
              a.download = 'moodflix_data.json';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Télécharger
          </button>
        </div>
      </div>
    </div>
  );
}
