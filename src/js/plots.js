/**
 * Canvas helpers and the two charts: sampling distributions for the simulation
 * lab, and the first-stage correlation curve for Difference GMM.
 */

import { summarise } from './sim/gmm.js';

/** Resolve a CSS custom property against the current theme. */
export function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || '#888';
}

/**
 * Size the backing store for the device pixel ratio and return a context whose
 * coordinates are CSS pixels. Returns null when the canvas is not laid out yet.
 */
export function prepareCanvas(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return null;

  const dpr = window.devicePixelRatio || 1;
  const backingWidth = Math.round(width * dpr);
  const backingHeight = Math.round(height * dpr);
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function placeholder(ctx, width, height, message) {
  ctx.fillStyle = cssVar('--ink-4');
  ctx.font = '12px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(message, width / 2, height / 2);
}

/** Finite min and max across every series, without spreading into apply(). */
function extent(series, seed) {
  let lo = seed;
  let hi = seed;
  let any = false;
  for (const s of series) {
    for (const v of s.values) {
      if (!Number.isFinite(v)) continue;
      any = true;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return any ? { lo, hi } : null;
}

const BINS = 44;

/**
 * Stacked histograms, one lane per estimator, sharing an axis and a marker at
 * the true rho. The lanes share a scale on purpose: the point is to compare
 * spread between estimators, not to look at each one in isolation.
 */
export function drawDistributions(canvas, series, rho) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;
  const { ctx, width, height } = prepared;

  const bounds = extent(series, rho);
  if (!bounds) {
    placeholder(ctx, width, height, 'Run the simulation to see the sampling distributions');
    return;
  }

  let lo = Math.max(bounds.lo - 0.06, -1.4);
  let hi = Math.min(bounds.hi + 0.06, 1.9);
  if (hi - lo < 0.25) { lo -= 0.12; hi += 0.12; }

  // Size the gutter to the widest label rather than guessing: "Difference GMM"
  // does not fit the width that "sd" would suggest.
  ctx.font = '10.5px -apple-system, system-ui, sans-serif';
  const widest = series.reduce((w, s) => Math.max(w, ctx.measureText(s.name).width), 0);
  const left = Math.min(Math.round(widest) + 14, Math.max(70, width * 0.32));
  const right = 10;
  const top = 8;
  const baseline = height - 16;
  const laneHeight = (baseline - top) / series.length;
  const x = (v) => left + ((v - lo) / (hi - lo)) * (width - left - right);

  ctx.strokeStyle = cssVar('--rule');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, baseline);
  ctx.lineTo(width - right, baseline);
  ctx.stroke();

  ctx.fillStyle = cssVar('--ink-4');
  ctx.font = '10px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4;
    ctx.fillText(v.toFixed(2), x(v), height - 4);
  }

  ctx.strokeStyle = cssVar('--sage');
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x(rho), top);
  ctx.lineTo(x(rho), baseline);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = cssVar('--sage');
  ctx.textAlign = 'left';
  ctx.fillText('true ρ', Math.min(x(rho) + 4, width - 40), top + 8);

  series.forEach((s, index) => {
    const lane = top + laneHeight * (index + 1) - 3;
    const bins = new Array(BINS).fill(0);

    for (const v of s.values) {
      if (!Number.isFinite(v)) continue;
      const clamped = Math.min(Math.max(v, lo), hi);
      const bin = Math.floor(((clamped - lo) / (hi - lo)) * (BINS - 0.001));
      bins[bin]++;
    }

    const peak = Math.max(1, ...bins);
    const binWidth = (width - left - right) / BINS;

    ctx.fillStyle = cssVar(s.color);
    ctx.globalAlpha = 0.8;
    bins.forEach((count, bin) => {
      if (!count) return;
      const barHeight = (count / peak) * (laneHeight - 9);
      ctx.fillRect(left + bin * binWidth, lane - barHeight, Math.max(binWidth - 0.6, 1), barHeight);
    });
    ctx.globalAlpha = 1;

    const stats = summarise(s.values);
    if (Number.isFinite(stats.mean)) {
      ctx.strokeStyle = cssVar(s.color);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x(stats.mean), lane + 1);
      ctx.lineTo(x(stats.mean), lane - laneHeight + 8);
      ctx.stroke();
    }

    ctx.fillStyle = cssVar('--ink-3');
    ctx.font = '10.5px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(s.name, left - 7, lane - 1);
  });
}

const WEAK_THRESHOLD = 0.1;
const CORR_CEILING = 0.55;
const RHO_CEILING = 0.95;

/** |corr(y_i,t-2, dy_i,t-1)| against rho, with the current rho marked. */
export function drawFirstStageCurve(canvas, points, selectedRho) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;
  const { ctx, width, height } = prepared;

  const left = 34;
  const right = 10;
  const top = 10;
  const bottom = 20;
  const x = (rho) => left + (rho / RHO_CEILING) * (width - left - right);
  const y = (corr) => height - bottom - (corr / CORR_CEILING) * (height - top - bottom);

  ctx.strokeStyle = cssVar('--rule');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, height - bottom);
  ctx.lineTo(width - right, height - bottom);
  ctx.moveTo(left, top);
  ctx.lineTo(left, height - bottom);
  ctx.stroke();

  ctx.fillStyle = cssVar('--ink-4');
  ctx.font = '10px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const rho of [0, 0.25, 0.5, 0.75, 0.95]) ctx.fillText(rho.toFixed(2), x(rho), height - 6);
  ctx.textAlign = 'right';
  for (const corr of [0, 0.25, 0.5]) ctx.fillText(corr.toFixed(2), left - 4, y(corr) + 3);

  ctx.strokeStyle = cssVar('--ochre');
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(left, y(WEAK_THRESHOLD));
  ctx.lineTo(width - right, y(WEAK_THRESHOLD));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = cssVar('--ochre');
  ctx.textAlign = 'left';
  ctx.fillText('weak', left + 4, y(WEAK_THRESHOLD) - 4);

  if (points.length) {
    ctx.strokeStyle = cssVar('--sage');
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    points.forEach(([rho, corr], i) => {
      if (i === 0) ctx.moveTo(x(rho), y(corr));
      else ctx.lineTo(x(rho), y(corr));
    });
    ctx.stroke();

    ctx.fillStyle = cssVar('--sage');
    for (const [rho, corr] of points) {
      ctx.beginPath();
      ctx.arc(x(rho), y(corr), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const current = points.find(([rho]) => Math.abs(rho - selectedRho) < 1e-3);
  if (!current) return;

  ctx.fillStyle = cssVar('--ink');
  ctx.beginPath();
  ctx.arc(x(current[0]), y(current[1]), 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = cssVar('--rule');
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x(current[0]), y(current[1]));
  ctx.lineTo(x(current[0]), height - bottom);
  ctx.stroke();
  ctx.setLineDash([]);
}
