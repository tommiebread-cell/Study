/**
 * The simulation lab and the weak-instrument curve — the two tools that run the
 * estimator rather than describing it.
 */

import { Rng, randomSeed } from '../sim/rng.js';
import {
  replicate, summarise, rmse, firstStageCorrelation, differencedColumns
} from '../sim/gmm.js';
import { recordRun } from '../session.js';
import { drawDistributions, drawFirstStageCurve, cssVar } from '../plots.js';
import { qs, verdict, chunked } from './dom.js';

const SERIES = [
  { key: 'ols', name: 'pooled OLS', color: '--ochre' },
  { key: 'fe', name: 'fixed effects', color: '--slate' },
  { key: 'diff', name: 'Difference GMM', color: '--sage' },
  { key: 'sys', name: 'System GMM', color: '--moss' }
];

export function monteCarlo(slot) {
  let collapse = true;
  let running = false;
  let stopRequested = false;

  slot.innerHTML = `
    <div class="tool">
      <h3>Generate a panel, estimate it four ways</h3>
      <p class="hint">Each replication draws a fresh panel from the true ρ and runs all four
        estimators on it. Nothing here is precomputed.</p>
      <div class="row">
        <div class="fld"><label for="mc-n">Units N = <b data-n-value>100</b></label>
          <input id="mc-n" type="range" data-n min="40" max="300" step="20" value="100"></div>
        <div class="fld"><label for="mc-t">Periods T = <b data-t-value>6</b></label>
          <input id="mc-t" type="range" data-t min="4" max="10" value="6"></div>
      </div>
      <div class="row">
        <div class="fld"><label for="mc-rho">True ρ = <b data-rho-value>0.60</b></label>
          <input id="mc-rho" type="range" data-rho min="0" max="0.95" step="0.05" value="0.6"></div>
        <div class="fld"><label for="mc-mu">sd(μ<sub>i</sub>) = <b data-mu-value>1.00</b></label>
          <input id="mc-mu" type="range" data-mu min="0" max="2" step="0.25" value="1"></div>
        <div class="fld"><label for="mc-reps">Replications = <b data-reps-value>200</b></label>
          <input id="mc-reps" type="range" data-reps min="50" max="400" step="50" value="200"></div>
      </div>
      <div class="ctl">
        <button class="btn pri" data-run>Run simulation</button>
        <button class="btn on" data-collapse aria-pressed="true">Collapse instruments</button>
        <label class="seedbox">Seed
          <input type="number" data-seed min="1" step="1" placeholder="random">
        </label>
      </div>
      <p class="mini" data-count></p>
      <div class="hbar"><i data-bar></i></div>
      <canvas class="plot tall" data-plot
              aria-label="Sampling distributions of the four estimators"></canvas>
      <div data-results></div>
    </div>`;

  const $ = qs(slot);
  const canvas = $('[data-plot]');

  const config = () => ({
    n: Number($('[data-n]').value),
    t: Number($('[data-t]').value),
    rho: Number($('[data-rho]').value),
    sigmaMu: Number($('[data-mu]').value),
    reps: Number($('[data-reps]').value),
    collapse
  });

  function labels() {
    const c = config();
    $('[data-n-value]').textContent = c.n;
    $('[data-t-value]').textContent = c.t;
    $('[data-rho-value]').textContent = c.rho.toFixed(2);
    $('[data-mu-value]').textContent = c.sigmaMu.toFixed(2);
    $('[data-reps-value]').textContent = c.reps;

    const columns = differencedColumns(c.t, collapse);
    const heavy = !collapse && c.t > 8;
    $('[data-count]').innerHTML =
      `${columns} instrument column${columns === 1 ? '' : 's'} in the differenced block, `
      + `${c.t - 2} equations per unit`
      + (heavy ? ` <span class="warn">— uncollapsed at T = ${c.t} is slow, a few seconds per hundred replications</span>` : '')
      + (columns > c.n ? ' <span class="dang">— more columns than units</span>' : '');
  }

  function commentary(accumulated, c) {
    const diff = summarise(accumulated.diff);
    const sys = summarise(accumulated.sys);
    const fe = summarise(accumulated.fe);

    const rows = SERIES.map((series) => {
      const stats = summarise(accumulated[series.key]);
      const bias = stats.mean - c.rho;
      return `<tr>
        <td><span class="swatch" style="background:${cssVar(series.color)}"></span>${series.name}</td>
        <td>${stats.mean.toFixed(3)}</td>
        <td>${bias >= 0 ? '+' : ''}${bias.toFixed(3)}</td>
        <td>${stats.sd.toFixed(3)}</td>
        <td>${rmse(accumulated[series.key], c.rho).toFixed(3)}</td>
      </tr>`;
    }).join('');

    let reading;
    if (diff.sd > 0.25 || Math.abs(diff.mean - c.rho) > 0.15) {
      reading = `<div class="vd no"><b>Difference GMM has come apart.</b> Spread of
        ${diff.sd.toFixed(2)} around a mean of ${diff.mean.toFixed(2)}: lagged levels barely
        predict the differenced lag at ρ = ${c.rho.toFixed(2)}, so the moment conditions carry
        almost no information. System GMM lands at ${sys.mean.toFixed(2)} on the same draws.</div>`;
    } else if (sys.sd < diff.sd * 0.85) {
      reading = `<div class="vd ok"><b>Both GMM estimators are close to the truth</b>, and System
        GMM is tighter — ${sys.sd.toFixed(3)} against ${diff.sd.toFixed(3)}. That precision is
        what the extra mean-stationarity assumption buys.</div>`;
    } else {
      reading = `<div class="vd ok"><b>Both GMM estimators are close to the truth</b> and about
        equally precise, so Difference GMM is the cheaper choice: it needs one assumption fewer.</div>`;
    }

    const done = accumulated.ols.length;
    const bracketPct = Math.round((accumulated.bracket / Math.max(done, 1)) * 100);
    const bracketTone = bracketPct >= 90 ? 'ok' : bracketPct >= 70 ? 'hm' : 'no';
    const nickell = c.rho - (1 + c.rho) / (c.t - 1);

    return `
      <table class="t num">
        <tr><th>estimator</th><th class="asis">mean ρ̂</th><th>bias</th><th>sd</th><th>rmse</th></tr>
        ${rows}
      </table>
      ${reading}
      <div class="vd ${bracketTone}"><b>The sanity bracket held in ${bracketPct}% of draws.</b>
        FE below, GMM in the middle, pooled OLS above.
        ${bracketPct < 70
    ? 'At this ρ the bracket is no longer a reliable check — weak instruments push Difference GMM below the FE estimate.'
    : 'This is the rule of thumb from Bond (2002), and here is how often it actually works.'}</div>
      <div class="vd nu">Fixed effects landed at ${fe.mean.toFixed(3)}; Nickell's leading-term
        approximation predicts ${nickell.toFixed(3)}. The realised bias usually runs a little past
        the formula, which only keeps the first term.</div>`;
  }

  for (const input of slot.querySelectorAll('input[type=range]')) input.oninput = labels;

  $('[data-collapse]').onclick = (event) => {
    collapse = !collapse;
    event.currentTarget.classList.toggle('on', collapse);
    event.currentTarget.setAttribute('aria-pressed', String(collapse));
    labels();
  };

  $('[data-run]').onclick = async () => {
    if (running) {
      stopRequested = true;
      return;
    }

    const c = config();
    const requested = Number.parseInt($('[data-seed]').value, 10);
    const seed = Number.isInteger(requested) && requested > 0 ? requested >>> 0 : randomSeed();
    const rng = new Rng(seed);

    const accumulated = { ols: [], fe: [], diff: [], sys: [], bracket: 0 };
    const button = $('[data-run]');

    running = true;
    stopRequested = false;
    button.textContent = 'Stop';
    const startedAt = performance.now();

    const done = await chunked({
      total: c.reps,
      isAlive: () => canvas.isConnected,
      shouldStop: () => stopRequested,
      step: () => {
        const r = replicate(c, rng);
        accumulated.ols.push(r.ols);
        accumulated.fe.push(r.fe);
        accumulated.diff.push(r.diff);
        accumulated.sys.push(r.sys);
        if (r.fe < r.diff && r.diff < r.ols) accumulated.bracket++;
      },
      onProgress: (count) => {
        $('[data-bar]').style.width = `${Math.round((count / c.reps) * 100)}%`;
        drawDistributions(canvas,
          SERIES.map((s) => ({ name: s.name, color: s.color, values: accumulated[s.key] })), c.rho);
        $('[data-results]').innerHTML = commentary(accumulated, c);
      }
    });

    running = false;
    button.textContent = 'Run simulation';
    if (!canvas.isConnected || done === 0) return;

    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
    $('[data-results]').insertAdjacentHTML('beforeend', `
      <p class="mini">${done} replications in ${elapsed}s · N = ${c.n}, T = ${c.t},
        ρ = ${c.rho.toFixed(2)}, sd(μ) = ${c.sigmaMu.toFixed(2)},
        ${collapse ? 'collapsed' : 'uncollapsed'} instruments, seed ${seed}</p>`);

    recordRun({
      n: c.n, t: c.t, rho: c.rho, reps: done, collapse, seed,
      ols: summarise(accumulated.ols),
      fe: summarise(accumulated.fe),
      diff: summarise(accumulated.diff),
      sys: summarise(accumulated.sys),
      bracket: Math.round((accumulated.bracket / done) * 100)
    });
  };

  labels();
  drawDistributions(canvas,
    SERIES.map((s) => ({ name: s.name, color: s.color, values: [] })), config().rho);
}

