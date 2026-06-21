// Vercel serverless function — moteur d'explication IA
// AI_API_KEY est UNIQUEMENT accessible côté serveur (process.env)
// Elle n'est jamais envoyée au navigateur

const AI_API_KEY     = process.env.AI_API_KEY ?? '';
const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages';
const MODEL          = 'claude-haiku-4-5-20251001';

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
  satisfactionSummary: { loved: number; disappointed: number; badReasons: string[] };
  wantToWatchCount:    number;
}

function buildPrompt(b: ExplainBody): string {
  const moodNow  = b.mood ? (MOOD_LABELS[b.mood] ?? b.mood) : 'non précisée';
  const topMoods = b.topMoods.slice(0, 2).map(m => MOOD_LABELS[m] ?? m).join(', ') || 'aucune encore';
  const { item }  = b;

  return `Tu es MoodFlix IA. Explique en français pourquoi "${item.title}" correspond à ${b.pseudo} ce soir.

Profil :
- Humeur du moment : ${moodNow}
- Humeurs favorites : ${topMoods}
- Contenus en liste "ça me tente" : ${b.wantToWatchCount}
- Avis positifs / négatifs : ${b.satisfactionSummary.loved} / ${b.satisfactionSummary.disappointed}
${b.satisfactionSummary.badReasons.length > 0 ? `- Ce qu'il n'aime pas : ${b.satisfactionSummary.badReasons.join(', ')}` : ''}

Contenu :
- "${item.title}" (${item.type === 'movie' ? 'film' : 'série'})
- Tags : ${item.tags.join(', ')}
- Atmosphère : ${item.atmosphere}
- Scores : Mystère ${item.mysteryScore}/10, Émotion ${item.emotionScore}/10, Humour ${item.humorScore}/10, Peur ${item.fearScore}/10, Complexité ${item.complexityScore}/10
${item.overview ? `- Synopsis : ${item.overview.slice(0, 200)}` : ''}
${item.voteAverage ? `- Note TMDB : ${item.voteAverage.toFixed(1)}/10` : ''}

Génère une explication personnalisée. Réponds UNIQUEMENT en JSON valide (aucun texte avant ou après) :
{
  "explanation": "phrase engageante max 130 caractères qui s'adresse directement à ${b.pseudo}",
  "reasons": ["raison concise 1", "raison concise 2", "raison concise 3"],
  "riskLevel": "risque de déception court (ex: Faible — si tu aimes les films lents)",
  "confidence": 0.8
}`;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  if (!AI_API_KEY) {
    return res.status(503).json({ error: 'no_ai_key' });
  }

  const body = req.body as ExplainBody;
  if (!body?.item?.title) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  const prompt = buildPrompt(body);

  try {
    const apiRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         AI_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 400,
        system:     'Tu es MoodFlix IA. Réponds uniquement en JSON valide, sans markdown ni texte avant ou après.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      console.error('[explain] Anthropic error:', err);
      return res.status(502).json({ error: 'upstream_error' });
    }

    const data   = await apiRes.json();
    const text   = (data?.content?.[0]?.text ?? '').trim();

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
