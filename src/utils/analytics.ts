/** Analytics event names — exhaustive union for type safety */
export type AnalyticsEvent =
  | 'onboarding_completed'
  | 'profile_created'
  | 'calibration_completed'
  | 'search_started'
  | 'search_completed'
  | 'empty_results'
  | 'recommendation_viewed'
  | 'recommendation_liked'
  | 'recommendation_disliked'
  | 'recommendation_seen'
  | 'satisfaction_rated'
  | 'choose_for_me_used'
  | 'choose_for_me_confirmed'
  | 'quick_mode_used'
  | 'couple_mode_used'
  | 'paywall_opened'
  | 'premium_activated'
  | 'reminder_confirmed'
  | 'reminder_snoozed'
  | 'reminder_abandoned'
  | 'history_viewed'
  | 'profile_viewed'
  | 'premium_clicked'
  | 'ai_ranking_applied';

export type TrackPayload = Record<string, string | number | boolean | null | undefined>;

interface QueuedEvent {
  event: AnalyticsEvent;
  payload?: TrackPayload;
  ts: number;
}

// In-memory queue — swap body of flush() to connect Firebase / PostHog / Mixpanel
const queue: QueuedEvent[] = [];

export function track(event: AnalyticsEvent, payload?: TrackPayload): void {
  queue.push({ event, payload, ts: Date.now() });
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[Analytics]', event, payload ?? '');
  }
}

/** Drain queue — call this when you wire up a real analytics provider */
export function flushAnalytics(): QueuedEvent[] {
  return queue.splice(0);
}
