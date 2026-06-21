import type { UserProfile, Recommendation } from '../types';

interface Props {
  profile: UserProfile;
  allItems: Recommendation[];
}

const CATEGORIES = [
  { key: 'wantToWatchItems' as const, label: '❤️ Ça me tente', accent: '#EC4899' },
  { key: 'seenItems' as const, label: '👁️ Déjà vus', accent: '#8B5CF6' },
  { key: 'dislikedItems' as const, label: '🚫 Pas mon style', accent: '#6B7280' },
  { key: 'tooLongItems' as const, label: '⏱️ Trop long', accent: '#F59E0B' },
];

const RATING_LABELS: Record<string, string> = {
  loved: '❤️ Adoré',
  good: '👍 Bien',
  ok: '😐 Moyen',
  disappointed: '😔 Déçu',
  bad: '👎 Nul',
};

export function HistoryPage({ profile, allItems }: Props) {
  function getItem(id: number) {
    return allItems.find(i => i.id === id);
  }

  function getSatisfaction(id: number) {
    return profile.satisfactionLog.find(e => e.itemId === id);
  }

  const hasHistory = CATEGORIES.some(c => profile[c.key].length > 0);

  if (!hasHistory) {
    return (
      <div className="page-container">
        <h1 className="page-title">Mon historique</h1>
        <div className="history-empty">
          <div className="history-empty-icon">📋</div>
          <p className="history-empty-text">
            Ton historique est vide.
            <br />
            Commence à explorer des recommandations !
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container page-scroll">
      <h1 className="page-title">Mon historique</h1>

      {CATEGORIES.map(({ key, label, accent }) => {
        const ids = profile[key];
        if (ids.length === 0) return null;

        return (
          <div key={key} className="history-section">
            <h2 className="history-section-title" style={{ color: accent }}>{label}</h2>
            <div className="history-list">
              {ids.map(id => {
                const item = getItem(id);
                if (!item) return null;
                const satisfaction = getSatisfaction(id);

                return (
                  <div key={id} className="history-item">
                    <div
                      className="history-item-poster"
                      style={{ background: item.posterColor }}
                    >
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          className="history-poster-img"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <span className="history-poster-emoji">{item.posterEmoji}</span>
                      )}
                    </div>
                    <div className="history-item-info">
                      <span className="history-item-title">{item.title}</span>
                      <span className="history-item-meta">
                        {item.type === 'movie' ? '🎬' : '📺'} {item.platforms[0]}
                      </span>
                      {satisfaction && (
                        <span className="history-item-rating">
                          {RATING_LABELS[satisfaction.rating]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
