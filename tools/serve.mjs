#!/usr/bin/env node
/**
 * Static file server for local development.
 *
 * ES modules are fetched, not read off disk, so `file://` refuses them on CORS
 * grounds. This exists so `npm start` is all you need — no dependencies, no
 * build step.
 *
 *   node tools/serve.mjs [--port 8080] [--host 127.0.0.1]
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

function parseArgs(argv) {
  const options = { port: 8080, host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) options.port = Number(argv[++i]);
    else if (argv[i] === '--host' && argv[i + 1]) options.host = argv[++i];
  }
  return options;
}

/** Resolve a request path inside ROOT, or null if it tries to escape. */
function resolve(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (decoded.endsWith('/')) decoded += 'index.html';

  const resolved = normalize(join(ROOT, decoded));
  // normalize() collapses "..", so this catches traversal after the fact.
  return resolved === ROOT || resolved.startsWith(ROOT + sep) ? resolved : null;
}

const { port, host } = parseArgs(process.argv.slice(2));

const server = createServer(async (request, response) => {
  const path = resolve(request.url || '/');
  if (!path) {
    response.writeHead(403, { 'content-type': 'text/plain' }).end('Forbidden');
    return;
  }

  try {
    const info = await stat(path);
    if (info.isDirectory()) {
      response.writeHead(302, { location: `${request.url.replace(/\/?$/, '')}/` }).end();
      return;
    }
    response.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    createReadStream(path).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`GMM vault → http://${host}:${port}/`);
});
