# MoodFlix V2

> Trouve quoi regarder ce soir en moins de 30 secondes — personnalisé selon ton profil local.

---

## Concept

MoodFlix est une application web qui te recommande des films ou séries selon ton humeur, tes plateformes, ton temps disponible et tes goûts. En V2, elle apprend de tes choix au fil du temps pour affiner ses suggestions.

**Pas de compte. Pas de backend. Pas d'API payante. Tout reste en local.**

---

## Lancement

```bash
npm install
npm run dev
```

Ouvre `http://localhost:5173` dans ton navigateur.

---

## Fonctionnement du profil local

Au premier lancement, MoodFlix te demande :

1. **Un pseudo** — pour personnaliser l'interface
2. **Tes plateformes** — Netflix, Prime Video, Disney+, Canal+

Ces informations sont stockées dans le `localStorage` de ton navigateur, clé `moodflix_profile_v2`. Aucune donnée ne quitte ton appareil.

### Ce que le profil mémorise

| Donnée | Description |
|--------|-------------|
| `pseudo` | Ton pseudo d'affichage |
| `preferredPlatforms` | Plateformes sélectionnées à l'inscription |
| `wantToWatchItems` | Contenus marqués "Ça me tente" |
| `seenItems` | Contenus marqués "Déjà vu" |
| `dislikedItems` | Contenus marqués "Pas mon style" |
| `tooLongItems` | Contenus marqués "Trop long" |
| `preferredType` | Type préféré (film/série/les deux) |
| `preferredDuration` | Durée préférée |
| `frequentMoods` | Compteur par humeur choisie |
| `satisfactionLog` | Avis post-visionnage (rating + raisons) |
| `recommendedHistory` | Historique des contenus déjà proposés (60 derniers) |

### Pages

- **Découvrir** — Flux de recommandations guidé en 5 étapes
- **Mode rapide** — "Je sais pas" → 2 questions → 3 suggestions
- **Historique** — Tes contenus classés par catégorie
- **Mon profil** — Stats, humeurs favorites, réinitialisation

---

## Fonctionnement du scoring

Le score de recommandation est calculé par `src/utils/recommendationEngine.ts`.

### Score de base (sans profil)

| Critère | Points |
|---------|--------|
| Humeur correspondante | +40 |
| Plateforme correspondante | +25 |
| Type correspondant (film/série) | +20 |
| Durée correspondante | +15 |
| Référence textuelle (tags/titre) | +10 par match, max 20 |

### Ajustements profil

| Situation | Impact |
|-----------|--------|
| Contenu déjà vu | Score → −1000 (exclu) |
| Contenu refusé ("Pas mon style") | Score → −500 (exclu) |
| Contenu marqué "Trop long" | −30 |
| ≥ 3 "Trop long" dans l'historique + contenu long | −12 à −20 |
| Plateforme préférée | +8 |
| Humeur fréquente (≥ 3 fois) | +5 |
| Raisons négatives post-visionnage | −4 à −6 selon le type |

---

## Anti-répétition et personnalisation

### Problème résolu

Sans mémoire entre les sessions, refaire exactement les mêmes choix donne exactement les mêmes résultats. MoodFlix V2 résout ça à plusieurs niveaux.

### Historique de recommandations (`recommendedHistory`)

Chaque contenu proposé est enregistré dans `profile.recommendedHistory` avec la date. Cet historique est plafonné à 60 entrées et persiste entre les sessions.

### Malus de répétition

Le moteur de scoring pénalise les contenus récemment vus :

| Délai depuis la dernière proposition | Pénalité |
|--------------------------------------|---------|
| Moins de 24h | −30 pts |
| 1 à 3 jours | −18 pts |
| 3 à 7 jours | −8 pts |
| Plus de 7 jours | Aucun |

### Bruit aléatoire (tie-breaking)

Quand deux contenus ont des scores très proches (écart < 10 pts), un bruit aléatoire de ±4 points est injecté lors du tri. Résultat : à humeur identique, l'ordre peut varier légèrement d'une recherche à l'autre.

### Slot "Découverte du soir"

