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
import { ReferenceInput } from './components/ReferenceInput';
import { ResultsPage } from './components/ResultsPage';
import { ProgressBar } from './components/ProgressBar';
import { ProfileSetup } from './components/ProfileSetup';
import { ProfilePage } from './components/ProfilePage';
import { HistoryPage } from './components/HistoryPage';
import { Navigation } from './components/Navigation';
import { useUserProfile } from './hooks/useUserProfile';
import { getTopRecommendations, getQuickRecommendations } from './utils/recommendationEngine';
import { discoverContent, enrichItem } from './services/tmdbService';
import type { ScoredRecommendation } from './types';
import rawData from './data/recommendations.json';

const ALL_ITEMS = rawData as Recommendation[];

const INITIAL_CHOICES: UserChoices = {
  mood: null,
  type: null,
  duration: null,
  platforms: [],
  references: '',
};

// Steps for back() navigation (platform may be skipped)
const FLOW_FULL: Step[] = ['home', 'mood', 'type', 'duration', 'platform', 'references', 'results'];
const FLOW_SHORT: Step[] = ['home', 'mood', 'type', 'duration', 'references', 'results'];

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
  } = useUserProfile();

  const [step, setStep] = useState<Step>('home');
  const [choices, setChoices] = useState<UserChoices>(INITIAL_CHOICES);
  const [results, setResults] = useState<ScoredRecommendation[]>([]);
  const [animating, setAnimating] = useState(false);
  const [isQuickMode, setIsQuickMode] = useState(false);
  const [quickType, setQuickType] = useState<ContentType>('both');
  // Platform skip — true when platform step was bypassed using profile
  const [platformsFromProfile, setPlatformsFromProfile] = useState(false);
  // Platform edit mode — user clicked "Modifier" from references step
  const [platformEditMode, setPlatformEditMode] = useState(false);
  // IDs to exclude when requesting new suggestions ("Proposer autre chose")
  const [excludedIds, setExcludedIds] = useState<number[]>([]);
  // Quick mode excluded IDs
  const [quickExcludedIds, setQuickExcludedIds] = useState<number[]>([]);
  // Store quick vibe for "Proposer autre chose" in quick mode
  const [lastQuickVibe, setLastQuickVibe] = useState<QuickVibe>('surprising');
  // V3 — TMDB discover pool (used to supplement curated catalog)
  const [tmdbPool, setTmdbPool] = useState<Recommendation[]>([]);
  // V3 — true while TMDB async pipeline is running
  const [isSearching, setIsSearching] = useState(false);

  const goTo = useCallback((next: Step) => {
    setAnimating(true);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 200);
  }, []);

  // ── START NORMAL SEARCH ──
  // Pre-fill from profile defaults to save clicks
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

  // ── DURATION ──
  function handleDuration(duration: Duration) {
    const hasPlatforms = (profile?.preferredPlatforms.length ?? 0) > 0;
    if (hasPlatforms && !platformEditMode) {
      // Skip platform step — use profile platforms
      setChoices(c => ({ ...c, duration, platforms: profile!.preferredPlatforms }));
      setPlatformsFromProfile(true);
      goTo('references');
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

  // ── PLATFORM NEXT ──
  function handlePlatformNext() {
    if (platformEditMode) {
      // Save updated platforms to profile
      recordPreferences(choices.type ?? 'both', choices.duration, choices.platforms);
      setPlatformEditMode(false);
      setPlatformsFromProfile(true);
    }
    goTo('references');
  }

  // ── EDIT PLATFORMS (from references step) ──
  function handleEditPlatforms() {
    setPlatformEditMode(true);
    goTo('platform');
  }

  // ── REFERENCES → RESULTS (async — TMDB discover + enrich) ──
  async function handleReferences(references: string) {
    const updated = { ...choices, references };
    setChoices(updated);
    setIsQuickMode(false);
    setExcludedIds([]);
    setIsSearching(true);
    setResults([]);
    goTo('results');

    // 1. Discover additional items from TMDB
    const curatedTitles = ALL_ITEMS.map(i => i.title);
    const tmdbItems = await discoverContent(updated, curatedTitles);
    setTmdbPool(tmdbItems);

    // 2. Score curated + TMDB pool together
    const allItems = [...ALL_ITEMS, ...tmdbItems];
    const tops = getTopRecommendations(allItems, updated, profile, 3, []);

    // 3. Persist preferences + history
    recordPreferences(updated.type ?? 'both', updated.duration, updated.platforms);
    if (tops.length > 0) {
      recordRecommendedHistory(
        tops.map(item => ({
          itemId: item.id, title: item.title,
          date: new Date().toISOString(), mood: updated.mood,
        }))
      );
    }

    // 4. Show results immediately with curated/existing data
    setResults(tops);
    setIsSearching(false);

    // 5. Enrich top results with TMDB (poster, overview, rating, providers)
    const enriched = await Promise.all(
      tops.map(item => enrichItem(item).then(e => ({ ...item, ...e })))
    );
    setResults(enriched as ScoredRecommendation[]);
  }

  // ── SUGGEST OTHER (same criteria, different results) ──
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
      // Enrich new suggestions
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
          itemId: item.id,
          title: item.title,
          date: new Date().toISOString(),
          mood: null,
        }))
      );
    }
    goTo('results');
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
    goTo('home');
  }

  // ── CARD ACTIONS ──
  function handleAction(itemId: number, action: 'like' | 'seen' | 'dislike' | 'too-long') {
    recordAction(itemId, action);
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
      goTo('references');
      return;
    }
    const flow = platformsFromProfile ? FLOW_SHORT : FLOW_FULL;
    const idx = flow.indexOf(step);
    if (idx > 0) goTo(flow[idx - 1]);
  }

  const MAIN_STEPS: Step[] = ['mood', 'type', 'duration', 'platform', 'references'];
  const isMainFlow = MAIN_STEPS.includes(step);
  const isQuickFlow = step === 'quick-type' || step === 'quick-vibe';
  const showHeader = isMainFlow || isQuickFlow;
  const showProgress = isMainFlow;
  const showNav = !!profile && step !== 'home';

  // ── LOADING ──
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

  // ── FIRST LAUNCH ──
  if (!profile) {
    return (
      <div className="app">
        <ProfileSetup onComplete={createProfile} />
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      {showHeader && (
        <header className="app-header">
          <button className="btn-back" onClick={back} aria-label="Retour">
            ← Retour
          </button>
          <div className="header-logo">MoodFlix</div>
          <div style={{ width: 80 }} />
        </header>
      )}

      {/* Progress */}
      {showProgress && (
        <ProgressBar currentStep={step} skipPlatform={platformsFromProfile} />
      )}

      {/* Screens */}
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
                3 recommandations ciblées en 30 secondes,
                <br />
                personnalisées selon ton profil.
              </p>
              <button className="btn-start" onClick={startNormalSearch}>
                Je sais ce que je veux →
              </button>
              <button className="btn-start btn-start-ghost" onClick={startQuickMode}>
                🎲 Je sais pas
              </button>
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
                {platformEditMode ? 'Enregistrer et continuer →' : 'Suivant →'}
              </button>
              {choices.platforms.length === 0 && (
                <p className="step-hint">Sélectionne au moins une plateforme</p>
              )}
            </div>
          </div>
        )}

        {/* ── REFERENCES ── */}
        {step === 'references' && (
          <>
            {/* Platform chips — shown when platform step was skipped */}
            {platformsFromProfile && !platformEditMode && choices.platforms.length > 0 && (
              <div className="platform-chips-bar">
                <span className="platform-chips-label">Plateformes :</span>
                <div className="platform-chips-list">
                  {choices.platforms.map(p => (
                    <span key={p} className="platform-mini-chip">{p}</span>
                  ))}
                </div>
                <button className="btn-edit-platforms" onClick={handleEditPlatforms}>
                  Modifier
                </button>
              </div>
            )}
            <ReferenceInput
              value={choices.references}
              onChange={r => setChoices(c => ({ ...c, references: r }))}
              onSkip={() => handleReferences(choices.references)}
            />
            <div className="step-actions">
              <button
                className="btn-next"
                onClick={() => handleReferences(choices.references)}
              >
                Voir mes recommandations ✨
              </button>
            </div>
          </>
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
            choices={choices}
            profile={profile}
            isQuickMode={isQuickMode}
            isSearching={isSearching}
            onRestart={handleRestart}
            onAction={handleAction}
            onUndo={handleUndo}
            onSatisfaction={handleSatisfaction}
            onSuggestOther={handleSuggestOther}
          />
        )}

        {/* ── PROFILE ── */}
        {step === 'profile' && (
          <ProfilePage
            profile={profile}
            onReset={resetProfile}
            onUpdatePreferences={updatePreferences}
          />
        )}

        {/* ── HISTORY ── */}
        {step === 'history' && (
          <HistoryPage profile={profile} allItems={ALL_ITEMS} />
        )}
      </main>

      {/* Bottom nav */}
      {showNav && (
        <Navigation
          currentStep={step}
          pseudo={profile.pseudo}
          onNavigate={goTo}
        />
      )}
    </div>
  );
}
