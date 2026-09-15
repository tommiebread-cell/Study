/**
 * Tools for the structural notes: the panel grid, the Nickell calculator, the
 * instrument counter and the estimator chooser.
 */

import { drawPanel } from '../sim/gmm.js';
import { Rng, randomSeed } from '../sim/rng.js';
import { qs, verdict } from './dom.js';

/* ------------------------------------------------------------------ grid ---- */

const GRID_T = 6;
const GRID_UNITS = 4;

export function grid(slot) {
  let mode = 'levels';
  let target = 4;
  let showNumbers = false;
  let panel = null;

  slot.innerHTML = `
    <div class="ctl" role="group" aria-label="Grid view">
      <button class="btn on" data-mode="levels">Raw levels</button>
      <button class="btn" data-mode="diff">First differences</button>
      <button class="btn" data-mode="iv">Instruments at t</button>
      <button class="btn" data-mode="sys">System GMM</button>
    </div>
    <div class="ctl">
      <button class="btn" data-numbers aria-pressed="false">Show real numbers</button>
      <button class="btn" data-resample hidden>Resample panel</button>
      <span class="ctl tight" data-periods hidden role="group" aria-label="Period"></span>
    </div>
    <div class="scroll"><table class="pg"></table></div>
    <div class="lgnd">
      <span><i class="sw-dep"></i>left-hand side</span>
      <span><i class="sw-reg"></i>regressor</span>
      <span><i class="sw-iv"></i>valid instrument</span>
      <span><i class="sw-mu"></i>still holds μ<sub>i</sub></span>
    </div>
    <div class="vd nu" data-say></div>`;

  const $ = qs(slot);
  const table = $('table');
  const periods = $('[data-periods]');
  const say = $('[data-say]');

  periods.innerHTML = [3, 4, 5, 6]
    .map((t) => `<button class="btn" data-period="${t}">t = ${t}</button>`).join('');

  const resample = () => { panel = drawPanel(GRID_UNITS, GRID_T, 0.6, 1, new Rng(randomSeed())); };
  const cell = (unit, t) => (panel ? panel[unit][t - 1] : 0);
  const show = (v) => (v >= 0 ? ' ' : '') + v.toFixed(1);
  const level = (unit, t) => (showNumbers ? show(cell(unit, t)) : `y<sub>${t}</sub>`);
  const change = (unit, t) => (showNumbers ? show(cell(unit, t) - cell(unit, t - 1)) : `Δy<sub>${t}</sub>`);

  function rowsForPanelViews() {
    let html = '';
    for (let unit = 1; unit <= GRID_UNITS; unit++) {
      html += `<tr><th scope="row">i=${unit}</th>`;
      for (let t = 1; t <= GRID_T; t++) {
        if (mode === 'levels') html += `<td class="mu">${level(unit - 1, t)}</td>`;
        else if (t === 1) html += `<td class="gone">${level(unit - 1, 1)}</td>`;
        else html += `<td>${change(unit - 1, t)}</td>`;
      }
      html += '</tr>';
    }
    return html;
  }

  function rowsForInstrumentViews() {
    let html = `<tr><th scope="row">levels${showNumbers ? ' (i=1)' : ''}</th>`;
    for (let t = 1; t <= GRID_T; t++) {
      let klass = 'mu';
      if (t <= target - 2) klass = 'iv';
      if (mode === 'sys' && t === target) klass = 'dep';
      if (mode === 'sys' && t === target - 1) klass = 'reg';
      html += `<td class="${klass}">${level(0, t)}</td>`;
    }

    html += '</tr><tr><th scope="row">differences</th>';
    for (let t = 1; t <= GRID_T; t++) {
      if (t === 1) { html += '<td class="gone">—</td>'; continue; }
      let klass = '';
      if (t === target) klass = 'dep';
      else if (t === target - 1) klass = mode === 'sys' ? 'both' : 'reg';
      const title = klass === 'both' ? ' title="regressor above, instrument below"' : '';
      html += `<td class="${klass}"${title}>${change(0, t)}</td>`;
    }
    return `${html}</tr>`;
  }

  function explain() {
    const available = target - 2;
    const uncollapsed = ((GRID_T - 1) * (GRID_T - 2)) / 2;
    const live = showNumbers && panel;

    if (mode === 'levels') {
      return `<span class="m">y<sub>it</sub> = ρ y<sub>i,t−1</sub> + X<sub>it</sub>β + μ<sub>i</sub> + u<sub>it</sub></span><br>
        Every cell in a row carries the same μ<sub>i</sub>, and so does the lag on the right.
        ${live
          ? 'Look down a row: the level each unit hovers around is its own fixed effect, and pooled OLS reads that as persistence.'
          : 'Pooled OLS absorbs it and pushes ρ̂ up; fixed effects drags it down.'}`;
    }

    if (mode === 'diff') {
      return `<span class="m">Δy<sub>it</sub> = ρ Δy<sub>i,t−1</sub> + ΔX<sub>it</sub>β + Δu<sub>it</sub></span><br>
        μ<sub>i</sub> is gone and t = 1 goes with it.
        ${live
          ? 'The row levels have vanished; what is left is comparable across units.'
          : 'Δu<sub>it</sub> now overlaps Δu<sub>i,t−1</sub> through u<sub>i,t−1</sub>.'}`;
    }

    if (mode === 'iv') {
      const values = live
        ? ` For unit 1 those values are ${Array.from({ length: available },
          (_, j) => `y<sub>${j + 1}</sub> = ${show(cell(0, j + 1)).trim()}`).join(', ')}.`
        : '';
      return `<span class="m">Δy<sub>i,${target}</sub> = ρ Δy<sub>i,${target - 1}</sub> + … + Δu<sub>i,${target}</sub></span><br>
        Levels y<sub>i,1</sub> … y<sub>i,${target - 2}</sub> are clear of Δu<sub>i,${target}</sub>:
        <b>${available}</b> instrument${available === 1 ? '' : 's'} here,
        ${uncollapsed} across t = 3 … ${GRID_T} uncollapsed.${values}`;
    }

    const shared = live
      ? ` — the same number, ${show(cell(0, target - 1) - cell(0, target - 2)).trim()}, doing both jobs`
      : '';
    return `<span class="m">Δy<sub>i,${target}</sub> = … &nbsp;·&nbsp; y<sub>i,${target}</sub> = ρ y<sub>i,${target - 1}</sub> + … + μ<sub>i</sub> + u<sub>i,${target}</sub></span><br>
      Δy<sub>i,${target - 1}</sub> is a regressor above and an instrument below${shared}.
      That adds ${GRID_T - 2} columns to the ${uncollapsed}, and one assumption: mean stationarity.`;
  }

  function draw() {
    const header = `<tr><th></th>${Array.from({ length: GRID_T },
      (_, k) => `<th data-column="${k + 1}" scope="col">t=${k + 1}</th>`).join('')}</tr>`;
    const body = (mode === 'levels' || mode === 'diff')
      ? rowsForPanelViews()
      : rowsForInstrumentViews();
    table.innerHTML = header + body;

    for (const th of table.querySelectorAll('[data-column]')) {
      const t = Number(th.dataset.column);
      if (t < 3) continue;
      th.classList.add('clickable');
      th.title = `Estimate the equation at t = ${t}`;
      th.onclick = () => {
        target = t;
        if (mode === 'levels' || mode === 'diff') mode = 'iv';
        sync();
      };
    }

    say.innerHTML = explain();
  }

  function sync() {
    for (const button of slot.querySelectorAll('[data-mode]')) {
      button.classList.toggle('on', button.dataset.mode === mode);
    }
    const instrumentView = mode === 'iv' || mode === 'sys';
    periods.hidden = !instrumentView;
    for (const button of periods.querySelectorAll('[data-period]')) {
      button.classList.toggle('on', Number(button.dataset.period) === target);
    }
    draw();
  }

  for (const button of slot.querySelectorAll('[data-mode]')) {
    button.onclick = () => { mode = button.dataset.mode; sync(); };
  }
  for (const button of periods.querySelectorAll('[data-period]')) {
    button.onclick = () => { target = Number(button.dataset.period); sync(); };
  }

  $('[data-numbers]').onclick = (event) => {
    showNumbers = !showNumbers;
    if (showNumbers && !panel) resample();
    const button = event.currentTarget;
    button.classList.toggle('on', showNumbers);
    button.setAttribute('aria-pressed', String(showNumbers));
    button.textContent = showNumbers ? 'Show symbols' : 'Show real numbers';
    $('[data-resample]').hidden = !showNumbers;
    draw();
  };

  $('[data-resample]').onclick = () => { resample(); draw(); };

  sync();
}

