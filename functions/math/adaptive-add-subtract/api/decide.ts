

const types = ['target', 'plusNegative', 'minusPositive'] as const;
const reasons = [
  'FADE_ONE_SUPPORT', 'RETRY_WITHOUT_HINT', 'RESTORE_RELEVANT_SUPPORT',
  'OVERGENERALIZATION_CHECK', 'CHECK_CALCULATION', 'PREREQUISITE_CALCULATION',
  'ZERO_SUPPORT_TARGET', 'CONTRAST_PLUS_NEGATIVE', 'CONTRAST_MINUS_POSITIVE',
  'STABILITY_CHECK'
] as const;

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    nextProblemType: { type: 'string', enum: types },
    support: {
      type: 'object', additionalProperties: false,
      properties: {
        attention: { type: 'boolean' },
        rule: { type: 'integer', minimum: 0, maximum: 3 },
        transform: { type: 'integer', minimum: 0, maximum: 2 },
        meaning: { type: 'boolean' }
      },
      required: ['attention', 'rule', 'transform', 'meaning']
    },
    probe: { type: 'boolean' },
    reasonCode: { type: 'string', enum: reasons }
  },
  required: ['nextProblemType', 'support', 'probe', 'reasonCode']
} as const;

function validInput(x: any) {
  const p = x?.currentProblem;
  const e = x?.event;
  const proposal = x?.localProposal;
  return x?.version === 1 && p && types.includes(p.type) &&
    Number.isInteger(p.a) && p.a >= 0 && p.a <= 20 &&
    Number.isInteger(p.b) && p.b >= 1 && p.b <= 20 &&
    e && typeof e.transformCorrect === 'boolean' &&
    typeof e.calculationCorrect === 'boolean' &&
    typeof e.hintUsed === 'boolean' && typeof e.meaningUsed === 'boolean' &&
    Number.isFinite(e.elapsedMs) && e.elapsedMs >= 0 &&
    Array.isArray(x.recentHistory) && x.recentHistory.length <= 12 &&
    x.skills && x.support && proposal && types.includes(proposal.nextProblemType) &&
    proposal.support && typeof proposal.probe === 'boolean';
}

export async function onRequestGet(context: {env: Record<string, string>}) {
  const env = context.env;
  return Response.json({ available: Boolean(env.OPENAI_API_KEY) },
    { headers: { 'Cache-Control': 'no-store' } });
}

export async function onRequestPost(context: {request: Request, env: Record<string, string>}) {
  const {request, env} = context;
  const key = env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: 'api_not_configured' }, { status: 503 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: 'origin' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 18000)
    return Response.json({ error: 'too_large' }, { status: 413 });

  let input: any;
  try { input = await request.json(); } catch { return Response.json({ error: 'json' }, { status: 400 }); }
  if (!validInput(input)) return Response.json({ error: 'invalid_input' }, { status: 400 });

  // Send only bounded task data. Names and learner identifiers are never included.
  const current = {
    problem: input.currentProblem,
    result: {
      transformCorrect: input.event.transformCorrect,
      calculationCorrect: input.event.calculationCorrect,
      hintUsed: input.event.hintUsed,
      meaningUsed: input.event.meaningUsed,
      elapsedMs: Math.min(120000, Math.round(input.event.elapsedMs))
    },
    recentHistory: input.recentHistory.slice(-6).map((h: any) => ({
      type: types.includes(h?.problem?.type) ? h.problem.type : 'target',
      transformCorrect: Boolean(h?.transformCorrect),
      calculationCorrect: Boolean(h?.calculationCorrect),
      hintUsed: Boolean(h?.hintUsed),
      removedBefore: ['attention','rule','transform'].includes(h?.removedBefore) ? h.removedBefore : null
    })),
    skills: Object.fromEntries(['A','B','C','D','E'].map(k => [k, String(input.skills[k] || '不明').slice(0, 12)])),
    supportBefore: input.support,
    lastRemoved: ['attention','rule','transform'].includes(input.lastRemoved) ? input.lastRemoved : null,
    localProposal: input.localProposal
  };

  const instructions = `You decide the next scaffold in a Japanese middle-school math lesson on signed-number addition/subtraction. Return only the requested structured decision.\n\nTeacher policy: A=notice the operator and sign, B=recall only subtraction of a negative becomes addition, C=transform the expression, D=calculate the transformed expression, E=distinguish 4−(−2), 4＋(−2), 4−(＋2). Do not overgeneralize from two minus signs. Begin with success, fade one scaffold at a time. An error after a removal suggests restoring just that scaffold; one error alone is not proof. A calculation error after a correct transformation calls for a calculation probe, not extra sign scaffolds. Repeated contrast errors call for noticing the operator and bracket sign. Meaning help is a prewritten number-line view, not generated text. Never generate problems or explanations.\n\nChoose only from the supplied types and support strengths. Use localProposal as a safe baseline. Keep or change at most one scaffold axis from supportBefore when successful. When incorrect, do not remove support. Do not decide completion; the application enforces minimum, maximum, zero-support stability and prerequisite-skill review. Prefer the baseline when evidence is ambiguous.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || 'gpt-4o-mini',
        store: false,
        max_output_tokens: 220,
        input: [
          { role: 'system', content: instructions },
          { role: 'user', content: JSON.stringify(current) }
        ],
        text: { format: { type: 'json_schema', name: 'next_scaffold', strict: true, schema } }
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return Response.json({ error: 'model_unavailable' }, { status: 502 });
    const data: any = await response.json();
    const content = data.output?.flatMap((item: any) => item.content || [])
      .find((item: any) => item.type === 'output_text')?.text;
    if (!content) return Response.json({ error: 'empty_decision' }, { status: 502 });
    const decision = JSON.parse(content);
    if (!types.includes(decision.nextProblemType) || !reasons.includes(decision.reasonCode))
      return Response.json({ error: 'invalid_decision' }, { status: 502 });
    return Response.json(decision, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'decision_unavailable' }, { status: 502 });
  }
}
