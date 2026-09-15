#!/usr/bin/env node
/**
 * Monte Carlo driver for the JavaScript reference implementation — the same
 * module the browser vault runs.
 *
 *   node reference/js/cli.mjs --rho 0.9 --reps 200
 *   node reference/js/cli.mjs --json      # machine-readable, for crosscheck
 *
 * The JSON shape matches the C# and C++ drivers exactly.
 */

import {
  Rng, replicate, summarise, rmse
} from '../../src/js/sim/gmm.js';

const DEFAULTS = {
  n: 100, t: 6, rho: 0.6, sigmaMu: 1, reps: 200, seed: 12345, collapse: true, json: false
};

const USAGE = `usage: node reference/js/cli.mjs [--n N] [--t T] [--rho R] [--sigma-mu S]
                                 [--reps K] [--seed S] [--uncollapsed] [--json]`;

function parse(argv) {
  const o = { ...DEFAULTS };
  const value = (i, flag) => {
    if (i + 1 >= argv.length) throw new Error(`${flag} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--n': o.n = Number.parseInt(value(i, a), 10); i++; break;
      case '--t': o.t = Number.parseInt(value(i, a), 10); i++; break;
      case '--rho': o.rho = Number.parseFloat(value(i, a)); i++; break;
      case '--sigma-mu': o.sigmaMu = Number.parseFloat(value(i, a)); i++; break;
      case '--reps': o.reps = Number.parseInt(value(i, a), 10); i++; break;
      case '--seed': o.seed = Number.parseInt(value(i, a), 10) >>> 0; i++; break;
      case '--uncollapsed': o.collapse = false; break;
      case '--json': o.json = true; break;
      case '--help': case '-h': console.log(USAGE); process.exit(0); break;
      default: throw new Error(`unknown option ${a}`);
    }
  }
  if (!(o.n >= 2) || !(o.t >= 4) || !(o.reps >= 1)) throw new Error('need n >= 2, t >= 4, reps >= 1');
  if (!(o.rho > -1 && o.rho < 1)) throw new Error('rho must lie strictly inside (-1, 1)');
  return o;
}

export function run(options) {
  const rng = new Rng(options.seed);
  const series = { ols: [], fe: [], diff: [], sys: [] };
  let bracket = 0;
  let first = null;

  for (let k = 0; k < options.reps; k++) {
    const r = replicate(options, rng);
    if (k === 0) first = r;
    series.ols.push(r.ols);
    series.fe.push(r.fe);
    series.diff.push(r.diff);
    series.sys.push(r.sys);
    if (r.fe < r.diff && r.diff < r.ols) bracket++;
  }

  return { series, first, bracket: bracket / options.reps };
}

function block(values, rho) {
  const s = summarise(values);
  return { mean: s.mean, sd: s.sd, rmse: rmse(values, rho), n: s.n };
}

function main(argv) {
  let options;
  try {
    options = parse(argv);
  } catch (err) {
    console.error(`gmm: ${err.message}`);
    console.error(USAGE);
    return 2;
  }

  const { series, first, bracket } = run(options);

  if (options.json) {
    console.log(JSON.stringify({
      impl: 'javascript',
      n: options.n, t: options.t, rho: options.rho, sigmaMu: options.sigmaMu,
      reps: options.reps, seed: options.seed, collapse: options.collapse,
      first,
      ols: block(series.ols, options.rho),
      fe: block(series.fe, options.rho),
      diff: block(series.diff, options.rho),
      sys: block(series.sys, options.rho),
      bracket
    }, null, 2));
    return 0;
  }

  const pad = (s, w) => String(s).padStart(w);
  const row = (name, values) => {
    const s = summarise(values);
    const bias = s.mean - options.rho;
    return `  ${name.padEnd(16)} ${pad(s.mean.toFixed(3), 8)} ` +
           `${pad((bias >= 0 ? '+' : '') + bias.toFixed(3), 8)} ` +
           `${pad(s.sd.toFixed(3), 8)} ${pad(rmse(values, options.rho).toFixed(3), 8)}`;
  };

  console.log(
    `N = ${options.n}, T = ${options.t}, rho = ${options.rho.toFixed(2)}, ` +
    `sd(mu) = ${options.sigmaMu.toFixed(2)}, ${options.reps} reps, seed ${options.seed}, ` +
    `${options.collapse ? 'collapsed' : 'uncollapsed'} instruments\n`);
  console.log(`  ${'estimator'.padEnd(16)} ${pad('mean', 8)} ${pad('bias', 8)} ${pad('sd', 8)} ${pad('rmse', 8)}`);
  console.log(row('pooled OLS', series.ols));
  console.log(row('fixed effects', series.fe));
  console.log(row('difference GMM', series.diff));
  console.log(row('system GMM', series.sys));
  console.log(`\n  Nickell approximation for FE: ${(options.rho - (1 + options.rho) / (options.t - 1)).toFixed(3)}`);
  console.log(`  Sanity bracket held in ${Math.round(bracket * 100)}% of draws`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
