import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { buildRouter } from './routes.js';
import { AppError } from '../core/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function createServer(app) {
  const router = buildRouter(app);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(app, router, req, res, url);
      }
      return await handleStatic(res, url);
    } catch (err) {
      sendError(res, err);
    }
  });
}

async function handleApi(app, router, req, res, url) {
  const match = router.match(req.method, url.pathname);
  if (!match) return sendJson(res, 404, { error: 'Not found', code: 'not_found' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;
  const user = app.auth.userForToken(token);
  const body = await readBody(req);
  const query = Object.fromEntries(url.searchParams.entries());
  const ip = (req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').toString().split(',')[0];

  const result = await match.handler({ user, token, params: match.params, body, query, ip });

  if (result && result._raw !== undefined) {
    res.writeHead(result._status ?? 200, { 'content-type': result._contentType ?? 'text/plain' });
    return res.end(result._raw);
  }
  sendJson(res, result?._status ?? 200, result?._body ?? result ?? { ok: true });
}

async function handleStatic(res, url) {
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = normalize(join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'DELETE') return resolve({});
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 5 * 1024 * 1024) reject(new AppError('Request body too large', 413));
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new AppError('Invalid JSON body', 400));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendError(res, err) {
  const status = err instanceof AppError ? err.status : 500;
  if (status === 500) console.error('[server] unhandled error:', err);
  sendJson(res, status, {
    error: err.message ?? 'Internal error',
    code: err.code ?? 'internal_error',
    details: err.details,
  });
}
