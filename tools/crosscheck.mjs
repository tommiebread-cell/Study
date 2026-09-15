#!/usr/bin/env node
/**
 * Run every available reference implementation at the same seed and assert they
 * agree. This is the claim the Implementations note makes, made checkable.
 *
 *   node tools/crosscheck.mjs [--reps 50] [--seed 12345] [--tolerance 1e-9]
 *
 * JavaScript always runs. C++ runs if it builds; C# runs if the dotnet SDK is
 * installed. A toolchain that is absent is reported and skipped — a toolchain
 * that is present and disagrees is a failure.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FIELDS = [
  ['first', ['ols', 'fe', 'diff', 'sys']],
  ['ols', ['mean', 'sd', 'rmse']],
  ['fe', ['mean', 'sd', 'rmse']],
  ['diff', ['mean', 'sd', 'rmse']],
  ['sys', ['mean', 'sd', 'rmse']]
];

function parseArgs(argv) {
  const options = { reps: 50, seed: 12345, tolerance: 1e-9 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--reps' && argv[i + 1]) options.reps = Number(argv[++i]);
    else if (argv[i] === '--seed' && argv[i + 1]) options.seed = Number(argv[++i]);
    else if (argv[i] === '--tolerance' && argv[i + 1]) options.tolerance = Number(argv[++i]);
  }
  return options;
}

const has = (command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;

function runJson(command, args, cwd) {
  const stdout = execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 24 });
  return JSON.parse(stdout);
}

const { reps, seed, tolerance } = parseArgs(process.argv.slice(2));
const flags = ['--json', '--reps', String(reps), '--seed', String(seed)];

const results = [];
const skipped = [];

console.log(`crosscheck: seed ${seed}, ${reps} replications, tolerance ${tolerance}\n`);

results.push(runJson(process.execPath, [join(ROOT, 'reference/js/cli.mjs'), ...flags], ROOT));
console.log('  javascript  ran');

if (has('g++') || has('clang++')) {
  const cpp = join(ROOT, 'reference/cpp');
  execFileSync('make', ['--silent'], { cwd: cpp, stdio: 'inherit' });
  results.push(runJson(join(cpp, 'gmm'), flags, cpp));
  console.log('  cpp         ran');
} else {
  skipped.push('cpp (no C++ compiler on PATH)');
}

if (has('dotnet')) {
  const csharp = join(ROOT, 'reference/csharp/DynamicPanel');
  results.push(runJson('dotnet', ['run', '--configuration', 'Release', '--', ...flags], csharp));
  console.log('  csharp      ran');
} else {
  skipped.push('csharp (no dotnet SDK on PATH)');
}

for (const note of skipped) console.log(`  skipped: ${note}`);

if (results.length < 2) {
  console.log('\ncrosscheck: only one implementation available, nothing to compare.');
  process.exit(0);
}

const [reference, ...others] = results;
const failures = [];
let worst = { difference: 0, where: '—', against: '' };

for (const other of others) {
  for (const [group, keys] of FIELDS) {
    for (const key of keys) {
      const a = reference[group][key];
      const b = other[group][key];
      const difference = Math.abs(a - b) / Math.max(1, Math.abs(a));
      if (difference > worst.difference) {
        worst = { difference, where: `${group}.${key}`, against: other.impl };
      }
      if (difference > tolerance) {
        failures.push(`${other.impl} ${group}.${key}: ${a} vs ${b} (${difference.toExponential(2)})`);
      }
    }
  }
}

console.log(`\n  worst relative difference: ${worst.difference.toExponential(3)} `
  + `at ${worst.where} (${reference.impl} vs ${worst.against || 'n/a'})`);

if (failures.length) {
  console.error('\ncrosscheck: FAILED');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`crosscheck: ${results.map((r) => r.impl).join(', ')} agree within ${tolerance}`);
