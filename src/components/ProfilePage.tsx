import { useState } from 'react';
import type { UserProfile, ContentType, Duration, Platform } from '../types';
import { detectSpectatorProfile, hasEnoughData, getInfluentialItems } from '../utils/spectatorProfile';

interface Props {
  profile: UserProfile;
  onReset: () => void;
  onUpdatePreferences: (type: ContentType, duration: Duration | null, platforms: Platform[]) => void;
  onCalibrate: () => void;
}

const MOOD_LABELS: Record<string, string> = {
  'mind-bending': '🌀 Retourner le cerveau',
  scared: '👻 Frissonner',
  laugh: '😂 Rire',
  moved: '🥺 S\'émouvoir',
  escape: '✈️ S\'évader',
  surprised: '🎲 Être surpris',
};

const RATING_EMOJIS: Record<string, string> = {
  loved: '❤️', good: '👍', ok: '😐', disappointed: '😔', bad: '👎',
};

const TYPE_OPTIONS: { value: ContentType; label: string; emoji: string }[] = [
  { value: 'movie', label: 'Films', emoji: '🎬' },
  { value: 'series', label: 'Séries', emoji: '📺' },
  { value: 'both', label: 'Les deux', emoji: '🎲' },
];

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: 'under-90', label: '< 1h30' },
  { value: 'two-hours', label: '~2h' },
  { value: 'evening', label: 'Soirée' },
  { value: 'several-days', label: 'Série longue' },
];

const PLATFORMS: Platform[] = ['Netflix', 'Prime Video', 'Disney+', 'Canal+'];

