/**
 * Dynamic panel estimators for y_it = rho * y_i,t-1 + mu_i + u_it.
 *
 * This file is the JavaScript reference implementation. DynamicPanel.cs and
 * gmm.cpp are line-for-line ports; `npm run crosscheck` runs all three from the
 * same seed and asserts the estimates agree. The `#region snippet:` markers are
 * extracted into the vault's Code note by `npm run snippets`, so what the note
 * displays is this code, not a paraphrase of it.
 */

import { Rng } from './rng.js';
import { Matrix, multiply, multiplyTransposed, invert } from './linalg.js';

const BURN_IN = 20;

// #region snippet:dgp
/**
 * Draw an N x T panel from a known rho. Each unit starts at its own stationary
 * mean so the initial conditions satisfy the mean-stationarity restriction that
 * System GMM leans on; BURN_IN extra periods absorb any residual start effect.
 */
export function drawPanel(n, t, rho, sigmaMu, rng) {
  const panel = [];
  const longRun = Math.max(1 - rho, 1e-6);
  const stationarySd = Math.sqrt(Math.max(1 - rho * rho, 0.02));
  for (let i = 0; i < n; i++) {
    const mu = sigmaMu * rng.nextNormal();
    let y = mu / longRun + rng.nextNormal() / stationarySd;
    for (let b = 0; b < BURN_IN; b++) y = rho * y + mu + rng.nextNormal();
    const row = new Float64Array(t);
    for (let k = 0; k < t; k++) {
      y = rho * y + mu + rng.nextNormal();
      row[k] = y;
    }
    panel.push(row);
  }
  return panel;
}
// #endregion

/** Pooled OLS of y on its own lag: biased upward, it absorbs mu_i as persistence. */
export function pooledOls(panel) {
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (const row of panel) {
    for (let t = 1; t < row.length; t++) {
      const x = row[t - 1], y = row[t];
      sx += x; sy += y; sxx += x * x; sxy += x * y; n++;
    }
  }
  if (n === 0) return NaN;
  return (sxy - sx * sy / n) / (sxx - sx * sx / n);
}

/** Within-group estimator: biased downward by roughly -(1+rho)/(T-1). */
export function withinFe(panel) {
  let num = 0, den = 0;
  for (const row of panel) {
    const t = row.length;
    let meanY = 0, meanX = 0;
    for (let k = 1; k < t; k++) { meanY += row[k]; meanX += row[k - 1]; }
    meanY /= (t - 1); meanX /= (t - 1);
    for (let k = 1; k < t; k++) {
      num += (row[k - 1] - meanX) * (row[k] - meanY);
      den += (row[k - 1] - meanX) * (row[k - 1] - meanX);
    }
  }
  return den === 0 ? NaN : num / den;
}

/** Instrument columns in the differenced block, before any level equation. */
export function differencedColumns(t, collapse) {
  return collapse ? t - 2 : ((t - 1) * (t - 2)) / 2;
}

// #region snippet:core
/**
 * One-step GMM on the differenced equation, optionally stacked with the level
 * equation (System GMM). `collapse` sums each moment condition across periods
 * instead of keeping one column per period per lag.
 */
