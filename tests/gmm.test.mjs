import test from 'node:test';
import assert from 'node:assert/strict';

import { Rng } from '../src/js/sim/rng.js';
import { Matrix, multiply, multiplyTransposed, invert } from '../src/js/sim/linalg.js';
import {
  drawPanel, pooledOls, withinFe, differenceGmm, systemGmm,
  differencedColumns, summarise, rmse, firstStageCorrelation
} from '../src/js/sim/gmm.js';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('rng is deterministic and reproducible from a seed', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.nextNormal(), b.nextNormal());

  const different = new Rng(43);
  assert.notEqual(new Rng(42).nextNormal(), different.nextNormal());
});

test('rng uniforms stay in [0,1) and normals look standard', () => {
  const rng = new Rng(7);
  const uniforms = Array.from({ length: 20000 }, () => rng.nextUnit());
  assert.ok(Math.min(...uniforms) >= 0);
  assert.ok(Math.max(...uniforms) < 1);
  assert.ok(Math.abs(mean(uniforms) - 0.5) < 0.01);

  const normals = Array.from({ length: 50000 }, () => rng.nextNormal());
  const m = mean(normals);
  const sd = Math.sqrt(mean(normals.map((x) => (x - m) ** 2)));
  assert.ok(Math.abs(m) < 0.02, `mean ${m}`);
  assert.ok(Math.abs(sd - 1) < 0.02, `sd ${sd}`);
});

test('matrix multiply and transpose-multiply agree with a hand computation', () => {
  const a = new Matrix(2, 3, Float64Array.from([1, 2, 3, 4, 5, 6]));
  const b = new Matrix(3, 2, Float64Array.from([7, 8, 9, 10, 11, 12]));

  const ab = multiply(a, b);
  assert.deepEqual([...ab.data], [58, 64, 139, 154]);

  // A'A must be symmetric with the column sums of squares on its diagonal.
  const ata = multiplyTransposed(a, a);
  assert.equal(ata.rows, 3);
  assert.equal(ata.at(0, 0), 1 * 1 + 4 * 4);
  assert.equal(ata.at(0, 1), ata.at(1, 0));
});

test('invert returns an actual inverse, and null when singular', () => {
  const m = new Matrix(3, 3, Float64Array.from([4, 7, 2, 3, 6, 1, 2, 5, 3]));
  const inverse = invert(m, 0);
  assert.ok(inverse);

  const identity = multiply(m, inverse);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      assert.ok(Math.abs(identity.at(i, j) - (i === j ? 1 : 0)) < 1e-10);
    }
  }

  const singular = new Matrix(2, 2, Float64Array.from([1, 2, 2, 4]));
  assert.equal(invert(singular, 0), null);
});

test('drawPanel has the requested shape and finite values', () => {
  const panel = drawPanel(50, 6, 0.6, 1, new Rng(1));
  assert.equal(panel.length, 50);
  assert.equal(panel[0].length, 6);
  for (const row of panel) for (const v of row) assert.ok(Number.isFinite(v));
});

test('sigma_mu = 0 removes the between-unit spread', () => {
  const withEffects = drawPanel(400, 6, 0.6, 2, new Rng(11));
  const without = drawPanel(400, 6, 0.6, 0, new Rng(11));
  const spread = (panel) => {
    const means = panel.map((row) => mean([...row]));
    const m = mean(means);
    return Math.sqrt(mean(means.map((x) => (x - m) ** 2)));
  };
  assert.ok(spread(withEffects) > spread(without) * 2);
});

test('instrument counts follow the documented formulas', () => {
  assert.equal(differencedColumns(6, true), 4);
  assert.equal(differencedColumns(6, false), 10);
  assert.equal(differencedColumns(8, false), 21);
  for (let t = 4; t <= 12; t++) {
    assert.ok(differencedColumns(t, true) <= differencedColumns(t, false));
  }
});