/* ------------------------------------------------- weak instrument curve ---- */

const RHO_GRID = Array.from({ length: 20 }, (_, i) => Number((i * 0.05).toFixed(2)));
const CURVE_N = 200;
const CURVE_T = 6;
const CURVE_REPS = 3;

export function weakInstruments(slot) {
  let points = [];

  slot.innerHTML = `
    <div class="tool">
      <h3>First-stage correlation as ρ rises</h3>
      <p class="hint">Simulated |corr(y<sub>i,t−2</sub>, Δy<sub>i,t−1</sub>)| — how much the
        instrument actually knows about the regressor it stands in for.</p>
      <canvas class="plot" data-plot
              aria-label="First-stage correlation against rho"></canvas>
      <div class="row spaced">
        <div class="fld"><label for="weak-rho">ρ = <b data-rho-value>0.60</b></label>
          <input id="weak-rho" type="range" data-rho min="0" max="0.95" step="0.05" value="0.6"></div>
      </div>
      <div class="ctl"><button class="btn" data-resample>Resample the curve</button></div>
      <div class="vd nu" data-say>Simulating…</div>
    </div>`;

  const $ = qs(slot);
  const canvas = $('[data-plot]');

  const selected = () => Number($('[data-rho]').value);

  function redraw() {
    drawFirstStageCurve(canvas, points, selected());
  }

  function explain() {
    const rho = selected();
    $('[data-rho-value]').textContent = rho.toFixed(2);
    const point = points.find(([r]) => Math.abs(r - rho) < 1e-3);
    if (!point) return;

    const correlation = point[1];
    const say = $('[data-say]');

    if (correlation > 0.3) {
      verdict(say, 'ok', `<b>|corr| ≈ ${correlation.toFixed(2)}.</b> Lagged levels are informative
        here. Difference GMM identifies ρ without help.`);
    } else if (correlation > 0.15) {
      verdict(say, 'hm', `<b>|corr| ≈ ${correlation.toFixed(2)}.</b> Usable but thinning. Expect
        Difference GMM to be noisier than System GMM — check it in the
        <a class="wl" href="#simulation" data-open="simulation">lab</a>.`);
    } else {
      verdict(say, 'no', `<b>|corr| ≈ ${correlation.toFixed(2)}.</b> The instrument is close to
        uninformative: a near-random-walk level says almost nothing about its own change. This is
        the weak-instrument regime
        <a class="wl" href="#system-gmm" data-open="system-gmm">System GMM</a> was built for.`);
    }
  }

  async function compute() {
    points = [];
    const rng = new Rng(randomSeed());
    verdict($('[data-say]'), 'nu', 'Simulating…');

    await chunked({
      total: RHO_GRID.length,
      budgetMs: 45,
      isAlive: () => canvas.isConnected,
      shouldStop: () => false,
      step: (i) => {
        points.push([RHO_GRID[i], Math.abs(firstStageCorrelation(RHO_GRID[i], CURVE_N, CURVE_T, CURVE_REPS, rng))]);
      },
      onProgress: redraw
    });

    if (canvas.isConnected) explain();
  }

  $('[data-rho]').oninput = () => { redraw(); explain(); };
  $('[data-resample]').onclick = compute;

  compute();
}
