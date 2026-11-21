import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const maxBody = 16_384;
const maxAge = 3600;
const root = '/catalog/';
const files = {
  '': ['index.html', 'text/html; charset=utf-8'],
  'catalog.css': ['catalog.css', 'text/css; charset=utf-8'],
  'catalog.js': ['catalog.js', 'text/javascript; charset=utf-8'],
  'staffday.webp': ['staffday.webp', 'image/webp'],
  'inventra.webp': ['inventra.webp', 'image/webp'],
  'luyvio.webp': ['luyvio.webp', 'image/webp'],
  'fleetday.webp': ['fleetday.webp', 'image/webp'],
  'welcome.jpg': ['welcome.jpg', 'image/jpeg'],
  'khmer.ttf': ['khmer.ttf', 'font/ttf'],
  'khmer-bold.ttf': ['khmer-bold.ttf', 'font/ttf'],
};
const chatActions = new Set(['staffday', 'inventra', 'luyvio', 'fleetday', 'mine', 'contact']);
const languages = new Set(['km', 'en']);

export function telegramProfile(initData, token, now = Date.now()) {
  if (typeof initData !== 'string') return;
  const fields = new URLSearchParams(initData);
  if (new Set(fields.keys()).size !== fields.size) return;
  const hash = fields.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return;
  const date = Number(fields.get('auth_date'));
  const age = Math.floor(now / 1000) - date;
  if (!Number.isSafeInteger(date) || age < -60 || age > maxAge) return;
  fields.delete('hash');
  fields.sort();
  const checkString = [...fields].map(([key, value]) => key + '=' + value).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return;
  try {
    const user = JSON.parse(fields.get('user'));
    if (Number.isSafeInteger(user?.id) && user.id > 0 && !user.is_bot) return user;
  } catch {
    return;
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > maxBody) {
      req.resume();
      return;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return;
  }
}

export function catalogHandler({ config, bot }) {
  if (!config.catalogOrigin) return;
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const path = req.url.split('?', 1)[0].slice(root.length);
      if (path === 'api') {
        if (req.method !== 'POST') return json(res, 405, { error: 'method' });
        if (req.headers.origin && req.headers.origin !== config.catalogOrigin) {
          return json(res, 403, { error: 'origin' });
        }
        if (req.headers['content-type']?.split(';', 1)[0] !== 'application/json') {
          return json(res, 415, { error: 'content_type' });
        }
        const body = await readBody(req);
        if (!body || typeof body !== 'object') return json(res, 400, { error: 'invalid_request' });
        const profile = telegramProfile(body.initData, config.token);
        if (!profile) return json(res, 401, { error: 'telegram_session' });
        const { action, language, requestId } = body;
        const valid = action === 'session' || (action === 'language' && languages.has(language)) ||
          (chatActions.has(action) && typeof requestId === 'string' &&
            /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId));
        if (!valid) return json(res, 400, { error: 'invalid_action' });
        return json(res, 200, bot.catalogAction({ profile, action, language, requestId }));
      }
      if (!Object.hasOwn(files, path)) return json(res, 404, { error: 'not_found' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' });
      const [name, type] = files[path];
      const content = await readFile(new URL('../public/catalog/' + name, import.meta.url));
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': content.length,
        'Cache-Control': path ? 'public, max-age=3600' : 'no-cache',
        'Content-Security-Policy': "default-src 'none'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://web.telegram.org",
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      console.error('Catalog request failed:', error.code || error.name);
      if (!res.headersSent && !res.destroyed) json(res, 500, { error: 'unavailable' });
    }
  };
}
