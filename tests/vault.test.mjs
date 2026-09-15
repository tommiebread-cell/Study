/**
 * Content and tooling checks that do not need a browser: the link graph, the
 * tool registry, and the generated snippets.
 *
 * graph.js touches `document` only inside plainText(), so the module imports
 * fine under Node and the structural assertions below run without a DOM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { NOTES } from '../src/js/notes.js';
import { byId, OUT, BACK, EDGES, FOLDERS, renderBody } from '../src/js/graph.js';
import { SNIPPETS } from '../src/js/snippets.generated.js';
import { extractRegion } from '../tools/snippets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIKILINK = /\[\[([a-z0-9:-]+)(?:\|[^\]]+)?\]\]/g;

const KNOWN_TOOLS = new Set([
  'hero', 'planner', 'pomodoro',
  'grid', 'nickell', 'counter', 'chooser', 'diag', 'code', 'walk',
  'impl', 'cards', 'quiz', 'queue', 'mc', 'weak'
]);

// The two entry points: Today is where the app lands, Start here is the map.
const ROOTS = new Set(['today', 'start-here']);

test('every note has the fields the renderer needs', () => {
  for (const note of NOTES) {
    assert.match(note.id, /^[a-z0-9-]+$/, `bad id: ${note.id}`);
    assert.ok(note.title?.length, `${note.id} has no title`);
    assert.ok(note.folder?.length, `${note.id} has no folder`);
    assert.ok(Array.isArray(note.tags), `${note.id} has no tags array`);
    assert.ok(note.body?.trim().length, `${note.id} has an empty body`);
  }
});

test('note ids are unique', () => {
  const seen = new Set();
  for (const note of NOTES) {
    assert.ok(!seen.has(note.id), `duplicate id: ${note.id}`);
    seen.add(note.id);
  }
  assert.equal(seen.size, byId.size);
});

test('every wikilink resolves', () => {
  const broken = [];
  for (const note of NOTES) {
    WIKILINK.lastIndex = 0;
    let match;
    while ((match = WIKILINK.exec(note.body)) !== null) {
      if (!byId.has(match[1])) broken.push(`${note.id} → ${match[1]}`);
    }
  }
  assert.deepEqual(broken, [], `unresolved links: ${broken.join(', ')}`);
});

test('no note is orphaned from the map of content', () => {
  for (const note of NOTES) {
    if (ROOTS.has(note.id)) continue;
    assert.ok(BACK.get(note.id).length > 0, `${note.id} has no backlinks`);
  }
});

test('the landing note exists and carries the daily tools', () => {
  const today = NOTES.find((note) => note.id === 'today');
  assert.ok(today, 'there is no Today note to land on');
  assert.deepEqual(today.tools, ['hero', 'planner', 'pomodoro']);
  assert.equal(today.folder, 'Daily');
});

test('forward links and backlinks are consistent', () => {
  for (const note of NOTES) {
    for (const target of OUT.get(note.id)) {
      assert.ok(BACK.get(target).includes(note.id), `${target} is missing a backlink from ${note.id}`);
    }
  }
});

test('the edge list holds one entry per linked pair', () => {
  const keys = EDGES.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`));
  assert.equal(new Set(keys).size, EDGES.length, 'edges contain a duplicate pair');
  for (const [a, b] of EDGES) {
    assert.ok(byId.has(a) && byId.has(b));
    assert.ok(OUT.get(a).includes(b) || OUT.get(b).includes(a));
  }
});

test('every declared tool exists, and every slot has one', () => {
  for (const note of NOTES) {
    const slots = (note.body.match(/<div data-tool><\/div>/g) ?? []).length;
    const tools = note.tools ?? [];
    assert.equal(slots, tools.length, `${note.id}: ${slots} slots but ${tools.length} tools`);
    for (const tool of tools) {
      assert.ok(KNOWN_TOOLS.has(tool), `${note.id} declares unknown tool "${tool}"`);
    }
  }
});

test('folders are discovered in note order and none is empty', () => {
  for (const folder of FOLDERS) {
    assert.ok(NOTES.some((note) => note.folder === folder), `${folder} has no notes`);
  }
});

test('renderBody turns wikilinks into anchors and escapes labels', () => {
  const html = renderBody('see [[nickell-bias|Nickell bias]] now');
  assert.match(html, /<a class="wl" href="#nickell-bias" data-open="nickell-bias">Nickell bias<\/a>/);

  const unresolved = renderBody('[[not-a-note|missing]]');
  assert.match(unresolved, /class="wl unres"/);
  assert.doesNotMatch(unresolved, /<a /);
});

test('generated snippets cover every language and are non-trivial', () => {
  const expected = ['stata', 'r', 'javascript', 'csharp', 'cpp'];
  assert.deepEqual(Object.keys(SNIPPETS), expected);

  for (const [key, snippet] of Object.entries(SNIPPETS)) {
    assert.ok(snippet.language?.length, `${key} has no language label`);
    assert.ok(snippet.file?.length, `${key} has no source path`);
    assert.ok(snippet.code.split('\n').length > 5, `${key} snippet looks truncated`);
    assert.doesNotMatch(snippet.code, /#region|#endregion/, `${key} kept its markers`);
    assert.doesNotMatch(snippet.code, /^\s*$/, `${key} snippet is blank`);
  }
});

test('generated snippets still match their source files', async () => {
  for (const [key, snippet] of Object.entries(SNIPPETS)) {
    const source = await readFile(join(ROOT, snippet.file), 'utf8');
    assert.equal(extractRegion(source, 'core', snippet.file), snippet.code,
      `${key} is stale — run \`npm run snippets\``);
  }
});

test('extractRegion reports a missing or unclosed region rather than guessing', () => {
  assert.throws(() => extractRegion('nothing here', 'core', 'x'), /no "#region snippet:core"/);
  assert.throws(() => extractRegion('// #region snippet:core\ncode', 'core', 'x'), /never closed/);
  assert.throws(() => extractRegion('// #region snippet:core\n\n// #endregion', 'core', 'x'), /is empty/);
});

test('the three ported implementations stay in step', async () => {
  const js = await readFile(join(ROOT, 'src/js/sim/gmm.js'), 'utf8');
  const cs = await readFile(join(ROOT, 'reference/csharp/DynamicPanel/Estimators.cs'), 'utf8');
  const cpp = await readFile(join(ROOT, 'reference/cpp/gmm.cpp'), 'utf8');
  const cppHeader = await readFile(join(ROOT, 'reference/cpp/gmm.hpp'), 'utf8');

  // The burn-in length is part of the shared DGP contract; if one drifts, the
  // crosscheck fails in a way that is much harder to read than this.
  assert.match(js, /BURN_IN = 20/);
  assert.match(cs, /BurnIn = 20/);
  assert.match(cppHeader, /kBurnIn = 20/);

  for (const [name, source] of [['js', js], ['csharp', cs], ['cpp', cpp]]) {
    assert.match(source, /1e-8/, `${name} dropped the ridge on the weight matrix`);
  }
});