function estimate(panel, { collapse, system }) {
  const t = panel[0].length;
  const equations = t - 2;               // usable differenced periods, t = 3..T
  if (equations < 1) return NaN;

  const diffCols = differencedColumns(t, collapse);
  const levelCols = system ? (collapse ? 1 : equations) : 0;
  const cols = diffCols + levelCols;
  const rows = system ? 2 * equations : equations;

  // Arellano-Bond weight: the MA(1) structure of du on the differenced block,
  // identity on the level block.
  const h = Matrix.zeros(rows, rows);
  for (let q = 0; q < equations; q++) {
    h.set(q, q, 2);
    if (q + 1 < equations) { h.set(q, q + 1, -1); h.set(q + 1, q, -1); }
  }
  for (let q = equations; q < rows; q++) h.set(q, q, 1);

  const a = Matrix.zeros(cols, cols);
  const zr = Matrix.zeros(cols, 1);
  const zy = Matrix.zeros(cols, 1);

  for (const row of panel) {
    const z = Matrix.zeros(rows, cols);
    const regressor = Matrix.zeros(rows, 1);
    const outcome = Matrix.zeros(rows, 1);

    for (let q = 0; q < equations; q++) {
      const period = q + 3;                                  // 1-indexed t
      outcome.set(q, 0, row[period - 1] - row[period - 2]);   // dy_it
      regressor.set(q, 0, row[period - 2] - row[period - 3]); // dy_i,t-1

      if (collapse) {
        // One column per lag order: column j-2 holds y_i,t-j.
        for (let lag = 2; lag <= t - 1; lag++) {
          const s = period - lag;
          if (s >= 1) z.set(q, lag - 2, row[s - 1]);
        }
      } else {
        // One column per period per lag: y_i,1 .. y_i,t-2 for this equation.
        let base = 0;
        for (let p = 3; p < period; p++) base += p - 2;
        for (let s = 1; s <= period - 2; s++) z.set(q, base + s - 1, row[s - 1]);
      }

      if (system) {
        const lvl = equations + q;
        outcome.set(lvl, 0, row[period - 1]);                 // y_it
        regressor.set(lvl, 0, row[period - 2]);               // y_i,t-1
        // Lagged difference instruments the level equation.
        z.set(lvl, diffCols + (collapse ? 0 : q), row[period - 2] - row[period - 3]);
      }
    }

    a.addInPlace(multiplyTransposed(z, multiply(h, z)));
    zr.addInPlace(multiplyTransposed(z, regressor));
    zy.addInPlace(multiplyTransposed(z, outcome));
  }

  const w = invert(a, 1e-8);
  if (!w) return NaN;
  const rzw = multiplyTransposed(zr, w);              // (Z'R)' W
  const denominator = multiply(rzw, zr).at(0, 0);
  if (Math.abs(denominator) < 1e-10) return NaN;
  return multiply(rzw, zy).at(0, 0) / denominator;
}
// #endregion

export const differenceGmm = (panel, collapse = true) =>
  estimate(panel, { collapse, system: false });

export const systemGmm = (panel, collapse = true) =>
  estimate(panel, { collapse, system: true });

/**
 * |corr(y_i,t-2, dy_i,t-1)| — the first stage the differenced moments run
 * through. It is what collapses as rho approaches one.
 */
export function firstStageCorrelation(rho, n, t, replications, rng) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, count = 0;
  for (let k = 0; k < replications; k++) {
    const panel = drawPanel(n, t, rho, 1, rng);
    for (const row of panel) {
      for (let period = 3; period <= t; period++) {
        const x = row[period - 3];
        const y = row[period - 2] - row[period - 3];
        sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; count++;
      }
    }
  }
  if (count === 0) return NaN;
  const vx = sxx - sx * sx / count;
  const vy = syy - sy * sy / count;
  return (sxy - sx * sy / count) / Math.sqrt(Math.max(vx * vy, 1e-12));
}

/** Mean, sd and count over the finite entries only. */
export function summarise(values) {
  let sum = 0, n = 0;
  for (const v of values) if (Number.isFinite(v)) { sum += v; n++; }
  if (n === 0) return { mean: NaN, sd: NaN, n: 0 };
  const mean = sum / n;
  let ss = 0;
  for (const v of values) if (Number.isFinite(v)) ss += (v - mean) * (v - mean);
  return { mean, sd: Math.sqrt(ss / n), n };
}

export function rmse(values, truth) {
  let ss = 0, n = 0;
  for (const v of values) if (Number.isFinite(v)) { ss += (v - truth) * (v - truth); n++; }
  return n === 0 ? NaN : Math.sqrt(ss / n);
}

/** One replication: every estimator on the same draw, so they are comparable. */
export function replicate({ n, t, rho, sigmaMu, collapse }, rng) {
  const panel = drawPanel(n, t, rho, sigmaMu, rng);
  return {
    ols: pooledOls(panel),
    fe: withinFe(panel),
    diff: differenceGmm(panel, collapse),
    sys: systemGmm(panel, collapse)
  };
}

export { Rng };