export function ProfilePage({ profile, onReset, onUpdatePreferences, onCalibrate }: Props) {
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [editType, setEditType] = useState<ContentType>(profile.preferredType);
  const [editDuration, setEditDuration] = useState<Duration | null>(profile.preferredDuration);
  const [editPlatforms, setEditPlatforms] = useState<Platform[]>(profile.preferredPlatforms);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const topMoods = Object.entries(profile.frequentMoods)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const totalActions =
    profile.wantToWatchItems.length +
    profile.seenItems.length +
    profile.dislikedItems.length +
    profile.tooLongItems.length;

  const joinDate = new Date(profile.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  function togglePlatform(p: Platform) {
    setEditPlatforms(s => s.includes(p) ? s.filter(x => x !== p) : [...s, p]);
  }

  function savePrefs() {
    if (editPlatforms.length === 0) return;
    onUpdatePreferences(editType, editDuration, editPlatforms);
    setEditingPrefs(false);
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2500);
  }

  function handleReset() {
    if (window.confirm('Réinitialiser ton profil ? Tout ton historique sera perdu.')) {
      onReset();
    }
  }

  return (
    <div className="page-container page-scroll">
      {/* Avatar / header */}
      <div className="profile-header">
        <div className="profile-avatar">
          {profile.pseudo.slice(0, 2).toUpperCase()}
        </div>
        <h1 className="profile-name">{profile.pseudo}</h1>
        <p className="profile-since">Membre depuis le {joinDate}</p>
        {totalActions > 0 && (
          <div className="profile-learning-chip">
            <span className="learning-dot" />
            MoodFlix apprend de tes choix
          </div>
        )}
        {prefsSaved && (
          <div className="profile-saved-toast">✓ Préférences enregistrées</div>
        )}
      </div>

      {/* Stats — seenItems filtered to recommendation-only (calibration items start at 9001) */}
      {(() => {
        const recSeen = profile.seenItems.filter(id => id < 9001);
        return (
          <div className="profile-stats">
            <div className="stat-card stat-like">
              <span className="stat-number">{profile.likedItems.length}</span>
              <span className="stat-label">Aimés</span>
            </div>
            <div className="stat-card stat-seen">
              <span className="stat-number">{profile.wantToWatchItems.length}</span>
              <span className="stat-label">À regarder</span>
            </div>
            <div className="stat-card stat-dislike">
              <span className="stat-number">{recSeen.length}</span>
              <span className="stat-label">Déjà vus</span>
            </div>
            <div className="stat-card stat-rating">
              <span className="stat-number">{profile.satisfactionLog.length}</span>
              <span className="stat-label">Avis donnés</span>
            </div>
          </div>
        );
      })()}

      {/* Preferences */}
      <div className="profile-section">
        <div className="profile-section-header">
          <h2 className="profile-section-title">Mes préférences</h2>
          <button
            className="btn-edit-prefs"
            onClick={() => setEditingPrefs(e => !e)}
          >
            {editingPrefs ? 'Annuler' : '✏️ Modifier'}
          </button>
        </div>

        {!editingPrefs ? (
          <div className="prefs-summary">
            <div className="pref-row">
              <span className="pref-label">Type</span>
              <span className="pref-value">
                {TYPE_OPTIONS.find(t => t.value === profile.preferredType)?.label ?? 'Les deux'}
              </span>
            </div>
            <div className="pref-row">
              <span className="pref-label">Durée</span>
              <span className="pref-value">
                {DURATION_OPTIONS.find(d => d.value === profile.preferredDuration)?.label ?? 'Peu importe'}
              </span>
            </div>
            <div className="pref-row">
              <span className="pref-label">Plateformes</span>
              <span className="pref-value">
                {profile.preferredPlatforms.length > 0
                  ? profile.preferredPlatforms.join(', ')
                  : 'Aucune'}
              </span>
            </div>
          </div>
        ) : (
          <div className="prefs-editor">
            <p className="prefs-editor-label">Type préféré</p>
            <div className="prefs-type-grid">
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t.value}
                  className={`prefs-type-btn ${editType === t.value ? 'active' : ''}`}
                  onClick={() => setEditType(t.value)}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>

            <p className="prefs-editor-label">Durée préférée</p>
            <div className="prefs-duration-grid">
              <button
                className={`prefs-dur-btn ${editDuration === null ? 'active' : ''}`}
                onClick={() => setEditDuration(null)}
              >
                Peu importe
              </button>
              {DURATION_OPTIONS.map(d => (
                <button
                  key={d.value}
                  className={`prefs-dur-btn ${editDuration === d.value ? 'active' : ''}`}
                  onClick={() => setEditDuration(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <p className="prefs-editor-label">Plateformes</p>
            <div className="prefs-platform-grid">
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  className={`prefs-platform-btn ${editPlatforms.includes(p) ? 'active' : ''}`}
                  onClick={() => togglePlatform(p)}
                >
                  {editPlatforms.includes(p) ? '✓ ' : ''}{p}
                </button>
              ))}
            </div>

            <button
              className="btn-save-prefs"
              disabled={editPlatforms.length === 0}
              onClick={savePrefs}
            >
              Enregistrer mes préférences
            </button>
            {editPlatforms.length === 0 && (
              <p className="prefs-error">Sélectionne au moins une plateforme</p>
            )}
          </div>
        )}
      </div>

      {/* V4 — Spectator archetype */}
      {hasEnoughData(profile) && (() => {
        const arch = detectSpectatorProfile(profile);
        const influences = getInfluentialItems(profile);
        const topMoods = Object.entries(profile.frequentMoods)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([m]) => MOOD_LABELS[m] ?? m);
        return (
          <div className="profile-section">
            <h2 className="profile-section-title">Ton profil spectateur</h2>
            <div className="spectator-archetype">
              <span className="archetype-emoji">{arch.emoji}</span>
              <div className="archetype-info">
                <p className="archetype-label">{arch.label}</p>
                <p className="archetype-desc">{arch.description}</p>
              </div>
            </div>
            {topMoods.length > 0 && (
              <div className="archetype-traits">
                <p className="archetype-traits-label">Tes tendances :</p>
                <div className="archetype-traits-list">
                  {topMoods.map(m => (
                    <span key={m} className="archetype-trait-chip">{m}</span>
                  ))}
                </div>
              </div>
            )}
            {influences.length > 0 && (
              <div className="archetype-influences">
                <p className="archetype-influences-label">Basé sur :</p>
                <div className="archetype-influences-list">
                  {influences.map(title => (
                    <span key={title} className="archetype-influence-chip">{title}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Mood preferences */}
      {topMoods.length > 0 && (
        <div className="profile-section">
          <h2 className="profile-section-title">Tes humeurs favorites</h2>
          <div className="profile-moods-list">
            {topMoods.map(([mood, count]) => (
              <div key={mood} className="profile-mood-row">
                <span className="profile-mood-label">{MOOD_LABELS[mood] ?? mood}</span>
                <span className="profile-mood-count">{count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendation history stats */}
      {profile.recommendedHistory.length > 0 && (
        <div className="profile-section">
          <h2 className="profile-section-title">Activité</h2>
          <div className="profile-activity">
            <span className="activity-stat">{profile.recommendedHistory.length} contenus proposés</span>
            <span className="activity-sep">·</span>
            <span className="activity-stat">{profile.seenItems.filter(id => id < 9001).length} regardés</span>
            <span className="activity-sep">·</span>
            <span className="activity-stat">{profile.satisfactionLog.length} avis</span>
          </div>
        </div>
      )}

      {/* Satisfaction log */}
      {profile.satisfactionLog.length > 0 && (
        <div className="profile-section">
          <h2 className="profile-section-title">Tes derniers avis</h2>
          <div className="profile-ratings-list">
            {profile.satisfactionLog.slice(-4).reverse().map(entry => (
              <div key={entry.itemId} className="profile-rating-row">
                <span className="profile-rating-emoji">{RATING_EMOJIS[entry.rating]}</span>
                <span className="profile-rating-id">#{entry.itemId}</span>
                <span className="profile-rating-date">
                  {new Date(entry.date).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calibration */}
      <div className="profile-section">
        <h2 className="profile-section-title">Améliorer mes recommandations</h2>
        <p className="profile-section-desc">
          Note 12 films et séries connus pour que MoodFlix comprenne mieux tes goûts.
        </p>
        <button className="btn-calibrate-profile" onClick={onCalibrate}>
          🎯 Calibrer mes goûts
        </button>
      </div>

      {/* Reset */}
      <div className="profile-section profile-section-reset">
        <button className="btn-reset" onClick={handleReset}>
          🗑️ Réinitialiser mon profil
        </button>
        <p className="reset-warning">Cette action est irréversible</p>
      </div>
    </div>
  );
}