/* --------------------------------------------------------------- nickell ---- */

export function nickell(slot) {
  slot.innerHTML = `
    <div class="tool">
      <h3>How bad is the bias you are avoiding?</h3>
      <p class="hint">Drag T and ρ. This is the leading-term approximation — good for judging
        magnitude, not for quoting.</p>
      <div class="row">
        <div class="fld"><label for="nick-t">Periods T = <b data-t-value>6</b></label>
          <input id="nick-t" type="range" data-t min="3" max="40" step="1" value="6"></div>
        <div class="fld"><label for="nick-r">True ρ = <b data-r-value>0.60</b></label>
          <input id="nick-r" type="range" data-r min="0" max="0.95" step="0.05" value="0.6"></div>
      </div>
      <div class="row spaced">
        <div class="fld"><div class="stat" data-bias></div></div>
        <div class="fld"><div class="stat" data-lands></div></div>
        <div class="fld"><div class="stat" data-share></div></div>
      </div>
      <div class="vd nu" data-say></div>
    </div>`;

  const $ = qs(slot);

  function update() {
    const t = Number($('[data-t]').value);
    const rho = Number($('[data-r]').value);
    const bias = -(1 + rho) / (t - 1);
    const lands = rho + bias;
    const share = rho > 0 ? `${Math.round(Math.abs(bias / rho) * 100)}%` : '—';

    $('[data-t-value]').textContent = t;
    $('[data-r-value]').textContent = rho.toFixed(2);
    $('[data-bias]').innerHTML = `${bias.toFixed(2)}<small>approximate FE bias</small>`;
    $('[data-lands]').innerHTML = `${lands.toFixed(2)}<small>where FE lands</small>`;
    $('[data-share]').innerHTML = `${share}<small>of ρ lost</small>`;

    const size = Math.abs(bias);
    if (size < 0.05) {
      verdict($('[data-say]'), 'ok', `Under 0.05 at T = ${t}. Run fixed effects and spend the effort elsewhere.`);
    } else if (size < 0.15) {
      verdict($('[data-say]'), 'hm', 'Noticeable but survivable. Report FE beside GMM so readers can see the bracket.');
    } else {
      verdict($('[data-say]'), 'no',
        `FE loses about ${share} of ρ here${lands < 0 ? ', and can flip the sign' : ''}. This is the regime GMM was built for.`);
    }
  }

  for (const input of slot.querySelectorAll('input')) input.oninput = update;
  update();
}