Les 3 recommandations sont composées de :
- **2 top scores** — les meilleurs candidats pour tes critères
- **1 découverte** — le meilleur candidat parmi les contenus **non proposés dans les 7 derniers jours** (badge vert "🔍 Découverte du soir")

### "Me proposer autre chose"

Le bouton **🔀 Me proposer autre chose** sur la page résultats relance le calcul en excluant les IDs déjà proposés dans cette session, pour obtenir de nouvelles suggestions sans refaire tout le wizard.

### Skip plateforme

Si ton profil contient déjà des plateformes, l'étape plateforme est automatiquement sautée lors d'une nouvelle recherche. Un chip "Modifier" sur l'étape suivante te permet de les changer ponctuellement.

### Préférences éditables

La page Profil permet de modifier à tout moment : type préféré (film/série), durée préférée, et plateformes — avec prise d'effet immédiate sur la prochaine recherche.

---

## Ajouter une affiche dans recommendations.json

Chaque item du fichier `src/data/recommendations.json` accepte un champ optionnel `posterUrl`.

```json
{
  "id": 1,
  "title": "Dark",
  "posterUrl": "https://image.tmdb.org/t/p/w500/apud58kNgDNQ9VC3NExbBU4aUBk.jpg"
}
```

- Si `posterUrl` est absent ou si l'image ne charge pas, l'emoji `posterEmoji` s'affiche à la place.
- Les URLs TMDB (`https://image.tmdb.org/t/p/w500/{path}`) sont publiques et ne nécessitent pas de clé API.
- Pour trouver le chemin d'une affiche : cherche le film sur `themoviedb.org`, ouvre l'affiche, copie le chemin de l'URL.

---

## Architecture

```
src/
├── components/
│   ├── MoodSelector.tsx          # Sélection d'humeur (6 options)
│   ├── TypeSelector.tsx          # Film / Série / Peu importe
│   ├── TimeSelector.tsx          # Durée disponible
│   ├── PlatformSelector.tsx      # Plateformes de streaming
│   ├── ReferenceInput.tsx        # Films de référence (optionnel)
│   ├── RecommendationCard.tsx    # Carte résultat avec affiche + actions
│   ├── ResultsPage.tsx           # Page résultats
│   ├── ProgressBar.tsx           # Barre de progression wizard
│   ├── ProfileSetup.tsx          # Onboarding premier lancement
│   ├── Navigation.tsx            # Barre de navigation bas d'écran
│   ├── ProfilePage.tsx           # Page profil
│   ├── HistoryPage.tsx           # Historique par catégorie
│   └── SatisfactionModal.tsx     # Modal avis post-visionnage
├── hooks/
│   └── useUserProfile.ts         # Gestion du profil localStorage
├── services/
│   └── tmdbService.ts            # Service TMDB (mocké, prêt pour V3)
├── utils/
│   ├── scoring.ts                # Scoring V1 (conservé)
│   └── recommendationEngine.ts   # Scoring V2 avec profil
├── data/
│   └── recommendations.json      # 24 contenus curatés avec posterUrl
├── types.ts                      # Types TypeScript
├── App.tsx                       # Routeur principal
├── main.tsx                      # Point d'entrée React
└── index.css                     # Styles globaux (thème sombre premium)
```

---

## Prochaines évolutions

### V3 — API réelles
- **TMDB** — Vraies affiches, synopsis, notes, catalogue élargi
  → Activer dans `src/services/tmdbService.ts` avec `VITE_TMDB_API_KEY`
- **JustWatch** (via TMDB) — Disponibilité plateforme en temps réel

### V4 — Intelligence
- **IA explicative** (Claude / GPT) — Pourquoi ce contenu te correspond exactement
- **Matching sémantique** — Analyse des synopsis pour trouver des perles cachées
- **Clustering de goûts** — Détecter ton profil de spectateur automatiquement

### V5 — Contexte
- **Météo** — Suggestions adaptées à la météo du moment
- **Heure / jour** — Films légers en semaine, séries longues le weekend
- **Spotify** — Humeur musicale → recommandation cinématographique

### V6 — Social
- **Compte cloud** — Synchronisation multi-appareils
- **Partage** — Envoyer une recommandation à un ami
- **Co-watching** — Trouver un film qui convient à deux profils différents
