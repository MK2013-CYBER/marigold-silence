import { defineConfig } from 'vite';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Keeps a copy of the player's save on disk, in saves/save.json, so it survives the browser's
 * storage being cleared. The game GETs it on start, POSTs it as it saves, DELETEs it on "new game".
 */
function saveFile() {
  const dir = fileURLToPath(new URL('./saves/', import.meta.url));
  const file = `${dir}save.json`;
  const handle = (req, res, next) => {
    if (req.url.split('?')[0] !== '/__save') return next();
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') {
      if (!existsSync(file)) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', 'application/json');
      return res.end(readFileSync(file));
    }
    if (req.method === 'DELETE') { rmSync(file, { force: true }); res.statusCode = 204; return res.end(); }
    if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 4e6) req.destroy(); });
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        if (d?.version !== 1) throw new Error('not a save');
        // Several game tabs can be open. A tab may write if the save on disk is its own, or is no newer
        // than the save it started from (?base=). Otherwise another tab has made progress since:
        // refuse (409), and that tab reloads the newer game instead of overwriting it.
        const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
        const base = Number(new URL(req.url, 'http://x').searchParams.get('base')) || 0;
        const mine = old && old.writer && old.writer === d.writer;
        if (old && !(mine ? (d.savedAt ?? 0) >= (old.savedAt ?? 0) : (old.savedAt ?? 0) <= base)) { res.statusCode = 409; return res.end(); }
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${file}.tmp`, body);
        renameSync(`${file}.tmp`, file); // all or nothing: a half-written save can't happen
        res.statusCode = 204;
      } catch { res.statusCode = 400; }
      res.end();
    });
  };
  return {
    name: 'marigold-save-file',
    configureServer(server) { server.middlewares.use(handle); },
    configurePreviewServer(server) { server.middlewares.use(handle); },
  };
}

export default defineConfig({
  base: './',
  plugins: [saveFile()],
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/saves/**'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
