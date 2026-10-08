import { DEFAULT_CONFIG, initialState, makeProblem, expression, transformed,
  answer, correctSign, checkTransform, decideNext } from './engine.js';

const main = document.querySelector('#main');
const settings = document.querySelector('#settingsDialog');
const configKey = 'math003-adaptive-config-v1';
let config;
try {
  const stored = JSON.parse(localStorage.getItem(configKey));
  config = validConfig(stored) ? stored : { ...DEFAULT_CONFIG };
} catch { config = { ...DEFAULT_CONFIG }; }
let state = initialState(config);
let screen = 'intro';
let problem = null;
let phase = 'transform';
let startedAt = 0;
let usedHint = false;
let usedMeaning = false;
let transformCorrect = false;
let busy = false;

function validConfig(v) {
  return v && Number.isInteger(v.minQuestions) && Number.isInteger(v.maxQuestions) &&
    v.minQuestions >= 1 && v.maxQuestions <= 100 && v.minQuestions <= v.maxQuestions;
}
const el = (s) => { const d = document.createElement('div'); d.innerHTML = s; return d.firstElementChild; };
function set(html) { main.replaceChildren(el(html)); }
function steps(active) {
  const names = ['気づく', '式を直す', '計算する'];
  return `<div class="stepper" aria-label="学習の手順">${names.map((x,i) => `<span class="step ${i === active ? 'active' : i < active ? 'done' : ''}">${x}</span>`).join('')}</div>`;
}
function line() {
  const ticks = Array.from({length:8},(_,i)=>`<line x1="${36+i*54}" y1="93" x2="${36+i*54}" y2="108" stroke="#7899af" stroke-width="2"/><text x="${36+i*54}" y="130" text-anchor="middle" fill="#365a73" font-size="17">${i}</text>`).join('');
  return `<div class="numberline" role="img" aria-label="2から右へ3進んで5に着く数直線"><svg viewBox="0 0 460 152" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#1478ae"/></marker></defs><line x1="30" y1="94" x2="421" y2="94" stroke="#7295aa" stroke-width="3"/>${ticks}<circle cx="144" cy="94" r="8" fill="#15304c"/><path d="M144 73 Q225 2 306 73" fill="none" stroke="#1478ae" stroke-width="5" marker-end="url(#arrow)"/><text x="226" y="36" text-anchor="middle" fill="#1265aa" font-size="18" font-weight="700">右へ3</text><circle cx="306" cy="94" r="9" fill="#22a98e"/></svg></div>`;
}
function renderIntro() {
  screen = 'intro';
  set(`<section class="panel"><p class="eyebrow">中学数学 003</p><h1>今日できるようになること</h1><div class="goal-flow"><span class="math">2 − (−3)</span><span class="flow-arrow">→</span><span class="math">2 ＋ 3</span><span class="flow-arrow">→</span><span class="math">5</span></div><p class="lead">式を直してから、答えを出そう。</p><div class="actions"><button class="primary" id="start">はじめる</button></div></section>`);
  document.querySelector('#start').onclick = renderMeaning;
}
function renderMeaning() {
  screen = 'meaning';
  set(`<section class="panel"><p class="eyebrow">まず、意味を見てみよう</p><h1>2 − (−3) はどう動く？</h1><div class="meaning-grid">${line()}<div class="meaning-copy"><p>2から、<strong>−3をひく</strong>。</p><p>「左へ3」という動きを取り消すと、<strong>右へ3</strong>進む。</p><p>着く場所は <strong>5</strong>。</p></div></div><div class="bridge"><div class="math">2 − (−3) → 2 ＋ 3 → 5</div><div>「−をひく」とき、足す式に直せる。<br>覚え方は「マイ・マイ・プラ」。</div></div><div class="actions"><button id="practice" class="primary">問題に進む</button></div></section>`);
  document.querySelector('#practice').onclick = () => beginProblem();
}
function beginProblem() {
  screen = 'practice'; phase = 'transform'; usedHint = false; usedMeaning = false;
  transformCorrect = false; problem = makeProblem(state); startedAt = performance.now();
  renderPractice();
}
function displayExpression(p, highlight) {
  if (!highlight) return expression(p);
  if (p.type === 'target') return `${p.a} <span class="focus-sign">− (−</span>${p.b})`;
  if (p.type === 'plusNegative') return `${p.a} <span class="focus-sign">＋ (−</span>${p.b})`;
  return `${p.a} <span class="focus-sign">− (＋</span>${p.b})`;
}
function ruleText(p, level) {
  if (!level) return '';
  if (p.type !== 'target') return '「−をひく」形かどうかを見てみよう。';
  return ['','− 引く − は？','マイ・マイ・？','− 引く − だから、マイ・マイ・プラ！'][level];
}
function transformControls() {
  if (state.support.transform === 2) return `<div class="equation-box math"><span>${problem.a}</span><span>□</span><span>${problem.b}</span></div><p class="instruction">□ に入る記号を選ぼう</p><div class="choice-row"><button class="choice" data-sign="+">＋</button><button class="choice" data-sign="-">−</button></div>`;
  if (state.support.transform === 1) return `<p class="instruction">直した式の記号を書こう</p><div class="equation-box math"><span>${problem.a}</span><input id="signInput" aria-label="直した式の記号" maxlength="1" autocomplete="off" inputmode="text" placeholder="?"/><span>${problem.b}</span></div><div class="actions"><button class="primary" id="submitSign">確かめる</button></div>`;
  return `<p class="instruction">式を直して書こう</p><p class="small muted">例：4＋2</p><input id="transformInput" class="answer-input math" aria-label="直した式" autocomplete="off" autocapitalize="off" spellcheck="false"/><div class="actions"><button class="primary" id="submitTransform">確かめる</button></div>`;
}
function renderPractice() {
  const highlight = state.support.attention && phase === 'transform';
  const note = phase === 'transform' ? ruleText(problem, state.support.rule) : '';
  const meaning = state.support.meaning && problem.type === 'target' && phase === 'transform'
    ? `<div class="bridge">2 − (−3) → 2 ＋ 3。左への動きを取り消すと、右へ進む。</div>` : '';
  set(`<section class="panel"><div class="problem-header"><span>正負の数</span><span>${state.count + 1}問目</span></div>${steps(phase === 'transform' ? 1 : 2)}<div class="question math">${displayExpression(problem,highlight)}</div>${meaning}${note ? `<div class="rule-note">${note}</div>` : ''}<div id="workArea">${phase === 'transform' ? transformControls() : `<p class="instruction">計算しよう</p><div class="preview-equation math">${transformed(problem)}</div><input id="answerInput" class="answer-input math" aria-label="答え" type="number" inputmode="numeric"/><div class="actions"><button class="primary" id="submitAnswer">答えを確かめる</button></div>`}</div><div class="hint-row"><button id="showHint" class="secondary">ヒントを見る</button>${problem.type === 'target' ? `<button id="showMeaning" class="secondary">数直線を見る</button>` : ''}</div><div id="extraHint"></div></section>`);
  document.querySelectorAll('[data-sign]').forEach(b => b.onclick = () => submitTransform(`${problem.a}${b.dataset.sign}${problem.b}`));
  const signInput = document.querySelector('#signInput');
  if (signInput) { document.querySelector('#submitSign').onclick = () => submitTransform(`${problem.a}${signInput.value}${problem.b}`); signInput.onkeydown = e => {if(e.key === 'Enter') document.querySelector('#submitSign').click()}; }
  const transInput = document.querySelector('#transformInput');
  if (transInput) {document.querySelector('#submitTransform').onclick = () => submitTransform(transInput.value); transInput.onkeydown = e => {if(e.key === 'Enter') document.querySelector('#submitTransform').click()};}
  const answerInput = document.querySelector('#answerInput');
  if (answerInput) {document.querySelector('#submitAnswer').onclick = submitAnswer; answerInput.onkeydown = e => {if(e.key === 'Enter') submitAnswer()};}
  document.querySelector('#showHint').onclick = () => {
    usedHint = true;
    document.querySelector('#extraHint').innerHTML = `<div class="feedback try">${problem.type === 'target' ? '「−をひく」から、＋で表せるよ。' : '「−をひく」形かな？ それぞれの記号を見よう。'}</div>`;
  };
  const meaningButton = document.querySelector('#showMeaning');
  if (meaningButton) meaningButton.onclick = () => {
    usedMeaning = true;
    document.querySelector('#extraHint').innerHTML = `${line()}<p class="small muted">2 − (−3) は、2から右へ3進む動き。</p>`;
  };
  (transInput || signInput || answerInput)?.focus();
}
function submitTransform(raw) {
  if (busy || !String(raw).trim()) return;
  transformCorrect = checkTransform(problem,raw);
  if (transformCorrect) { phase = 'calculate'; renderPractice(); }
  else finishQuestion(false);
}
function submitAnswer() {
  if (busy) return;
  const raw = document.querySelector('#answerInput').value;
  if (raw.trim() === '') return;
  finishQuestion(Number(raw) === answer(problem));
}
async function finishQuestion(calculationCorrect) {
  if (busy) return;
  busy = true;
  const event = { problem, transformCorrect, calculationCorrect,
    hintUsed: usedHint, meaningUsed: usedMeaning,
    elapsedMs: Math.round(performance.now() - startedAt) };
  state = await decideNext(state,event);
  busy = false;
  renderFeedback(event);
}
function renderFeedback(event) {
  screen = 'feedback';
  const ok = event.transformCorrect && event.calculationCorrect;
  const diagnosis = !event.transformCorrect
    ? problem.type === 'target' ? '「−をひく」形をもう一度見よう。' : 'この問題は「−をひく」形ではないね。'
    : !event.calculationCorrect ? '式は直せたよ。計算をもう一度確かめよう。' : '式も答えも合っているよ。';
  const next = state.outcome === 'continue' ? '次の問題' : '結果を見る';
  set(`<section class="panel"><p class="eyebrow">${state.count}問目</p><h1>${ok ? 'できた！' : 'ここを確かめよう'}</h1><div class="goal-flow"><span class="math">${expression(problem)}</span><span class="flow-arrow">→</span><span class="math">${transformed(problem)}</span><span class="flow-arrow">→</span><span class="math">${answer(problem)}</span></div><div class="feedback ${ok ? 'good' : 'try'}">${diagnosis}</div><div class="actions"><button id="next" class="primary">${next}</button></div></section>`);
  document.querySelector('#next').onclick = () => state.outcome === 'continue' ? beginProblem() : renderEnd();
}
function renderEnd() {
  screen = 'end';
  const done = state.outcome === 'complete';
  set(`<section class="panel"><p class="eyebrow">中学数学 003</p><h1>${done ? 'Web教材クリア' : 'ここでいったん区切ろう'}</h1>${done ? `<p class="lead">式を自分で直して、計算できたね。<br>次は紙のプリントで練習しよう。</p>` : `<p class="lead">取り組んだところまでを確認しよう。</p><div class="summary"><p>${state.prerequisiteConcern ? '式は直せているので、計算の部分を先生と確認しよう。' : '難しかったところを、もう一度見てみよう。'}</p></div>`}<div class="actions">${done ? '' : '<button id="reviewMeaning" class="secondary">もう一度説明を見る</button><button id="teacher" class="primary">先生と確認する</button>'}<button id="restart" class="secondary">最初から取り組む</button></div><div id="teacherMessage"></div></section>`);
  document.querySelector('#restart').onclick = restart;
  const review = document.querySelector('#reviewMeaning'); if (review) review.onclick = renderMeaning;
  const teacher = document.querySelector('#teacher'); if (teacher) teacher.onclick = () => {
    document.querySelector('#teacherMessage').innerHTML = `<div class="feedback good">先生と一緒に、式を直すところと計算するところを確認しよう。</div>`;
  };
}
function restart() { state = initialState(config); problem = null; renderIntro(); }
document.querySelector('#homeButton').onclick = restart;
document.querySelector('#settingsButton').onclick = () => {
  document.querySelector('#minQuestions').value = config.minQuestions;
  document.querySelector('#maxQuestions').value = config.maxQuestions;
  document.querySelector('#settingsError').textContent = '';
  document.querySelector('#engineStatus').textContent = '接続状態を確認中…';
  document.querySelector('#teacherState').innerHTML = `<dl><dt>注意 A</dt><dd>${state.skills.A}</dd><dt>想起 B</dt><dd>${state.skills.B}</dd><dt>式変換 C</dt><dd>${state.skills.C}</dd><dt>計算 D</dt><dd>${state.skills.D}</dd><dt>使い分け E</dt><dd>${state.skills.E}</dd><dt>現在の問題数</dt><dd>${state.count}</dd></dl>`;
  settings.showModal();
  fetch('./api/decide', {method:'GET'}).then(r => r.json()).then(data => {
    document.querySelector('#engineStatus').textContent = data.available ? 'API判定が利用できます。通信できない場合は教材内の判定へ切り替えます。' : '現在は教材内のルール判定で動作中。';
  }).catch(() => { document.querySelector('#engineStatus').textContent = '現在は教材内のルール判定で動作中。'; });
};
document.querySelector('#saveSettings').onclick = () => {
  const next = {minQuestions:Number(document.querySelector('#minQuestions').value),maxQuestions:Number(document.querySelector('#maxQuestions').value)};
  if (!validConfig(next)) {document.querySelector('#settingsError').textContent = '最低1問、最大100問の範囲で、最低問題数が最大問題数以下になるよう設定してください。';return;}
  config = next; localStorage.setItem(configKey,JSON.stringify(config)); settings.close();
};
renderIntro();
