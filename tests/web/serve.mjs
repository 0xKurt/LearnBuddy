// Serves the app's static web build with single-page fallback (browser
// walkthrough only). Usage: node tests/web/serve.mjs <dir> <port>
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'apps/mobile/dist-web');
const port = Number(process.argv[3] ?? 8081);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

http
  .createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
    let file = resolve(join(root, path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(root, 'index.html');
    }
    try {
      const body = await readFile(file);
      res
        .writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(port, () => console.info(`[serve] ${root} on http://localhost:${port}`));
