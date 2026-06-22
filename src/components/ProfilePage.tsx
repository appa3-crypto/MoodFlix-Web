import { useState, useMemo } from 'react';
import type { UserProfile, ContentType, Duration, Platform, Recommendation } from '../types';
import { getUserLevel } from '../utils/userLevel';
import { computeBadges } from '../utils/badges';
import { generateInsights } from '../utils/insights';
import { track } from '../utils/analytics';

interface Props {
  profile:            UserProfile;
  allItems:           Recommendation[];
  isPremium:          boolean;
  onReset:            () => void;
  onUpdatePreferences?: (type: ContentType, duration: Duration | null, platforms: Platform[]) => void;
  onUpdatePseudo:     (pseudo: string) => void;
  onCalibrate:        () => void;
  onGoToPremium:      () => void;
  onGoToSettings:     () => void;
}

const MOOD_LABELS: Record<string, string> = {
  'mind-bending': '🌀 Retourner le cerveau',
  scared:         '👻 Frissonner',
  laugh:          '😂 Rire',
  moved:          '🥺 S\'émouvoir',
  escape:         '✈️ S\'évader',
  surprised:      '🎲 Être surpris',
};

const AVATAR_EMOJIS = ['🎬','🍿','🎭','🎥','📽️','🎞️','🌟','🏆','👑','🎯'];

type ProfileSection = 'stats' | 'badges' | 'timeline' | 'insights';

