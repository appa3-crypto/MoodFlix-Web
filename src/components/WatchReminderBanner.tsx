import type { WatchPlan } from '../types';

interface Props {
  plan:        WatchPlan;
  onWatched:   () => void;
  onNotYet:    () => void;
  onAbandoned: () => void;
}

export function WatchReminderBanner({ plan, onWatched, onNotYet, onAbandoned }: Props) {
  if (plan.status !== 'planned') return null;

  // Only show if notifyAt time has passed (or no notifyAt — show immediately)
  const isDue = plan.notifyAt ? new Date() >= new Date(plan.notifyAt) : true;
  if (!isDue) return null;

  return (
    <div className="watch-reminder">
      <div className="watch-reminder-top">
        {plan.posterUrl
          ? <img src={plan.posterUrl} className="wr-poster" alt="" />
          : <span className="wr-emoji">{plan.posterEmoji}</span>
        }
        <div className="wr-text">
          <p className="wr-question">Tu l'as regardé ?</p>
          <p className="wr-title">{plan.title}</p>
        </div>
      </div>
      <div className="watch-reminder-btns">
        <button className="wr-btn wr-btn-yes"      onClick={onWatched}>   ✅ Oui, je l'ai vu</button>
        <button className="wr-btn wr-btn-later"    onClick={onNotYet}>    ⏳ Pas encore</button>
        <button className="wr-btn wr-btn-abandon"  onClick={onAbandoned}> 🚫 Abandonné</button>
      </div>
    </div>
  );
}
