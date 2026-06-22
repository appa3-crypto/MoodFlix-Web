import { useState, useCallback } from 'react';
import type {
  Step,
  UserChoices,
  Mood,
  ContentType,
  Duration,
  Platform,
  SatisfactionRating,
  QuickVibe,
  Recommendation,
} from './types';
import { MoodSelector } from './components/MoodSelector';
import { TypeSelector } from './components/TypeSelector';
import { TimeSelector } from './components/TimeSelector';
import { PlatformSelector } from './components/PlatformSelector';
import { ResultsPage } from './components/ResultsPage';
import { ProgressBar } from './components/ProgressBar';
import { ProfileSetup } from './components/ProfileSetup';
import { ProfilePage } from './components/ProfilePage';
import { HistoryPage } from './components/HistoryPage';
import { Navigation } from './components/Navigation';
import { CalibrationModal } from './components/CalibrationModal';
import { ChooseForMeModal } from './components/ChooseForMeModal';
import { WatchReminderBanner } from './components/WatchReminderBanner';
import { CoupleModeSetup } from './components/CoupleModeSetup';
import { PaywallModal } from './components/PaywallModal';
import { useUserProfile } from './hooks/useUserProfile';
import { useFreemium } from './hooks/useFreemium';
import { getTopRecommendations, getQuickRecommendations, getHiddenGem } from './utils/recommendationEngine';
import { discoverContent, enrichItem } from './services/tmdbService';
import type { ScoredRecommendation, CalibResult, WatchPlan } from './types';
import rawData from './data/recommendations.json';
import calibrationData from './data/calibration.json';

// Curated catalog + calibration items (calibration items contribute to tag similarity)
const ALL_ITEMS = [...rawData as Recommendation[], ...calibrationData as Recommendation[]];

const INITIAL_CHOICES: UserChoices = {
  mood: null,
  type: null,
  duration: null,
  platforms: [],
  references: '',
};

// References step removed — flow goes directly to results after platform
const FLOW_FULL: Step[]  = ['home', 'mood', 'type', 'duration', 'platform', 'results'];
const FLOW_SHORT: Step[] = ['home', 'mood', 'type', 'duration', 'results'];