export function ProfilePage({
  profile,
  allItems,
  isPremium,
  onReset,
  onUpdatePseudo,
  onCalibrate,
  onGoToPremium,
  onGoToSettings,
}: Props) {
  const [editingPseudo, setEditingPseudo] = useState(false);
  const [pseudoDraft,   setPseudoDraft]   = useState(profile.pseudo);
  const [avatarIdx,     setAvatarIdx]     = useState(() => {
    const stored = localStorage.getItem('moodflix_avatar_idx');
    return stored ? parseInt(stored, 10) % AVATAR_EMOJIS.length : 0;
  });
  const [openSection,   setOpenSection]   = useState<ProfileSection | null>('stats');

  useMemo(() => { track('profile_viewed'); }, []);

  const level   = useMemo(() => getUserLevel(profile), [profile]);
  const badges  = useMemo(() => computeBadges(profile, allItems), [profile, allItems]);
  const insights = useMemo(() => generateInsights(profile, allItems), [profile, allItems]);

  const earnedBadges  = badges.filter(b => b.earned);
  const lockedBadges  = badges.filter(b => !b.earned);

  // Stats computation
  const itemMap = useMemo(() => new Map(allItems.map(i => [i.id, i])), [allItems]);

  const moviesWatched = profile.seenItems.filter(id => {
    const meta = profile.itemMetaStore[id];
    const item = itemMap.get(id);
    return (meta?.type ?? item?.type) === 'movie' && id < 9001;
  }).length;

  const seriesWatched = profile.seenItems.filter(id => {
    const meta = profile.itemMetaStore[id];
    const item = itemMap.get(id);
    return (meta?.type ?? item?.type) === 'series' && id < 9001;
  }).length;

  const satLog    = profile.satisfactionLog;
  const positives = satLog.filter(e => e.rating === 'loved' || e.rating === 'good').length;
  const satRate   = satLog.length >= 3 ? Math.round(positives / satLog.length * 100) : null;

  // Estimated hours: movie ≈ 110 min, series ≈ 45 min/ep
  const hoursWatched = Math.round((moviesWatched * 110 + seriesWatched * 45) / 60);

  // Top genre from liked items
  const tagFreq: Record<string, number> = {};
  for (const id of profile.likedItems) {
    const tags = profile.itemMetaStore[id]?.tags ?? itemMap.get(id)?.tags ?? [];
    for (const t of tags) tagFreq[t] = (tagFreq[t] ?? 0) + 1;
  }
  const topGenre = Object.entries(tagFreq).sort(([,a],[,b]) => b-a)[0]?.[0] ?? null;

  // Preferred platform
  const topPlatform = profile.preferredPlatforms.filter(p => p !== 'any')[0] ?? null;

  // Timeline events from satisfactionLog + recommendedHistory
  const timelineEvents = useMemo(() => {
    const events: { date: string; emoji: string; text: string }[] = [];

    for (const entry of satLog.slice(-10)) {
      const meta = profile.itemMetaStore[entry.itemId];
      const title = meta?.title ?? itemMap.get(entry.itemId)?.title ?? `#${entry.itemId}`;
      const EMOJIS: Record<string, string> = { loved: '❤️', good: '👍', ok: '😐', disappointed: '😔', bad: '👎' };
      events.push({ date: entry.date, emoji: EMOJIS[entry.rating] ?? '⭐', text: `${title} noté` });
    }

    // Add wantToWatch items from recent history
    for (const h of profile.recommendedHistory.slice(-5)) {
      if (!satLog.find(e => e.itemId === h.itemId)) {
        events.push({ date: h.date, emoji: '🎬', text: `${h.title} recommandé` });
      }
    }

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
  }, [satLog, profile.recommendedHistory, profile.itemMetaStore, itemMap]);

  const joinDate = new Date(profile.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  function cycleAvatar() {
    const next = (avatarIdx + 1) % AVATAR_EMOJIS.length;
    setAvatarIdx(next);
    localStorage.setItem('moodflix_avatar_idx', String(next));
  }

  function savePseudo() {
    const trimmed = pseudoDraft.trim();
    if (trimmed && trimmed !== profile.pseudo) onUpdatePseudo(trimmed);
    setEditingPseudo(false);
  }

  function handleReset() {
    if (window.confirm('Réinitialiser ton profil ? Tout ton historique sera perdu.')) onReset();
  }

  function toggleSection(s: ProfileSection) {
    setOpenSection(p => p === s ? null : s);
  }

  return (
    <div className="page-container page-scroll">

      {/* ── HEADER ── */}
      <div className="profile-header">
        <button className="profile-avatar-btn" onClick={cycleAvatar} title="Changer d'avatar">
          <span className="profile-avatar-emoji">{AVATAR_EMOJIS[avatarIdx]}</span>
        </button>

        {editingPseudo ? (
          <div className="profile-pseudo-edit">
            <input
              className="profile-pseudo-input"
              value={pseudoDraft}
              onChange={e => setPseudoDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') savePseudo(); if (e.key === 'Escape') setEditingPseudo(false); }}
              maxLength={20}
              autoFocus
              aria-label="Modifier le pseudo"
            />
            <button className="profile-pseudo-save" onClick={savePseudo}>✓</button>
            <button className="profile-pseudo-cancel" onClick={() => setEditingPseudo(false)}>✕</button>
          </div>
        ) : (
          <button className="profile-name-btn" onClick={() => { setPseudoDraft(profile.pseudo); setEditingPseudo(true); }}>
            <h1 className="profile-name">{profile.pseudo}</h1>
            <span className="profile-name-edit">✏️</span>
          </button>
        )}

        <div className="profile-level-badge">
          <span className="level-emoji">{level.emoji}</span>
          <span className="level-title">Niv. {level.level} · {level.title}</span>
        </div>

        {isPremium ? (
          <div className="profile-premium-chip">👑 Premium actif</div>
        ) : (
          <button className="profile-upgrade-btn" onClick={onGoToPremium}>
            ✨ Passer Premium
          </button>
        )}

        <p className="profile-since">Membre depuis le {joinDate}</p>

        {/* XP progress bar */}
        {level.level < 5 && (
          <div className="profile-xp-bar-wrap">
            <div className="profile-xp-bar">
              <div className="profile-xp-fill" style={{ width: `${level.progress}%` }} />
            </div>
            <p className="profile-xp-label">{level.xp} / {level.nextXp} XP vers Niv. {level.level + 1}</p>
          </div>
        )}
      </div>

      {/* ── STATS ── */}
      <div className="profile-section-card">
        <button className="profile-section-toggle" onClick={() => toggleSection('stats')}>
          <span>📊 Statistiques</span>
          <span className="toggle-arrow">{openSection === 'stats' ? '▲' : '▼'}</span>
        </button>
        {openSection === 'stats' && (
          <div className="profile-stats-grid">
            <div className="pstat-card">
              <span className="pstat-emoji">🎬</span>
              <span className="pstat-value">{moviesWatched}</span>
              <span className="pstat-label">Films vus</span>
            </div>
            <div className="pstat-card">
              <span className="pstat-emoji">📺</span>
              <span className="pstat-value">{seriesWatched}</span>
              <span className="pstat-label">Séries suivies</span>
            </div>
            <div className="pstat-card">
              <span className="pstat-emoji">❤️</span>
              <span className="pstat-value">{satRate !== null ? `${satRate}%` : `${satLog.length}`}</span>
              <span className="pstat-label">{satRate !== null ? 'Satisfaction' : 'Avis donnés'}</span>
            </div>
            <div className="pstat-card">
              <span className="pstat-emoji">⏱</span>
              <span className="pstat-value">{hoursWatched}h</span>
              <span className="pstat-label">Temps regardé</span>
            </div>
            {topGenre && (
              <div className="pstat-card">
                <span className="pstat-emoji">🔥</span>
                <span className="pstat-value pstat-value-sm">{topGenre}</span>
                <span className="pstat-label">Genre préféré</span>
              </div>
            )}
            {topPlatform && (
              <div className="pstat-card">
                <span className="pstat-emoji">🍿</span>
                <span className="pstat-value pstat-value-sm">{topPlatform}</span>
                <span className="pstat-label">Plateforme fav.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BADGES ── */}
      <div className="profile-section-card">
        <button className="profile-section-toggle" onClick={() => toggleSection('badges')}>
          <span>🏅 Badges {earnedBadges.length > 0 && <span className="badge-count-chip">{earnedBadges.length}</span>}</span>
          <span className="toggle-arrow">{openSection === 'badges' ? '▲' : '▼'}</span>
        </button>
        {openSection === 'badges' && (
          <div className="badges-grid">
            {earnedBadges.map(b => (
              <div key={b.id} className="badge-card badge-earned" title={b.description}>
                <span className="badge-emoji">{b.emoji}</span>
                <span className="badge-title">{b.title}</span>
              </div>
            ))}
            {lockedBadges.map(b => (
              <div key={b.id} className="badge-card badge-locked" title={`À débloquer : ${b.description}`}>
                <span className="badge-emoji badge-emoji-locked">🔒</span>
                <span className="badge-title badge-title-locked">{b.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TIMELINE ── */}
      {timelineEvents.length > 0 && (
        <div className="profile-section-card">
          <button className="profile-section-toggle" onClick={() => toggleSection('timeline')}>
            <span>📅 Activité récente</span>
            <span className="toggle-arrow">{openSection === 'timeline' ? '▲' : '▼'}</span>
          </button>
          {openSection === 'timeline' && (
            <div className="timeline-list">
              {timelineEvents.map((ev, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <span className="timeline-emoji">{ev.emoji}</span>
                    <span className="timeline-text">{ev.text}</span>
                    <span className="timeline-date">
                      {new Date(ev.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── INSIGHTS ── */}
      {insights.length > 0 && (
        <div className="profile-section-card">
          <button className="profile-section-toggle" onClick={() => toggleSection('insights')}>
            <span>🧠 Ce que MoodFlix a appris sur toi</span>
            <span className="toggle-arrow">{openSection === 'insights' ? '▲' : '▼'}</span>
          </button>
          {openSection === 'insights' && (
            <div className="insights-list">
              {insights.map((insight, i) => (
                <div key={i} className="insight-item">
                  <span className="insight-dot">✦</span>
                  <p className="insight-text">{insight}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MOODS ── */}
      {Object.keys(profile.frequentMoods).length > 0 && (
        <div className="profile-section-card">
          <h2 className="profile-section-title-sm">Tes humeurs favorites</h2>
          <div className="profile-moods-compact">
            {Object.entries(profile.frequentMoods)
              .sort(([,a],[,b]) => b - a)
              .slice(0, 4)
              .map(([mood, count]) => (
                <div key={mood} className="mood-row-compact">
                  <span className="mood-label-compact">{MOOD_LABELS[mood] ?? mood}</span>
                  <span className="mood-count-compact">{count}×</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── CALIBRATION ── */}
      <div className="profile-section-card">
        <h2 className="profile-section-title-sm">Affiner mes recommandations</h2>
        <p className="profile-section-desc">
          Note quelques films connus pour que MoodFlix te connaisse mieux.
        </p>
        <button className="btn-calibrate-profile" onClick={onCalibrate}>
          🎯 Calibrer mes goûts
        </button>
      </div>

      {/* ── SHORTCUTS ── */}
      <div className="profile-shortcuts">
        {!isPremium && (
          <button className="shortcut-btn shortcut-premium" onClick={onGoToPremium}>
            <span>👑</span>
            <div>
              <p className="shortcut-title">Passer à Premium</p>
              <p className="shortcut-sub">Recommandations illimitées &amp; plus</p>
            </div>
            <span className="shortcut-arrow">›</span>
          </button>
        )}
        <button className="shortcut-btn" onClick={onGoToSettings}>
          <span>⚙️</span>
          <div>
            <p className="shortcut-title">Paramètres</p>
            <p className="shortcut-sub">Notifications, plateformes, compte</p>
          </div>
          <span className="shortcut-arrow">›</span>
        </button>
      </div>

      {/* ── RESET ── */}
      <div className="profile-section-card profile-section-reset">
        <button className="btn-reset" onClick={handleReset}>
          🗑️ Réinitialiser mon profil
        </button>
        <p className="reset-warning">Cette action est irréversible</p>
      </div>
    </div>
  );
}
