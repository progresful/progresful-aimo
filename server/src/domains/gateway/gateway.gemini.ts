// One place for Gemini calls: model, thinking level and timeout come from env.
// Used for structured extraction only (policy text → rules, request → order
// lines); results are always checked against our own catalog and engine.

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export const geminiModel = () => process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

// Extraction needs little reasoning: keep thinking low for latency. Gemini 3
// models take a level; 2.5 models take a token budget.
const thinkingConfig = (model: string) => {
  const level = process.env.GEMINI_THINKING || 'low';
  return model.startsWith('gemini-2.5') ? { thinkingBudget: level === 'high' ? -1 : 0 } : { thinkingLevel: level };
};

/** Asks Gemini for JSON matching `schema`; throws on HTTP errors or unparseable output. */
export const geminiJson = async <T>(prompt: string, schema: object, timeoutMs = 20_000): Promise<T> => {
  const model = geminiModel();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, thinkingConfig: thinkingConfig(model) },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Gemini ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}') as T;
};
