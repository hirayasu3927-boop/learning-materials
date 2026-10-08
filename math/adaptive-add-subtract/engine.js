// Teacher-authored policy and task state. An optional endpoint can replace only the
// bounded next-step decision; item content, correctness and safety limits stay here.
export const DEFAULT_CONFIG = { minQuestions: 6, maxQuestions: 20 };
const TYPES = ['target', 'plusNegative', 'minusPositive'];
const SKILLS = ['A', 'B', 'C', 'D', 'E'];
const bound = (n, a, b) => Math.max(a, Math.min(b, n));

export function initialState(config = DEFAULT_CONFIG) {
  return {
    config: { ...config }, count: 0, history: [],
    skills: Object.fromEntries(SKILLS.map(k => [k, '不明'])),
    evidence: Object.fromEntries(SKILLS.map(k => [k, { successes: 0, errors: 0 }])),
    support: { attention: true, rule: 3, transform: 2, meaning: false },
    lastRemoved: null, nextType: 'target', nextProbe: false,
    zeroTarget: 0, zeroContrast: { plusNegative: 0, minusPositive: 0 },
    prerequisiteConcern: false, calculationErrorStreak: 0,
    outcome: 'continue', reasonCode: 'START'
  };
}

export function makeProblem(state) {
  const type = state.nextType;
  const previous = state.history.at(-1)?.problem;
  const seed = state.count * 7 + (previous?.a ?? 1) * 3;
  let a = 3 + (seed % 6);
  let b = 1 + ((seed * 3 + 1) % 4);
  if (previous && a === previous.a && b === previous.b && type === previous.type) a = a === 8 ? 4 : a + 1;
  return { type, a, b, id: `${state.count + 1}-${type}-${a}-${b}` };
}

export function expression(p) {
  return `${p.a} ${p.type === 'plusNegative' ? '+' : '−'} (${p.type === 'minusPositive' ? '+' : '−'}${p.b})`;
}
export function transformed(p) {
  return `${p.a} ${p.type === 'target' ? '+' : '−'} ${p.b}`;
}
export function answer(p) { return p.a + (p.type === 'target' ? p.b : -p.b); }
export function correctSign(p) { return p.type === 'target' ? '+' : '−'; }
export function normalizedTransform(raw) {
  return String(raw).normalize('NFKC').replace(/[\s（）()]/g, '').replace(/[−ー―‐]/g, '-');
}
export function checkTransform(p, raw) {
  const s = normalizedTransform(raw);
  return s === normalizedTransform(transformed(p)) || s === normalizedTransform(`${p.a}${correctSign(p)}${p.b}`);
}

function setSkill(s, k, success) {
  const e = s.evidence[k];
  e[success ? 'successes' : 'errors']++;
  s.skills[k] = success
    ? e.successes >= 2 && e.errors === 0 ? '自立' : e.successes >= 2 ? 'ほぼ自立' : '不明'
    : e.errors >= 2 ? '支援が必要' : '不明';
}

function removeOne(s) {
  let removed = null;
  if (s.support.attention) { s.support.attention = false; removed = 'attention'; }
  else if (s.support.rule > 0) { s.support.rule--; removed = 'rule'; }
  else if (s.support.transform > 0) { s.support.transform--; removed = 'transform'; }
  s.lastRemoved = removed;
  return removed;
}
function restoreOne(s, focus) {
  if (focus === 'attention') s.support.attention = true;
  else if (focus === 'rule') s.support.rule = bound(s.support.rule + 1, 0, 3);
  else if (focus === 'transform') s.support.transform = bound(s.support.transform + 1, 0, 2);
  else s.support.attention = true;
}
const zeroSupport = s => !s.support.attention && s.support.rule === 0 && s.support.transform === 0;