test('the estimators reproduce the textbook bias pattern at rho = 0.6', () => {
  const rng = new Rng(2024);
  const reps = 120;
  const series = { ols: [], fe: [], diff: [], sys: [] };

  for (let k = 0; k < reps; k++) {
    const panel = drawPanel(100, 6, 0.6, 1, rng);
    series.ols.push(pooledOls(panel));
    series.fe.push(withinFe(panel));
    series.diff.push(differenceGmm(panel, true));
    series.sys.push(systemGmm(panel, true));
  }

  const ols = summarise(series.ols);
  const fe = summarise(series.fe);
  const diff = summarise(series.diff);
  const sys = summarise(series.sys);

  assert.ok(ols.mean > 0.6, `pooled OLS should be biased up, got ${ols.mean}`);
  assert.ok(fe.mean < 0.6, `fixed effects should be biased down, got ${fe.mean}`);
  assert.ok(fe.mean < diff.mean && diff.mean < ols.mean, 'the bracket should hold on average');
  assert.ok(Math.abs(diff.mean - 0.6) < 0.06, `difference GMM off by ${diff.mean - 0.6}`);
  assert.ok(Math.abs(sys.mean - 0.6) < 0.06, `system GMM off by ${sys.mean - 0.6}`);
});

test('Nickell bias shrinks as T grows', () => {
  const biasAt = (t) => {
    const rng = new Rng(99);
    const values = [];
    for (let k = 0; k < 60; k++) values.push(withinFe(drawPanel(100, t, 0.6, 1, rng)));
    return Math.abs(summarise(values).mean - 0.6);
  };
  assert.ok(biasAt(12) < biasAt(6), 'the within bias is O(1/T)');
});

test('System GMM beats Difference GMM when the series is persistent', () => {
  const rng = new Rng(5150);
  const diff = [];
  const sys = [];
  for (let k = 0; k < 80; k++) {
    const panel = drawPanel(100, 6, 0.9, 1, rng);
    diff.push(differenceGmm(panel, true));
    sys.push(systemGmm(panel, true));
  }
  // This is the Blundell-Bond result: lagged levels stop identifying rho.
  assert.ok(summarise(sys).sd < summarise(diff).sd,
    'system GMM should be tighter at rho = 0.9');
  assert.ok(rmse(sys, 0.9) < rmse(diff, 0.9), 'and closer to the truth');
});

test('the first stage weakens as rho approaches one', () => {
  const rng = new Rng(808);
  const low = Math.abs(firstStageCorrelation(0.2, 200, 6, 3, rng));
  const high = Math.abs(firstStageCorrelation(0.95, 200, 6, 3, rng));
  assert.ok(low > high, `corr should fall: ${low} then ${high}`);
  assert.ok(high < 0.15, `near a random walk the instrument is weak, got ${high}`);
});

test('summaries ignore non-finite replications rather than propagating them', () => {
  const stats = summarise([1, 2, NaN, 3, Infinity]);
  assert.equal(stats.n, 3);
  assert.equal(stats.mean, 2);
  assert.ok(Number.isFinite(rmse([1, NaN, 3], 2)));

  const empty = summarise([NaN, NaN]);
  assert.equal(empty.n, 0);
  assert.ok(Number.isNaN(empty.mean));
});

test('a panel too short to difference returns NaN instead of throwing', () => {
  const panel = drawPanel(10, 3, 0.5, 1, new Rng(3));
  assert.ok(Number.isNaN(differenceGmm(panel, true)) || Number.isFinite(differenceGmm(panel, true)));

  const tooShort = drawPanel(10, 2, 0.5, 1, new Rng(3));
  assert.ok(Number.isNaN(differenceGmm(tooShort, true)));
});

test('collapsed and uncollapsed instruments both identify rho', () => {
  const rng = new Rng(321);
  const collapsed = [];
  const full = [];
  for (let k = 0; k < 60; k++) {
    const panel = drawPanel(150, 6, 0.6, 1, rng);
    collapsed.push(differenceGmm(panel, true));
    full.push(differenceGmm(panel, false));
  }
  assert.ok(Math.abs(summarise(collapsed).mean - 0.6) < 0.08);
  assert.ok(Math.abs(summarise(full).mean - 0.6) < 0.08);
});
