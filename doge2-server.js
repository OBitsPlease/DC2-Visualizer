// doge2-server.js
// Serves the DOGE2 visualizer HTML and proxies READ-ONLY RPC calls.
// Wallet methods are hard-blocked so exposing this via Cloudflare is safe.

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 3100;
const RPC_HOST  = '127.0.0.1';
const RPC_PORT  = 22655;
const RPC_USER  = 'doge2rpc';
const RPC_PASS  = 'Doge2RpcPass2026!';
const HTML_FILE = path.join(__dirname, 'doge2-visualizer.html');
const AUTH      = Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString('base64');

// ── Allowlist: ONLY these read-only methods are forwarded ──────
const ALLOWED_METHODS = new Set([
  'getblockchaininfo',
  'getblockcount',
  'getblockhash',
  'getblock',
  'getbestblockhash',
  'getblockheader',
  'getmininginfo',
  'getnetworkinfo',
  'getpeerinfo',
  'getmempoolinfo',
  'getrawmempool',
  'getrawtransaction',
  'decoderawtransaction',
  'gettxout',
  'getchaintips',
  'getdifficulty',
  'getnettotals',
]);

// Anything not in ALLOWED_METHODS is rejected — this protects your wallet.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = http.createServer((req, res) => {
  // ── CORS preflight ─────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  // ── Serve the visualizer HTML ──────────────────────────────
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    fs.readFile(HTML_FILE, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Could not read visualizer HTML');
      }
      res.writeHead(200, { ...CORS, 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // ── Serve music files ─────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/music/')) {
    const parts = req.url.slice(7).split('/');
    let trackPath;
    if (parts.length === 2) {
      // /music/<genre>/<file>
      const genre     = parts[0].replace(/[^a-zA-Z0-9_\-]/g, '');
      const trackName = decodeURIComponent(parts[1]).replace(/[^a-zA-Z0-9.\-_ ]/g, '');
      trackPath = path.join(__dirname, 'music', genre, trackName);
    } else {
      // legacy /music/<file>
      const trackName = decodeURIComponent(parts[0]).replace(/[^a-zA-Z0-9.\-_ ]/g, '');
      trackPath = path.join(__dirname, 'music', trackName);
    }
    fs.stat(trackPath, (err, stat) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      const range = req.headers.range;
      if (range) {
        const rangeParts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(rangeParts[0], 10);
        const end   = rangeParts[1] ? parseInt(rangeParts[1], 10) : stat.size - 1;
        res.writeHead(206, {
          ...CORS,
          'Content-Type': 'audio/mpeg',
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
        });
        fs.createReadStream(trackPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { ...CORS, 'Content-Type': 'audio/mpeg', 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(trackPath).pipe(res);
      }
    });
    return;
  }

  // ── List music tracks by genre ─────────────────────────────
  if (req.method === 'GET' && req.url === '/music') {
    const musicDir = path.join(__dirname, 'music');
    fs.readdir(musicDir, { withFileTypes: true }, (err, entries) => {
      if (err) {
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({}));
      }
      const genres = {};
      const dirs = entries.filter(e => e.isDirectory());
      // Also include root-level mp3s under 'default' for backwards compat
      const rootMp3s = entries.filter(e => e.isFile() && e.name.endsWith('.mp3')).map(e => e.name);
      if (rootMp3s.length) genres['default'] = rootMp3s;

      let pending = dirs.length;
      if (pending === 0) {
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(genres));
      }
      dirs.forEach(d => {
        fs.readdir(path.join(musicDir, d.name), (e2, files) => {
          genres[d.name] = e2 ? [] : files.filter(f => f.endsWith('.mp3'));
          if (--pending === 0) {
            res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(genres));
          }
        });
      });
    });
    return;
  }

  // ── Serve icon images ──────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/icons/')) {
    const iconName = req.url.slice(7).replace(/[^a-zA-Z0-9.\-_]/g, ''); // sanitise
    const iconPath = path.join(__dirname, 'icons', iconName);
    fs.readFile(iconPath, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(iconName).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.ico' ? 'image/x-icon' : 'application/octet-stream';
      res.writeHead(200, { ...CORS, 'Content-Type': mime });
      res.end(data);
    });
    return;
  }

  // ── RPC proxy endpoint ─────────────────────────────────────
  if (req.method === 'POST' && req.url === '/rpc') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      // Parse and validate the request
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }

      const method = parsed.method;

      // ── SECURITY: block anything not on the allowlist ──────
      if (!method || !ALLOWED_METHODS.has(method)) {
        console.warn(`[BLOCKED] RPC method not allowed: "${method}"`);
        res.writeHead(403, { ...CORS, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `Method "${method}" is not permitted`, result: null }));
      }

      // Forward to daemon
      const options = {
        hostname: RPC_HOST,
        port: RPC_PORT,
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': `Basic ${AUTH}`,
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const proxy = http.request(options, rpcRes => {
        let data = '';
        rpcRes.on('data', d => data += d);
        rpcRes.on('end', () => {
          res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
          res.end(data);
        });
      });

      proxy.on('error', e => {
        console.error('RPC error:', e.message);
        res.writeHead(502, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Daemon unreachable: ' + e.message, result: null }));
      });

      proxy.write(body);
      proxy.end();
    });
    return;
  }

  // ── Anything else → 404 ────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`DOGE2 visualizer server running on http://127.0.0.1:${PORT}`);
  console.log(`RPC allowlist: ${[...ALLOWED_METHODS].join(', ')}`);
});
