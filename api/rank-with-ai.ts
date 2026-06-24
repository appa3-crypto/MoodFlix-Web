// Vercel serverless function — re-ranking IA (Google Gemini)
// GEMINI_API_KEY est UNIQUEMENT accessible côté serveur (process.env)
// Elle n'est jamais envoyée au navigateur

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

interface Candidate {
  id:        number;
  title:     string;
  type:      string;
  intent:    string;
  moods:     string[];
  tags:      string[];
  duration:  string;
  platforms: string[];
  synopsis:  string;
  localScore: number;
  scores:    { humour: number; peur: number; émotion: number; mystère: number; complexité: number };
}

interface RankBody {
  mood:       string;
  moodLabel:  string;
  type:       string;
  duration:   string;
  platforms:  string[];
  candidates: Candidate[];
  profile: {
    pseudo:             string;
    topMoods:           string[];
    likedTitles:        string[];
    dislikedTitles:     string[];
    seenCount:          number;
    preferredPlatforms: string[];
    badReasons:         string[];
  };
}

function buildPrompt(b: RankBody): string {
  const pseudo     = b.profile.pseudo;
  const moodLabel  = b.moodLabel;
  const platforms  = b.platforms.filter(p => p !== 'any').join(', ') || 'toutes';

  const profileSection = [
    b.profile.topMoods.length     ? `- Humeurs fréquentes : ${b.profile.topMoods.join(', ')}` : '',
    b.profile.likedTitles.length  ? `- Contenus appréciés : ${b.profile.likedTitles.join(', ')}` : '',
    b.profile.dislikedTitles.length ? `- Contenus rejetés : ${b.profile.dislikedTitles.join(', ')}` : '',
    b.profile.badReasons.length   ? `- Ce qu'il n'aime pas : ${b.profile.badReasons.join(', ')}` : '',
    `- Déjà vu : ${b.profile.seenCount} contenus`,
  ].filter(Boolean).join('\n');

  const candidatesSection = b.candidates.map((c, i) =>
    `${i + 1}. [ID:${c.id}] "${c.title}" (${c.type === 'movie' ? 'film' : 'série'})
   Intention : ${c.intent} | Tags : ${c.tags.slice(0, 4).join(', ')}
   Scores — humour:${c.scores.humour} peur:${c.scores.peur} émotion:${c.scores.émotion} mystère:${c.scores.mystère}
   Score local : ${c.localScore}
   Synopsis : ${c.synopsis.slice(0, 150)}`
  ).join('\n\n');

  return `Tu es MoodFlix IA, un expert cinéma et séries.
Tu dois choisir et ordonner les meilleurs contenus pour ${pseudo}.

DEMANDE DE ${pseudo} :
- Humeur : ${moodLabel} (mood: ${b.mood})
- Type : ${b.type === 'movie' ? 'film' : b.type === 'series' ? 'série' : 'film ou série'}
- Durée : ${b.duration}
- Plateformes : ${platforms}

PROFIL DE ${pseudo} :
${profileSection}

CANDIDATS À CLASSER (${b.candidates.length} options) :
${candidatesSection}

RÈGLES STRICTES :
1. Si l'humeur est "rire", classe en premier les VRAIES comédies (humour ≥ 7, intention = comédie pure ou divertissement léger).
   Ne place PAS un thriller ou un drame émotionnel en premier même s'il a une touche d'humour.
   "La La Land" n'est pas une recommandation rire — c'est un drame musical.
   "Forrest Gump" n'est pas une recommandation rire — c'est un feel-good émotionnel.
   "Knives Out" n'est une recommandation rire que si aucune vraie comédie n'est disponible.

2. Si l'humeur est "suspense/scared", classe en premier les thrillers et films d'horreur.
   Pas de comédie romantique en top 3.

3. Si l'humeur est "émotion/moved", classe en premier les drames et romances émouvantes.
   Un film Marvel peut figurer si son score émotion est ≥ 7, sinon non.

4. Si l'humeur est "réfléchir/mind-bending", classe en premier les films complexes, mystérieux ou à twists.
   Pas de comédie simple en top 3.

5. Si l'humeur est "évasion/escape", classe en premier les films d'action ou d'aventure.
   Évite les drames purs sans rythme.

6. Respecte les contenus déjà rejetés par ${pseudo} — ne les place pas en top 3.

7. Réponds UNIQUEMENT en JSON valide (aucun texte avant ou après) :
{
  "rankedIds": [id1, id2, id3, id4, id5],
  "reasons": {
    "id1": "raison courte (max 80 chars)",
    "id2": "raison courte",
    "id3": "raison courte"
  }
}

Les IDs dans "rankedIds" doivent correspondre exactement aux IDs des candidats.
Inclus au moins 3 IDs, au maximum ${b.candidates.length} IDs.`;
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

  const body = req.body as RankBody;
  if (!body?.candidates?.length) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  const prompt     = buildPrompt(body);
  const geminiUrl  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const apiRes = await fetch(geminiUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          parts: [{ text: 'Tu es MoodFlix IA. Réponds uniquement en JSON valide, sans markdown ni texte avant ou après. Les IDs doivent être des nombres entiers.' }],
        },
        generationConfig: {
          maxOutputTokens:  500,
          temperature:      0.3,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      console.error('[rank-with-ai] Gemini error:', err);
      return res.status(502).json({ error: 'upstream_error' });
    }

    const data = await apiRes.json();
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

    try {
      const parsed = JSON.parse(text) as { rankedIds?: unknown[]; reasons?: Record<string, string> };

      // Validation : les IDs doivent être des nombres présents dans les candidats
      const validIds = new Set(body.candidates.map(c => c.id));
      const rankedIds = (parsed.rankedIds ?? [])
        .map(id => Number(id))
        .filter(id => validIds.has(id));

      if (rankedIds.length === 0) {
        console.error('[rank-with-ai] No valid IDs in response:', text);
        return res.status(200).json({ rankedIds: body.candidates.map(c => c.id), reasons: {} });
      }

      return res.status(200).json({ rankedIds, reasons: parsed.reasons ?? {} });
    } catch {
      console.error('[rank-with-ai] JSON parse failed:', text);
      // Fallback propre : retourne l'ordre local
      return res.status(200).json({ rankedIds: body.candidates.map(c => c.id), reasons: {} });
    }
  } catch (err) {
    console.error('[rank-with-ai] Network error:', err);
    return res.status(500).json({ error: 'network_error' });
  }
}