export function localDecision(prior, event) {
  const s = structuredClone(prior);
  const { problem: p, transformCorrect, calculationCorrect, hintUsed, meaningUsed, elapsedMs } = event;
  const wasZero = zeroSupport(s) && !hintUsed && !meaningUsed;
  const correct = transformCorrect && calculationCorrect;
  const relevantRemoved = s.lastRemoved;
  s.count++;
  s.history.push({ problem: p, transformCorrect, calculationCorrect, hintUsed, meaningUsed,
    elapsedMs, support: { ...prior.support }, removedBefore: relevantRemoved });
  s.history = s.history.slice(-12);
  s.nextProbe = false;
  s.support.meaning = false;

  if (p.type === 'target') {
    if (!transformCorrect || (!prior.support.attention && !hintUsed)) setSkill(s, 'A', transformCorrect);
    if (!transformCorrect || (prior.support.rule === 0 && !hintUsed)) setSkill(s, 'B', transformCorrect);
    if (!transformCorrect || (prior.support.transform === 0 && !hintUsed)) setSkill(s, 'C', transformCorrect);
  } else if (!transformCorrect || wasZero) setSkill(s, 'E', transformCorrect);
  if (transformCorrect) setSkill(s, 'D', calculationCorrect);

  if (transformCorrect && !calculationCorrect) s.calculationErrorStreak++;
  else if (calculationCorrect) s.calculationErrorStreak = 0;
  if (s.calculationErrorStreak >= 2) s.prerequisiteConcern = true;

  if (correct && wasZero) {
    if (p.type === 'target') s.zeroTarget++;
    else s.zeroContrast[p.type]++;
  }
  if (!correct || hintUsed || meaningUsed) {
    if (p.type === 'target') s.zeroTarget = 0;
    else s.zeroContrast[p.type] = 0;
  }

  if (!transformCorrect) {
    if (p.type !== 'target') {
      s.support.attention = true;
      s.support.rule = Math.max(1, s.support.rule);
      s.nextType = p.type === 'plusNegative' ? 'minusPositive' : 'plusNegative';
      s.nextProbe = true;
      s.reasonCode = 'OVERGENERALIZATION_CHECK';
    } else {
      restoreOne(s, relevantRemoved || 'transform');
      s.nextType = 'target';
      s.nextProbe = true;
      s.support.meaning = s.evidence.C.errors >= 2;
      s.reasonCode = 'RESTORE_RELEVANT_SUPPORT';
    }
  } else if (!calculationCorrect) {
    s.nextType = 'target';
    s.nextProbe = true;
    s.reasonCode = s.prerequisiteConcern ? 'PREREQUISITE_CALCULATION' : 'CHECK_CALCULATION';
  } else if (hintUsed || meaningUsed) {
    s.nextType = 'target';
    s.reasonCode = 'RETRY_WITHOUT_HINT';
  } else if (!zeroSupport(s)) {
    removeOne(s);
    s.nextType = 'target';
    s.reasonCode = 'FADE_ONE_SUPPORT';
  } else if (s.zeroTarget < 2) {
    s.nextType = 'target';
    s.reasonCode = 'ZERO_SUPPORT_TARGET';
  } else if (s.zeroContrast.plusNegative < 1) {
    s.nextType = 'plusNegative';
    s.reasonCode = 'CONTRAST_PLUS_NEGATIVE';
  } else if (s.zeroContrast.minusPositive < 1) {
    s.nextType = 'minusPositive';
    s.reasonCode = 'CONTRAST_MINUS_POSITIVE';
  } else {
    s.nextType = 'target';
    s.reasonCode = 'STABILITY_CHECK';
  }

  const stable = s.zeroTarget >= 2 && s.zeroContrast.plusNegative >= 1 &&
    s.zeroContrast.minusPositive >= 1 && zeroSupport(s) && !s.prerequisiteConcern;
  if (s.count >= s.config.maxQuestions) {
    s.outcome = stable ? 'complete' : 'review';
    s.reasonCode = stable ? 'MAX_AND_STABLE' : 'MAX_REACHED';
  } else if (s.count >= s.config.minQuestions && stable) {
    s.outcome = 'complete';
    s.reasonCode = 'INDEPENDENT_AND_DISCRIMINATED';
  }
  return s;
}

// Optional backend adapter. The backend receives an event snapshot and returns a
// bounded decision object. No API secret is ever put in the browser.
export async function decideNext(prior, event) {
  const local = localDecision(prior, event);
  const endpoint = window.ADAPTIVE_DECISION_ENDPOINT || './api/decide';
  if (!endpoint || local.outcome !== 'continue') return local;
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, currentProblem: event.problem, event,
        recentHistory: local.history, skills: local.skills, support: prior.support,
        lastRemoved: prior.lastRemoved, localProposal: {
          nextProblemType: local.nextType, support: local.support,
          probe: local.nextProbe, reasonCode: local.reasonCode
        } })
    });
    if (!response.ok) throw new Error('decision unavailable');
    const proposal = await response.json();
    const next = proposal.support;
    const bounded = next && typeof next.attention === 'boolean' &&
      Number.isInteger(next.rule) && next.rule >= 0 && next.rule <= 3 &&
      Number.isInteger(next.transform) && next.transform >= 0 && next.transform <= 2 &&
      typeof next.meaning === 'boolean';
    const axes = ['attention', 'rule', 'transform'];
    const before = prior.support;
    const changed = bounded ? axes.filter(k => next[k] !== before[k]) : [];
    const oneStep = changed.length <= 1 && changed.every(k =>
      k === 'attention' || Math.abs(next[k] - before[k]) === 1);
    const madeError = !event.transformCorrect || !event.calculationCorrect;
    const noRemovalAfterError = !madeError || axes.every(k =>
      (k === 'attention' ? Number(next[k]) : next[k]) >=
      (k === 'attention' ? Number(before[k]) : before[k]));
    const relevantSupport = event.transformCorrect ||
      axes.every(k => (k === 'attention' ? Number(next[k]) : next[k]) >=
        (k === 'attention' ? Number(local.support[k]) : local.support[k]));
    const calculationOnly = event.transformCorrect && !event.calculationCorrect;
    const noSignInflation = !calculationOnly || axes.every(k => next[k] === before[k]);
    if (!bounded || !oneStep || !noRemovalAfterError || !relevantSupport || !noSignInflation)
      throw new Error('unsafe decision');
    local.support = { ...next };
    if (TYPES.includes(proposal.nextProblemType) &&
      (proposal.nextProblemType === 'target' ||
        (prior.zeroTarget >= 2 && !before.attention && before.rule === 0 && before.transform === 0)))
      local.nextType = proposal.nextProblemType;
    if (typeof proposal.probe === 'boolean') local.nextProbe = local.nextProbe || proposal.probe;
    // The fixed minimum, maximum, correct answers and verified exit remain local.
    local.reasonCode = 'API_DECISION';
  } catch { local.reasonCode += '_LOCAL_FALLBACK'; }
  return local;
}