/* --------------------------------------------------------------- counter ---- */

export function counter(slot) {
  let withLevels = false;
  let collapsed = false;

  slot.innerHTML = `
    <div class="tool">
      <h3>Count the columns</h3>
      <p class="hint">One endogenous variable, lags from 2 down to the depth you allow.</p>
      <div class="row">
        <div class="fld"><label for="cnt-t">T = <b data-t-value>8</b></label>
          <input id="cnt-t" type="range" data-t min="4" max="20" value="8"></div>
        <div class="fld"><label for="cnt-n">N = <b data-n-value>100</b></label>
          <input id="cnt-n" type="range" data-n min="20" max="500" step="10" value="100"></div>
        <div class="fld"><label for="cnt-l">Deepest lag = <b data-l-value>all</b></label>
          <input id="cnt-l" type="range" data-l min="1" max="12" value="12"></div>
      </div>
      <div class="ctl">
        <button class="btn" data-system aria-pressed="false">Add level equation</button>
        <button class="btn" data-collapse aria-pressed="false">Collapse</button>
      </div>
      <div class="row">
        <div class="fld"><div class="stat" data-columns></div></div>
        <div class="fld"><div class="stat" data-ratio></div></div>
      </div>
      <div class="vd ok" data-say></div>
      <p class="hint formula" data-formula></p>
    </div>`;

  const $ = qs(slot);

  function update() {
    const t = Number($('[data-t]').value);
    const n = Number($('[data-n]').value);
    const cap = Number($('[data-l]').value);
    const deepest = Math.min(cap, t - 2);

    let differenced = 0;
    let levels = 0;
    let formula;

    if (collapsed) {
      differenced = deepest;
      levels = withLevels ? 1 : 0;
      formula = `Collapsed: min(cap, T−2) = ${deepest} column${deepest === 1 ? '' : 's'}`
        + (withLevels ? ', plus 1 for the level equation.' : '.');
    } else {
      for (let period = 3; period <= t; period++) differenced += Math.min(period - 2, cap);
      levels = withLevels ? t - 2 : 0;
      formula = `Uncollapsed: Σ min(t−2, cap) = ${differenced}`
        + (withLevels ? `, plus T−2 = ${levels} for the level equation.` : '.');
    }

    const total = differenced + levels;
    const ratio = total / n;

    $('[data-t-value]').textContent = t;
    $('[data-n-value]').textContent = n;
    $('[data-l-value]').textContent = cap >= t - 2 ? 'all' : cap;
    $('[data-columns]').innerHTML = `${total}<small>instrument columns</small>`;
    $('[data-ratio]').innerHTML = `${ratio.toFixed(2)}<small>columns per unit</small>`;
    $('[data-formula]').textContent = formula;

    if (total > n) {
      verdict($('[data-say]'), 'no', `<b>More instruments than units.</b> The weight matrix cannot be
        estimated reliably, Hansen loses its power, and ρ̂ drifts back toward the bias you were correcting.`);
    } else if (ratio > 0.5) {
      verdict($('[data-say]'), 'hm', `<b>Heavy.</b> ${total} columns against ${n} units — defensible
        only if the estimate survives collapsing.`);
    } else {
      verdict($('[data-say]'), 'ok', `<b>Reasonable.</b> ${total} columns against ${n} units.
        Report both next to the Hansen p-value.`);
    }
  }

  for (const input of slot.querySelectorAll('input')) input.oninput = update;

  $('[data-system]').onclick = (event) => {
    withLevels = !withLevels;
    event.currentTarget.classList.toggle('on', withLevels);
    event.currentTarget.setAttribute('aria-pressed', String(withLevels));
    update();
  };

  $('[data-collapse]').onclick = (event) => {
    collapsed = !collapsed;
    event.currentTarget.classList.toggle('on', collapsed);
    event.currentTarget.setAttribute('aria-pressed', String(collapsed));
    update();
  };

  update();
}