export default function App() {
  const {
    profile,
    isLoading,
    createProfile,
    resetProfile,
    recordMood,
    recordPreferences,
    updatePreferences,
    recordAction,
    undoAction,
    addSatisfaction,
    recordRecommendedHistory,
    batchCalibration,
    planWatch,
    updateWatchPlan,
  } = useUserProfile();

  const freemium = useFreemium();

  const [step, setStep] = useState<Step>('home');
  const [choices, setChoices] = useState<UserChoices>(INITIAL_CHOICES);
  const [results, setResults] = useState<ScoredRecommendation[]>([]);
  const [animating, setAnimating] = useState(false);
  const [isQuickMode, setIsQuickMode] = useState(false);
  const [quickType, setQuickType] = useState<ContentType>('both');
  const [platformsFromProfile, setPlatformsFromProfile] = useState(false);
  const [platformEditMode, setPlatformEditMode] = useState(false);
  const [excludedIds, setExcludedIds] = useState<number[]>([]);
  const [quickExcludedIds, setQuickExcludedIds] = useState<number[]>([]);
  const [lastQuickVibe, setLastQuickVibe] = useState<QuickVibe>('surprising');
  const [tmdbPool, setTmdbPool] = useState<Recommendation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hiddenGem, setHiddenGem] = useState<ScoredRecommendation | null>(null);
  const [showCalibration,  setShowCalibration]  = useState(false);
  const [showChooseForMe,  setShowChooseForMe]  = useState(false);
  const [showCouple,       setShowCouple]       = useState(false);
  const [showPaywall,      setShowPaywall]      = useState(false);
  const [paywallFeature,   setPaywallFeature]   = useState('');

  const goTo = useCallback((next: Step) => {
    setAnimating(true);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 200);
  }, []);

  // ── CORE SEARCH ENGINE ──
  async function triggerSearch(currentChoices: UserChoices) {
    setIsQuickMode(false);
    setExcludedIds([]);
    setIsSearching(true);
    setResults([]);
    goTo('results');

    const curatedTitles = ALL_ITEMS.map(i => i.title);
    const tmdbItems = await discoverContent(currentChoices, curatedTitles);
    setTmdbPool(tmdbItems);

    const allItems = [...ALL_ITEMS, ...tmdbItems];
    const tops = getTopRecommendations(allItems, currentChoices, profile, 3, []);

    recordPreferences(currentChoices.type ?? 'both', currentChoices.duration, currentChoices.platforms);
    if (tops.length > 0) {
      recordRecommendedHistory(
        tops.map(item => ({
          itemId: item.id, title: item.title,
          date: new Date().toISOString(), mood: currentChoices.mood,
        }))
      );
    }

    const topIds = tops.map(r => r.id);
    const gem = getHiddenGem(allItems, currentChoices, profile, [...topIds]);
    setHiddenGem(gem);

    setResults(tops);
    setIsSearching(false);

    const enriched = await Promise.all(
      tops.map(item => enrichItem(item).then(e => ({ ...item, ...e })))
    );
    setResults(enriched as ScoredRecommendation[]);

    if (gem) {
      const enrichedGem = await enrichItem(gem).then(e => ({ ...gem, ...e }));
      setHiddenGem(enrichedGem as ScoredRecommendation);
    }
  }

  // ── START NORMAL SEARCH ──
  function startNormalSearch() {
    const prefPlatforms = profile?.preferredPlatforms ?? [];
    setChoices({
      ...INITIAL_CHOICES,
      type: profile?.preferredType !== 'both' ? (profile?.preferredType ?? null) : null,
      duration: profile?.preferredDuration ?? null,
      platforms: prefPlatforms,
    });
    setPlatformsFromProfile(false);
    setPlatformEditMode(false);
    setExcludedIds([]);
    goTo('mood');
  }

  // ── MOOD ──
  function handleMood(mood: Mood) {
    setChoices(c => ({ ...c, mood }));
    recordMood(mood);
    goTo('type');
  }

  // ── TYPE ──
  function handleType(type: ContentType) {
    setChoices(c => ({ ...c, type }));
    goTo('duration');
  }

  // ── DURATION ── goes directly to results if profile has platforms
  function handleDuration(duration: Duration) {
    const hasPlatforms = (profile?.preferredPlatforms.length ?? 0) > 0;
    if (hasPlatforms && !platformEditMode) {
      const updated = { ...choices, duration, platforms: profile!.preferredPlatforms };
      setChoices(updated);
      setPlatformsFromProfile(true);
      triggerSearch(updated); // Skip platform step — go directly to results
    } else {
      setChoices(c => ({ ...c, duration }));
      setPlatformsFromProfile(false);
      goTo('platform');
    }
  }

  // ── PLATFORM TOGGLE ──
  function handlePlatformToggle(platform: Platform) {
    setChoices(c => {
      if (platform === 'any') {
        return { ...c, platforms: c.platforms.includes('any') ? [] : ['any'] };
      }
      const filtered = c.platforms.filter(p => p !== 'any');
      return {
        ...c,
        platforms: filtered.includes(platform)
          ? filtered.filter(p => p !== platform)
          : [...filtered, platform],
      };
    });
  }

  // ── PLATFORM NEXT → directly to results (no references step)
  function handlePlatformNext() {
    if (platformEditMode) {
      recordPreferences(choices.type ?? 'both', choices.duration, choices.platforms);
      setPlatformEditMode(false);
      setPlatformsFromProfile(true);
    }
    triggerSearch(choices);
  }

  // ── SUGGEST OTHER ──
  async function handleSuggestOther() {
    if (isQuickMode) {
      const newExcluded = [...quickExcludedIds, ...results.map(r => r.id)];
      setQuickExcludedIds(newExcluded);
      const tops = getQuickRecommendations(ALL_ITEMS, quickType, lastQuickVibe, profile, 3, newExcluded);
      setResults(tops);
      if (tops.length > 0) {
        recordRecommendedHistory(
          tops.map(item => ({
            itemId: item.id, title: item.title,
            date: new Date().toISOString(), mood: null,
          }))
        );
      }
    } else {
      const newExcluded = [...excludedIds, ...results.map(r => r.id)];
      setExcludedIds(newExcluded);
      const allItems = [...ALL_ITEMS, ...tmdbPool];
      const tops = getTopRecommendations(allItems, choices, profile, 3, newExcluded);
      setResults(tops);
      if (tops.length > 0) {
        recordRecommendedHistory(
          tops.map(item => ({
            itemId: item.id, title: item.title,
            date: new Date().toISOString(), mood: choices.mood,
          }))
        );
      }
      const enriched = await Promise.all(
        tops.map(item => enrichItem(item).then(e => ({ ...item, ...e })))
      );
      setResults(enriched as ScoredRecommendation[]);
    }
  }

  // ── QUICK MODE ──
  function startQuickMode() {
    setIsQuickMode(true);
    setQuickExcludedIds([]);
    goTo('quick-type');
  }

  function handleQuickType(type: ContentType) {
    setQuickType(type);
    goTo('quick-vibe');
  }

  function handleQuickVibe(vibe: QuickVibe) {
    setLastQuickVibe(vibe);
    const tops = getQuickRecommendations(ALL_ITEMS, quickType, vibe, profile, 3, []);
    setResults(tops);
    if (tops.length > 0) {
      recordRecommendedHistory(
        tops.map(item => ({
          itemId: item.id, title: item.title,
          date: new Date().toISOString(), mood: null,
        }))
      );
    }
    goTo('results');
  }

  // ── CALIBRATION ──
  function handleCalibrationComplete(ratings: CalibResult[]) {
    if (ratings.length > 0) batchCalibration(ratings);
    setShowCalibration(false);
  }

  // ── RESTART ──
  function handleRestart() {
    setChoices(INITIAL_CHOICES);
    setResults([]);
    setIsQuickMode(false);
    setPlatformsFromProfile(false);
    setPlatformEditMode(false);
    setExcludedIds([]);
    setQuickExcludedIds([]);
    setTmdbPool([]);
    setIsSearching(false);
    setHiddenGem(null);
    goTo('home');
  }

  // ── CHOISIS POUR MOI ──
  function handleChooseForMe() {
    if (!freemium.canUse('chooseForMe')) {
      setPaywallFeature('Choisis pour moi illimité');
      setShowPaywall(true);
      return;
    }
    freemium.consume('chooseForMe');
    setShowChooseForMe(true);
  }

  function handleChooseConfirm(plan: WatchPlan) {
    planWatch(plan);
    setShowChooseForMe(false);
    // Also record as "like" in profile
    const item = [...results, ...(hiddenGem ? [hiddenGem] : [])].find(r => r.id === plan.itemId);
    if (item) {
      recordAction(plan.itemId, 'like', {
        title: item.title, type: item.type,
        posterUrl: item.posterUrl, posterEmoji: item.posterEmoji,
        posterColor: item.posterColor, tmdbId: item.tmdbId,
      });
    }
  }

  // ── WATCH REMINDER ──
  function handleWatched() {
    updateWatchPlan({ status: 'watched', watchedAt: new Date().toISOString() } as Partial<WatchPlan>);
  }
  function handleNotYet() {
    // Snooze: push notify time by 1 hour
    if (!profile?.watchPlan) return;
    const snooze = new Date(Date.now() + 60 * 60_000).toISOString();
    updateWatchPlan({ notifyAt: snooze } as Partial<WatchPlan>);
  }
  function handleAbandoned() {
    updateWatchPlan({ status: 'abandoned' } as Partial<WatchPlan>);
  }

  // ── PAYWALL ──
  function handleNeedPremium(feature: string) {
    setPaywallFeature(feature);
    setShowPaywall(true);
  }

  function handleActivatePremium() {
    freemium.activatePremium();
    setShowPaywall(false);
  }

  // ── CARD ACTIONS ──
  function handleAction(itemId: number, action: 'like' | 'seen' | 'dislike' | 'too-long') {
    // Find the item in current results to persist its posterUrl snapshot
    const item = [...results, ...(hiddenGem ? [hiddenGem] : [])].find(r => r.id === itemId);
    recordAction(itemId, action, item ? {
      title: item.title,
      type: item.type,
      posterUrl: item.posterUrl,
      posterEmoji: item.posterEmoji,
      posterColor: item.posterColor,
      tmdbId: item.tmdbId,
    } : undefined);
  }
  function handleUndo(itemId: number) { undoAction(itemId); }
  function handleSatisfaction(itemId: number, rating: SatisfactionRating, reasons: string[]) {
    addSatisfaction({ itemId, rating, reasons, date: new Date().toISOString() });
  }

  // ── BACK ──
  function back() {
    if (step === 'quick-vibe') { goTo('quick-type'); return; }
    if (step === 'platform' && platformEditMode) {
      setPlatformEditMode(false);
      goTo('results');
      return;
    }
    const flow = platformsFromProfile ? FLOW_SHORT : FLOW_FULL;
    const idx = flow.indexOf(step);
    if (idx > 0) goTo(flow[idx - 1]);
  }

  const MAIN_STEPS: Step[] = ['mood', 'type', 'duration', 'platform'];
  const isMainFlow  = MAIN_STEPS.includes(step);
  const isQuickFlow = step === 'quick-type' || step === 'quick-vibe';
  const showHeader  = isMainFlow || isQuickFlow;
  const showProgress = isMainFlow;
  const showNav     = !!profile && step !== 'home';

  // How many interactions the user has had — used to decide calibration prompt
  const interactionCount = profile
    ? profile.wantToWatchItems.length + profile.dislikedItems.length + profile.satisfactionLog.length
    : 0;

  if (isLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="loading-logo">MoodFlix</div>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!profile) {
    function handleFirstProfile(pseudo: string, platforms: import('./types').Platform[]) {
      createProfile(pseudo, platforms);
      setShowCalibration(true); // auto-launch calibration for new users
    }
    return (
      <div className="app">
        <ProfileSetup onComplete={handleFirstProfile} />
      </div>
    );
  }

  return (
    <div className="app">
      {showHeader && (
        <header className="app-header">
          <button className="btn-back" onClick={back} aria-label="Retour">← Retour</button>
          <div className="header-logo">MoodFlix</div>
          <div style={{ width: 80 }} />
        </header>
      )}

      {showProgress && (
        <ProgressBar currentStep={step} skipPlatform={platformsFromProfile} />
      )}

      <main className={`main-content ${animating ? 'fade-out' : 'fade-in'} ${showNav ? 'with-nav' : ''}`}>

        {/* ── HOME ── */}
        {step === 'home' && (
          <div className="home-screen">
            <div className="home-glow" />
            <div className="home-content">
              <div className="home-logo">MoodFlix</div>
              <h1 className="home-headline">
                Bonsoir, {profile.pseudo} —{' '}
                <span className="headline-accent">qu'est-ce qu'on regarde ce soir ?</span>
              </h1>
              <p className="home-sub">
                Arrête de scroller. Trouve quoi regarder en 30 secondes.
              </p>

              {/* Watch reminder banner (shows after planned watch time) */}
              {profile.watchPlan && profile.watchPlan.status === 'planned' && (
                <WatchReminderBanner
                  plan={profile.watchPlan}
                  onWatched={handleWatched}
                  onNotYet={handleNotYet}
                  onAbandoned={handleAbandoned}
                />
              )}

              <button className="btn-start" onClick={startNormalSearch}>
                🎬 Trouver quoi regarder →
              </button>
              <button className="btn-start btn-start-secondary" onClick={startQuickMode}>
                ⚡ Mode rapide — 2 questions
              </button>
              <div className="home-row-btns">
                <button className="btn-home-sm" onClick={() => setShowCouple(true)}>
                  💑 Mode couple
                </button>
                {interactionCount < 5 && (
                  <button className="btn-home-sm" onClick={() => setShowCalibration(true)}>
                    🎯 Calibrer mes goûts
                  </button>
                )}
              </div>

              {freemium.isPremium && (
                <div className="home-premium-badge">👑 Premium actif</div>
              )}
              <p className="home-disclaimer">Sans inscription · Sans pub · Données locales</p>
            </div>
          </div>
        )}

        {/* ── MOOD ── */}
        {step === 'mood' && (
          <MoodSelector selected={choices.mood} onSelect={handleMood} />
        )}

        {/* ── TYPE ── */}
        {step === 'type' && (
          <TypeSelector selected={choices.type} onSelect={handleType} />
        )}

        {/* ── DURATION ── */}
        {step === 'duration' && (
          <TimeSelector selected={choices.duration} onSelect={handleDuration} />
        )}

        {/* ── PLATFORM ── */}
        {step === 'platform' && (
          <div className="step-container">
            {platformEditMode && (
              <div className="platform-edit-banner">
                Modifie tes plateformes — elles seront enregistrées dans ton profil.
              </div>
            )}
            <PlatformSelector selected={choices.platforms} onToggle={handlePlatformToggle} />
            <div className="step-actions">
              <button
                className="btn-next"
                onClick={handlePlatformNext}
                disabled={choices.platforms.length === 0}
              >
                {platformEditMode ? 'Enregistrer et continuer →' : 'Voir mes recommandations ✨'}
              </button>
              {choices.platforms.length === 0 && (
                <p className="step-hint">Sélectionne au moins une plateforme</p>
              )}
            </div>
          </div>
        )}

        {/* ── QUICK MODE ── */}
        {step === 'quick-type' && (
          <div className="quick-screen">
            <div className="quick-header">
              <h2 className="quick-title">Film, série ou peu importe ?</h2>
              <p className="quick-sub">2 questions, 3 suggestions.</p>
            </div>
            <div className="quick-options">
              <button className="quick-btn" onClick={() => handleQuickType('movie')}>
                <span className="quick-emoji">🎬</span>
                <span className="quick-label">Film</span>
              </button>
              <button className="quick-btn" onClick={() => handleQuickType('series')}>
                <span className="quick-emoji">📺</span>
                <span className="quick-label">Série</span>
              </button>
              <button className="quick-btn" onClick={() => handleQuickType('both')}>
                <span className="quick-emoji">🎲</span>
                <span className="quick-label">Peu importe</span>
              </button>
            </div>
          </div>
        )}

        {step === 'quick-vibe' && (
          <div className="quick-screen">
            <div className="quick-header">
              <h2 className="quick-title">Plutôt quelle ambiance ?</h2>
              <p className="quick-sub">Une seule question encore.</p>
            </div>
            <div className="quick-options">
              <button className="quick-btn" onClick={() => handleQuickVibe('light')}>
                <span className="quick-emoji">😄</span>
                <span className="quick-label">Léger & fun</span>
              </button>
              <button className="quick-btn" onClick={() => handleQuickVibe('intense')}>
                <span className="quick-emoji">🔥</span>
                <span className="quick-label">Intense & fort</span>
              </button>
              <button className="quick-btn" onClick={() => handleQuickVibe('surprising')}>
                <span className="quick-emoji">🌀</span>
                <span className="quick-label">Surprenant</span>
              </button>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === 'results' && (
          <ResultsPage
            results={results}
            hiddenGem={hiddenGem}
            choices={choices}
            profile={profile}
            isQuickMode={isQuickMode}
            isSearching={isSearching}
            onRestart={handleRestart}
            onAction={handleAction}
            onUndo={handleUndo}
            onSatisfaction={handleSatisfaction}
            onSuggestOther={handleSuggestOther}
            onChooseForMe={handleChooseForMe}
          />
        )}

        {/* ── PROFILE ── */}
        {step === 'profile' && (
          <ProfilePage
            profile={profile}
            onReset={resetProfile}
            onUpdatePreferences={updatePreferences}
            onCalibrate={() => setShowCalibration(true)}
          />
        )}

        {/* ── HISTORY ── */}
        {step === 'history' && (
          <HistoryPage profile={profile} allItems={ALL_ITEMS} />
        )}
      </main>

      {showNav && (
        <Navigation
          currentStep={step}
          pseudo={profile.pseudo}
          onNavigate={goTo}
        />
      )}

      {/* ── CALIBRATION MODAL ── */}
      {showCalibration && (
        <CalibrationModal
          onComplete={handleCalibrationComplete}
          onDismiss={() => setShowCalibration(false)}
        />
      )}

      {/* ── CHOISIS POUR MOI ── */}
      {showChooseForMe && results.length > 0 && (
        <ChooseForMeModal
          items={[...results, ...(hiddenGem ? [hiddenGem] : [])]}
          onConfirm={handleChooseConfirm}
          onDismiss={() => setShowChooseForMe(false)}
          canRelaunch={freemium.canUse('relaunches')}
          onNeedPremium={() => handleNeedPremium('Relances illimitées')}
        />
      )}

      {/* ── MODE COUPLE ── */}
      {showCouple && (
        <CoupleModeSetup
          profile={profile}
          allItems={ALL_ITEMS}
          onDismiss={() => setShowCouple(false)}
        />
      )}

      {/* ── PAYWALL ── */}
      {showPaywall && (
        <PaywallModal
          feature={paywallFeature}
          onClose={() => setShowPaywall(false)}
          onActivate={handleActivatePremium}
        />
      )}
    </div>
  );
}
