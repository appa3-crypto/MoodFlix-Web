// Vercel serverless function — moteur d'explication IA (Google Gemini)
// GEMINI_API_KEY est UNIQUEMENT accessible côté serveur (process.env)
// Elle n'est jamais envoyée au navigateur

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

const MOOD_LABELS: Record<string, string> = {
  'mind-bending': 'retourner le cerveau',
  scared:         'frissonner',
  laugh:          'rire',
  moved:          "s'émouvoir",
  escape:         "s'évader",
  surprised:      'être surpris',
};

interface ItemPayload {
  title:          string;
  type:           string;
  moods:          string[];
  tags:           string[];
  atmosphere:     string;
  mysteryScore:   number;
  fearScore:      number;
  emotionScore:   number;
  humorScore:     number;
  complexityScore:number;
  overview?:      string;
  voteAverage?:   number;
}

interface ExplainBody {
  item:                ItemPayload;
  mood:                string | null;
  pseudo:              string;
  preferredPlatforms:  string[];
  topMoods:            string[];
  likedTitles:         string[];
  dislikedTitles:      string[];
  spectatorArchetype:  string | null;
  satisfactionSummary: { loved: number; disappointed: number; badReasons: string[] };
  wantToWatchCount:    number;
}

function buildPrompt(b: ExplainBody): string {
  const moodNow  = b.mood ? (MOOD_LABELS[b.mood] ?? b.mood) : 'non précisée';
  const topMoods = b.topMoods.slice(0, 2).map(m => MOOD_LABELS[m] ?? m).join(', ') || 'aucune encore';
  const { item }  = b;

  const likedSection = b.likedTitles.length > 0
    ? `- Contenus appréciés : ${b.likedTitles.join(', ')}`
    : '- Historique : pas encore assez de données';

  const dislikedSection = b.dislikedTitles.length > 0
    ? `- Contenus refusés : ${b.dislikedTitles.join(', ')}`
    : '';

  const archetypeSection = b.spectatorArchetype
    ? `- Profil spectateur : ${b.spectatorArchetype}`
    : '';

  const badReasonsSection = b.satisfactionSummary.badReasons.length > 0
    ? `- Ce qu'il n'aime pas : ${b.satisfactionSummary.badReasons.join(', ')}`
    : '';

  return `Tu es MoodFlix IA, un système d'analyse cinématographique personnalisé.
Produis une explication analytique pour ${b.pseudo}, pas une reformulation de tags.

PROFIL DE ${b.pseudo} :
- Humeur ce soir : ${moodNow}
- Humeurs favorites : ${topMoods}
${archetypeSection}
${likedSection}
${dislikedSection}
${badReasonsSection}
- Avis positifs / négatifs : ${b.satisfactionSummary.loved} / ${b.satisfactionSummary.disappointed}

CONTENU À ANALYSER : "${item.title}" (${item.type === 'movie' ? 'film' : 'série'})
- Atmosphère : ${item.atmosphere}
- Scores : Mystère ${item.mysteryScore}/10, Émotion ${item.emotionScore}/10, Humour ${item.humorScore}/10, Peur ${item.fearScore}/10, Complexité ${item.complexityScore}/10
${item.overview ? `- Synopsis : ${item.overview.slice(0, 250)}` : ''}
${item.voteAverage ? `- Note TMDB : ${item.voteAverage.toFixed(1)}/10` : ''}

INSTRUCTIONS :
- Identifie les connexions réelles entre le profil de ${b.pseudo} et ce contenu
- Si ${b.pseudo} a aimé des œuvres similaires (${b.likedTitles.slice(0, 2).join(', ') || 'aucune encore'}), établis le parallèle précis
- Parle à la 2ème personne ("Tu as tendance à...", "Ce contenu partage avec...")
- Ne reformule PAS les tags : analyse les patterns émotionnels et narratifs
- Le risque doit être précis et personnalisé basé sur ses dislikes

FORMAT JSON REQUIS (aucun texte avant ou après) :
{
  "explanation": "analyse personnalisée max 150 caractères, directement adressée à ${b.pseudo}",
  "reasons": ["connexion analytique 1", "connexion analytique 2", "connexion analytique 3"],
  "riskLevel": "risque précis basé sur son profil (ex: Élevé — tu as signalé préférer les rythmes rapides)",
  "confidence": 0.85
}`;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'no_ai_key' });
  }

  const body = req.body as ExplainBody;
  if (!body?.item?.title) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  const prompt = buildPrompt(body);
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const apiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          parts: [{ text: 'Tu es MoodFlix IA. Réponds uniquement en JSON valide, sans markdown ni texte avant ou après.' }],
        },
        generationConfig: {
          maxOutputTokens:  400,
          temperature:      0.7,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      console.error('[explain] Gemini error:', err);
      return res.status(502).json({ error: 'upstream_error' });
    }

    const data = await apiRes.json();
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

    try {
      const parsed = JSON.parse(text);
      return res.status(200).json(parsed);
    } catch {
      console.error('[explain] JSON parse failed:', text);
      return res.status(502).json({ error: 'invalid_response' });
    }
  } catch (err) {
    console.error('[explain] Network error:', err);
    return res.status(500).json({ error: 'network_error' });
  }
}
