#!/usr/bin/env node
/**
 * Roll the vault back up into a single HTML file.
 *
 *   node tools/bundle.mjs              # dist/vault.html   — a complete document
 *   node tools/bundle.mjs --artifact   # dist/artifact.html — for publishing
 *   node tools/bundle.mjs --debug      # skip minification
 *
 * Two shapes, because they go to different places. The standalone file is a
 * whole document you can open from disk or drop on any static host. The
 * artifact file is fragment-shaped: claude.ai wraps what you publish in its own
 * doctype/head/body, so that build emits the <title>, <style> and content
 * without a skeleton of its own.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STYLES = ['src/styles/tokens.css', 'src/styles/app.css'];
const ENTRY = 'src/js/main.js';

/** A closing tag inside a string literal would end the block early. */
const escapeForScript = (js) => js.replace(/<\/(script)/gi, '<\\/$1');
const escapeForStyle = (css) => css.replace(/<\/(style)/gi, '<\\/$1');

async function bundleScript({ minify }) {
  const result = await esbuild.build({
    entryPoints: [join(ROOT, ENTRY)],
    bundle: true,
    format: 'iife',
    target: ['es2022'],
    minify,
    write: false,
    legalComments: 'none',
    logLevel: 'warning'
  });
  return result.outputFiles[0].text;
}

async function bundleStyles() {
  const parts = [];
  for (const path of STYLES) parts.push(await readFile(join(ROOT, path), 'utf8'));
  return parts.join('\n');
}

/**
 * Pull the body of the shell out of index.html and swap the external <link>
 * and <script> references for the inlined bundles.
 */
function shellBody(html) {
  const match = html.match(/<body>([\s\S]*?)<\/body>/i);
  if (!match) throw new Error('index.html: no <body> to extract');
  return match[1]
    .replace(/\s*<script type="module"[^>]*><\/script>/i, '')
    .trim();
}

function documentTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!match) throw new Error('index.html: no <title>');
  return match[1].trim();
}

function metaDescription(html) {
  const match = html.match(/<meta name="description" content="([^"]*)"/i);
  return match ? match[1] : '';
}

async function main() {
  const minify = !process.argv.includes('--debug');
  const artifact = process.argv.includes('--artifact');

  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const [script, styles] = await Promise.all([bundleScript({ minify }), bundleStyles()]);

  const title = documentTitle(html);
  const body = shellBody(html);
  const style = `<style>\n${escapeForStyle(styles)}\n</style>`;
  const inline = `<script>\n${escapeForScript(script)}\n</script>`;

  let out;
  let name;

  if (artifact) {
    // No doctype/html/head/body: claude.ai supplies the skeleton.
    name = 'artifact.html';
    out = `<title>${title}</title>\n${style}\n${body}\n${inline}\n`;
  } else {
    name = 'vault.html';
    out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="${metaDescription(html)}">
<title>${title}</title>
${style}
</head>
<body>
${body}
${inline}
</body>
</html>
`;
  }

  await mkdir(join(ROOT, 'dist'), { recursive: true });
  await writeFile(join(ROOT, 'dist', name), out, 'utf8');

  const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
  console.log(`bundle: dist/${name} — ${kb} KB${minify ? '' : ' (unminified)'}`);
}

await main();