/* --------------------------------------------------------------- chooser ---- */

const QUESTIONS = [
  ['t', 'Is T small relative to N?', [['small', 'Small T, under 10 or so'], ['large', 'Large T']]],
  ['e', 'Any endogenous or predetermined regressors?', [['yes', 'Yes'], ['no', 'No, all strictly exogenous']]],
  ['p', 'Is y highly persistent, ρ near 1?', [['yes', 'Yes, near a random walk'], ['no', 'No, clearly mean-reverting']]]
];

export function chooser(slot) {
  const answers = {};

  slot.innerHTML = `<div class="tool">${QUESTIONS.map(([key, question, options]) => `
    <p class="ask">${question}</p>
    <div class="ctl tight" role="group" aria-label="${question}">
      ${options.map(([value, label]) =>
    `<button class="btn" data-key="${key}" data-value="${value}">${label}</button>`).join('')}
    </div>`).join('')}
    <div class="vd nu" data-say></div>
    <div class="ctl"><button class="btn" data-reset>Start over</button></div>
  </div>`;

  const say = slot.querySelector('[data-say]');
  const set = (tone, title, body) => verdict(say, tone, `<b>${title}</b><br>${body}`);

  function decide() {
    if (!answers.t) {
      return set('nu', 'Answer the three questions.', 'The estimator follows from the shape of the data.');
    }
    if (answers.t === 'large') {
      return set('ok', 'Fixed effects, or LSDV',
        'Nickell bias is O(1/T) and has faded. GMM would cost instruments and assumptions for nothing.');
    }
    if (!answers.e) return set('nu', 'One more answer.', 'Tell me about the regressors.');
    if (answers.e === 'no') {
      return set('hm', 'Fixed effects is defensible',
        `The only endogeneity left is the lagged dependent variable. If ρ carries your argument,
         report GMM as a robustness check; if it is a control, FE is enough.`);
    }
    if (!answers.p) return set('nu', 'One more answer.', 'Tell me about persistence.');
    if (answers.p === 'yes') {
      return set('ok', 'System GMM',
        `Lagged levels are weak for a near-random-walk, so add the level equation with lagged
         differences. Collapse the instruments, two-step with Windmeijer, and report
         difference-in-Hansen — mean stationarity is doing real work.`);
    }
    return set('ok', 'Difference GMM',
      `Lagged levels carry enough signal, so you skip the mean-stationarity assumption entirely.
       Lag 2 and deeper, collapsed, two-step with Windmeijer.`);
  }

  for (const button of slot.querySelectorAll('[data-key]')) {
    button.onclick = () => {
      answers[button.dataset.key] = button.dataset.value;
      for (const sibling of slot.querySelectorAll(`[data-key="${button.dataset.key}"]`)) {
        sibling.classList.toggle('on', sibling === button);
      }
      decide();
    };
  }

  slot.querySelector('[data-reset]').onclick = () => {
    for (const key of Object.keys(answers)) delete answers[key];
    for (const button of slot.querySelectorAll('[data-key]')) button.classList.remove('on');
    decide();
  };

  decide();
}
