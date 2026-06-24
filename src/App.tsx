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
import { PremiumPage } from './components/PremiumPage';
import { SettingsPage } from './components/SettingsPage';
import { Navigation } from './components/Navigation';
import { CalibrationModal } from './components/CalibrationModal';
import { ChooseForMeModal } from './components/ChooseForMeModal';
import { WatchReminderBanner } from './components/WatchReminderBanner';
import { CoupleModeSetup } from './components/CoupleModeSetup';
import { PaywallModal } from './components/PaywallModal';
import { OnboardingScreen } from './components/OnboardingScreen';
import { useUserProfile } from './hooks/useUserProfile';
import { useFreemium } from './hooks/useFreemium';
import { getTopRecommendations, getQuickRecommendations, getHiddenGem, reRankWithAI, inferChoicesFromProfile } from './utils/recommendationEngine';
import { discoverContent, enrichItem } from './services/tmdbService';
import { track } from './utils/analytics';
import type { ScoredRecommendation, CalibResult, WatchPlan } from './types';
import rawData from './data/recommendations.json';
import calibrationData from './data/calibration.json';

// Curated catalog + calibration items (calibration items contribute to tag similarity)
const ALL_ITEMS = [...rawData as Recommendation[], ...calibrationData as Recommendation[]];

// Compile-time flag — set VITE_AI_RANKING_ENABLED=true in Vercel (requires redeploy)
const AI_RANKING_ENABLED = import.meta.env.VITE_AI_RANKING_ENABLED === 'true';

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
    confirmWatched,
    confirmAbandoned,
    updatePseudo,
    updateSettings,
    moveToSeen,
    removeFromList,
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
  const [onboardingDone,   setOnboardingDone]   = useState<boolean>(() => {
    try { return localStorage.getItem('moodflix_onboarding_done') === 'true'; } catch { return false; }
  });
  const [showCalibration,  setShowCalibration]  = useState(false);
  const [showChooseForMe,  setShowChooseForMe]  = useState(false);
  const [cfmItems,         setCfmItems]         = useState<ScoredRecommendation[]>([]);
  const [cfmLoading,       setCfmLoading]       = useState(false);
  const [cfmAIUsed,        setCfmAIUsed]        = useState(false);
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
    if (!freemium.canUse('searches')) {
      setPaywallFeature('Recherches illimitées');
      setShowPaywall(true);
      return;
    }
    freemium.consume('searches');
    track('search_started', { mood: currentChoices.mood ?? undefined, type: currentChoices.type ?? undefined });
    setIsQuickMode(false);
    setExcludedIds([]);
    setIsSearching(true);
    setResults([]);
    goTo('results');

    const curatedTitles = ALL_ITEMS.map(i => i.title);
    const tmdbItems = await discoverContent(currentChoices, curatedTitles);
    setTmdbPool(tmdbItems);

    const allItems = [...ALL_ITEMS, ...tmdbItems];

    // Récupère plus de candidats si l'IA est activée (elle re-choisit parmi les meilleurs)
    const candidateCount = AI_RANKING_ENABLED ? 8 : 3;
    let tops = getTopRecommendations(allItems, currentChoices, profile, candidateCount, []);

    // Affiche les 3 premiers résultats locaux immédiatement
    setResults(tops.slice(0, 3));
    setIsSearching(false);

    // Phase IA (optionnelle, non-bloquante, max 3s avant fallback)
    if (AI_RANKING_ENABLED && tops.length >= 3) {
      const reRanked = await reRankWithAI(tops, currentChoices, profile);
      tops = reRanked;
      setResults(reRanked.slice(0, 3));
      track('ai_ranking_applied', { mood: currentChoices.mood ?? undefined, count: reRanked.length });
    }

    const finalTop3 = tops.slice(0, 3);

    recordPreferences(currentChoices.type ?? 'both', currentChoices.duration, currentChoices.platforms);
    if (finalTop3.length > 0) {
      recordRecommendedHistory(
        finalTop3.map(item => ({
          itemId: item.id, title: item.title,
          date: new Date().toISOString(), mood: currentChoices.mood,
        }))
      );
    }

    const topIds = finalTop3.map(r => r.id);
    const gem = getHiddenGem(allItems, currentChoices, profile, [...topIds]);
    setHiddenGem(gem);

    // Enrichissement posters (async, ne bloque pas l'UI)
    const enriched = await Promise.all(
      finalTop3.map(item => enrichItem(item).then(e => ({ ...item, ...e })))
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

      const candidateCount = AI_RANKING_ENABLED ? 8 : 3;
      let tops = getTopRecommendations(allItems, choices, profile, candidateCount, newExcluded);
      setResults(tops.slice(0, 3));

      if (AI_RANKING_ENABLED && tops.length >= 3) {
        const reRanked = await reRankWithAI(tops, choices, profile);
        tops = reRanked;
        setResults(reRanked.slice(0, 3));
      }

      const finalTop3 = tops.slice(0, 3);
      if (finalTop3.length > 0) {
        recordRecommendedHistory(
          finalTop3.map(item => ({
            itemId: item.id, title: item.title,
            date: new Date().toISOString(), mood: choices.mood,
          }))
        );
      }
      const enriched = await Promise.all(
        finalTop3.map(item => enrichItem(item).then(e => ({ ...item, ...e })))
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
    if (!freemium.canUse('searches')) {
      setPaywallFeature('Recherches illimitées');
      setShowPaywall(true);
      return;
    }
    freemium.consume('searches');
    track('quick_mode_used', { vibe, type: quickType });
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
    if (ratings.length > 0) {
      batchCalibration(ratings);
      track('calibration_completed', { count: ratings.length });
    }
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
  async function handleChooseForMe() {
    if (cfmLoading) return;
    if (!freemium.canUse('chooseForMe')) {
      handleNeedPremium('"Choisis pour moi" illimité');
      return;
    }
    freemium.consume('chooseForMe');
    setCfmAIUsed(false);

    // CHEMIN 1 — Résultats de recherche déjà présents (déjà potentiellement AI-ranked)
    if (results.length > 0) {
      const pool = [...results, ...(hiddenGem ? [hiddenGem] : [])];
      track('choose_for_me_used', { hasResults: true, aiEnabled: false });
      setCfmItems(pool);
      setShowChooseForMe(true);
      return;
    }

    // CHEMIN 2 — Génération fraîche depuis le catalogue complet
    setCfmLoading(true);
    track('choose_for_me_used', { hasResults: false, aiEnabled: AI_RANKING_ENABLED });

    try {
      // Construire les choices intelligentes depuis le profil
      const implicitChoices = profile
        ? inferChoicesFromProfile(profile)
        : { mood: null, type: null, duration: null, platforms: [], references: '', isAutoChoice: true as const };

      // Plus de candidats si l'IA est activée (elle choisit parmi les meilleurs)
      const candidateCount = AI_RANKING_ENABLED ? 10 : 15;
      let candidates = getTopRecommendations(ALL_ITEMS, implicitChoices, profile, candidateCount, []);

      if (candidates.length === 0) {
        candidates = (ALL_ITEMS as Recommendation[]).map(i => ({ ...i, score: 1, localRank: 1 }) as ScoredRecommendation);
      }

      // Re-ranking IA si activé
      if (AI_RANKING_ENABLED && candidates.length >= 3) {
        const reRanked = await reRankWithAI(candidates, implicitChoices, profile);
        candidates = reRanked;
        setCfmAIUsed(true);
        track('ai_ranking_applied', { mood: implicitChoices.mood ?? undefined, count: candidates.length });
      }

      // Enrichir les 5 premiers avec de vraies affiches (rapide, en parallèle)
      const top5     = candidates.slice(0, 5);
      const enriched = await Promise.all(top5.map(item => enrichItem(item).then(e => ({ ...item, ...e }))));
      const pool     = [...enriched as ScoredRecommendation[], ...candidates.slice(5)];

      setCfmItems(pool);
      setShowChooseForMe(true);
    } finally {
      setCfmLoading(false);
    }
  }

  function handleChooseConfirm(plan: WatchPlan) {
    planWatch(plan);
    setShowChooseForMe(false);
    const item = cfmItems.find(r => r.id === plan.itemId);
    if (item) {
      recordAction(plan.itemId, 'like', {
        title: item.title, type: item.type,
        posterUrl: item.posterUrl, posterEmoji: item.posterEmoji,
        posterColor: item.posterColor, tmdbId: item.tmdbId,
      });
    }
    setCfmItems([]);
  }

  // ── WATCH REMINDER ──
  function handleWatched() {
    confirmWatched();
  }
  function handleNotYet() {
    if (!profile?.watchPlan) return;
    updateWatchPlan({ notifyAt: new Date(Date.now() + 60 * 60_000).toISOString() });
  }
  function handleAbandoned() {
    confirmAbandoned();
  }

  // ── PAYWALL ──
  function handleNeedPremium(feature: string) {
    setPaywallFeature(feature);
    setShowPaywall(true);
    track('paywall_opened', { feature });
  }

  function handleActivatePremium() {
    freemium.activatePremium();
    setShowPaywall(false);
    track('premium_activated');
  }

  // ── CARD ACTIONS ──
  function handleAction(itemId: number, action: 'like' | 'seen' | 'dislike' | 'too-long') {
    const item = [...results, ...(hiddenGem ? [hiddenGem] : [])].find(r => r.id === itemId);
    recordAction(itemId, action, item ? {
      title:        item.title,
      type:         item.type,
      posterUrl:    item.posterUrl,
      posterEmoji:  item.posterEmoji,
      posterColor:  item.posterColor,
      tmdbId:       item.tmdbId,
      overview:     item.overview,
      atmosphere:   item.atmosphere,
      shortReason:  item.shortReason,
      tags:         item.tags,
      platforms:    item.availableOn ?? item.platforms,
      duration:     item.duration,
      seasons:      item.seasons,
      addedAt:      new Date().toISOString(),
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
  const showNav     = !!profile && step !== 'home' && step !== 'settings';

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
    if (!onboardingDone) {
      return (
        <div className="app">
          <OnboardingScreen onComplete={() => {
            try { localStorage.setItem('moodflix_onboarding_done', 'true'); } catch {}
            track('onboarding_completed');
            setOnboardingDone(true);
          }} />
        </div>
      );
    }
    function handleFirstProfile(pseudo: string, platforms: Platform[]) {
      createProfile(pseudo, platforms);
      setShowCalibration(true);
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

              {/* Header */}
              <div className="home-header-row">
                <div className="home-logo">MoodFlix</div>
                {freemium.isPremium && <div className="home-premium-pill">👑 Premium</div>}
              </div>

              {/* Hero */}
              <h1 className="home-headline">
                Trouve quoi regarder<br />
                <span className="headline-accent">en 30 secondes.</span>
              </h1>
              <p className="home-sub">
                Bonsoir, {profile.pseudo} — dis ton humeur, on fait le reste.
              </p>

              {/* Reminder de visionnage */}
              {profile.watchPlan?.status === 'planned' && (
                <WatchReminderBanner
                  plan={profile.watchPlan}
                  onWatched={handleWatched}
                  onNotYet={handleNotYet}
                  onAbandoned={handleAbandoned}
                />
              )}

              {/* Compteur gratuit (discret) */}
              {!freemium.isPremium && (() => {
                const rem = freemium.getRemainingUses('searches');
                return (
                  <div className={`home-usage-counter${rem === 0 ? ' home-usage-limit' : ''}`}>
                    {rem > 0
                      ? `${rem} recommandation${rem > 1 ? 's' : ''} gratuite${rem > 1 ? 's' : ''} restante${rem > 1 ? 's' : ''} aujourd'hui`
                      : <><span>⚠️ Limite du jour atteinte</span><button className="home-usage-upgrade" onClick={() => handleNeedPremium('Recommandations illimitées')}>Passer à Premium</button></>
                    }
                  </div>
                );
              })()}

              {/* CTA principal */}
              <button className="btn-start" onClick={startNormalSearch}>
                🎬 Trouver un film ou une série
              </button>
              <button className="btn-quickmode-link" onClick={startQuickMode}>
                ⚡ Mode rapide — 2 questions seulement
              </button>

              {/* Choisis pour moi */}
              {(() => {
                const cfmRem = freemium.isPremium ? null : freemium.getRemainingUses('chooseForMe');
                return (
                  <button className="btn-cfm-home" onClick={handleChooseForMe} disabled={cfmLoading}>
                    {cfmLoading ? '🔮 Analyse en cours…' : '🎲 Choisis pour moi'}
                    {!cfmLoading && cfmRem !== null && (
                      <span className="btn-cfm-tag">
                        {cfmRem > 0 ? `${cfmRem}/1 gratuit` : '🔒'}
                      </span>
                    )}
                    {!cfmLoading && cfmAIUsed && (
                      <span className="btn-cfm-tag" style={{ background: 'rgba(167,139,250,0.25)', color: '#a78bfa' }}>IA</span>
                    )}
                  </button>
                );
              })()}

              {/* Cartes de fonctionnalités */}
              <div className="home-cards-grid">
                <button
                  className="home-feature-card"
                  onClick={() => {
                    if (!freemium.isPremium) { handleNeedPremium('Mode couple'); return; }
                    setShowCouple(true);
                  }}
                >
                  <span className="hfc-icon">💑</span>
                  <span className="hfc-title">Mode couple</span>
                  <span className="hfc-sub">Trouvez un film pour deux</span>
                  {!freemium.isPremium && <span className="hfc-lock">🔒</span>}
                </button>
                <button className="home-feature-card" onClick={() => goTo('history')}>
                  <span className="hfc-icon">🎬</span>
                  <span className="hfc-title">Mon activité</span>
                  <span className="hfc-sub">
                    {profile.likedItems.length > 0 || profile.wantToWatchItems.length > 0
                      ? `${profile.likedItems.length} aimé · ${profile.wantToWatchItems.length} à voir`
                      : 'Rien encore'}
                  </span>
                </button>
              </div>

              {interactionCount < 5 && (
                <button className="btn-home-calibrate" onClick={() => setShowCalibration(true)}>
                  🎯 Calibrer mes goûts pour de meilleures recommandations
                </button>
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
            onQuickMode={startQuickMode}
          />
        )}

        {/* ── PROFILE ── */}
        {step === 'profile' && (
          <ProfilePage
            profile={profile}
            allItems={ALL_ITEMS}
            isPremium={freemium.isPremium}
            onReset={resetProfile}
            onUpdatePreferences={updatePreferences}
            onUpdatePseudo={updatePseudo}
            onCalibrate={() => setShowCalibration(true)}
            onGoToPremium={() => goTo('premium')}
            onGoToSettings={() => goTo('settings')}
          />
        )}

        {/* ── HISTORY ── */}
        {step === 'history' && (
          <HistoryPage
            profile={profile}
            allItems={ALL_ITEMS}
            onMoveToSeen={moveToSeen}
            onRemoveFromList={removeFromList}
            onRate={(id, rating) => addSatisfaction({ itemId: id, rating, reasons: [], date: new Date().toISOString() })}
          />
        )}

        {/* ── PREMIUM ── */}
        {step === 'premium' && (
          <PremiumPage
            isPremium={freemium.isPremium}
            onActivate={handleActivatePremium}
            onClose={() => goTo('home')}
          />
        )}

        {/* ── SETTINGS ── */}
        {step === 'settings' && (
          <SettingsPage
            profile={profile}
            onUpdateSettings={updateSettings}
            onUpdatePrefs={p => updatePreferences(profile.preferredType, profile.preferredDuration, p)}
            onUpdatePseudo={updatePseudo}
            onReset={resetProfile}
            onGoToPremium={() => goTo('premium')}
            onBack={() => goTo('profile')}
          />
        )}
      </main>

      {showNav && (
        <Navigation
          currentStep={step}
          pseudo={profile.pseudo}
          isPremium={freemium.isPremium}
          onNavigate={goTo}
        />
      )}

      {/* ── CALIBRATION MODAL ── */}
      {showCalibration && (
        <CalibrationModal
          onComplete={handleCalibrationComplete}
          onDismiss={() => setShowCalibration(false)}
          excludeIds={profile ? [...profile.seenItems, ...profile.dislikedItems] : []}
          catalog={rawData as Recommendation[]}
        />
      )}

      {/* ── CHOISIS POUR MOI ── */}
      {showChooseForMe && cfmItems.length > 0 && (
        <ChooseForMeModal
          items={cfmItems}
          aiUsed={cfmAIUsed}
          onConfirm={handleChooseConfirm}
          onDismiss={() => { setShowChooseForMe(false); setCfmItems([]); setCfmAIUsed(false); }}
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
