import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const prefix = '/web-shop/';
const routes = {
  '': ['index.html', 'text/html; charset=utf-8'],
  'web.js': ['web.js', 'text/javascript; charset=utf-8'],
};
const life = 6;
const minute = 60_000;
const money = cents => (cents / 100).toFixed(2);
const requestKey = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const orderKey = /^DS-\d{4,12}$/;
const emailPattern = /^[^@\s]{1,64}@[^@\s]{1,150}\.[^@\s]{2,20}$/;
const png = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/;
const fieldOrder = ['req_time', 'merchant_id', 'tran_id', 'amount', 'items', 'first_name', 'last_name',
  'email', 'phone', 'purchase_type', 'payment_option', 'callback_url', 'return_deeplink', 'currency',
  'custom_fields', 'return_params', 'payout', 'lifetime', 'qr_image_template'];

function reqTime(now) {
  return new Date(now).toISOString().slice(0, 19).replace(/\D/g, '');
}

function signature(body, names, key) {
  return createHmac('sha512', key).update(names.map(name => body[name] ?? '').join('')).digest('base64');
}

export function payway(config, fetchImpl = fetch, clock = Date.now) {
  const origin = config.mode === 'production' ? 'https://checkout.payway.com.kh' : 'https://checkout-sandbox.payway.com.kh';
  async function request(method, body, fields) {
    const response = await fetchImpl(origin + '/api/payment-gateway/v1/payments/' + method, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, hash: signature(body, fields, config.apiKey) }),
    });
    if (!response.ok) throw new Error('PayWay unavailable');
    return response.json();
  }
  return {
    async generate(order) {
      const answer = await request('generate-qr', {
        req_time: reqTime(clock()), merchant_id: config.merchantId, tran_id: order.tranId,
        amount: order.amount / 100, purchase_type: 'purchase', payment_option: 'abapay_khqr',
        currency: 'USD', lifetime: life, qr_image_template: 'template3_color',
      }, fieldOrder);
      if (String(answer.status?.code) !== '0' || answer.currency !== 'USD' ||
          Number(answer.amount) !== order.amount / 100 ||
          typeof answer.qrImage !== 'string' || answer.qrImage.length > 400_000 || !png.test(answer.qrImage)) {
        throw new Error('PayWay did not provide a matching KHQR');
      }
      const deeplink = typeof answer.abapay_deeplink === 'string' && answer.abapay_deeplink.length < 2000 &&
        /^(abamobilebank:\/\/ababank\.com\?|https:\/\/link\.payway\.com\.kh\/)/i.test(answer.abapay_deeplink)
        ? answer.abapay_deeplink : '';
      return { image: answer.qrImage, deeplink };
    },
    async verify(order) {
      const answer = await request('check-transaction-2', {
        req_time: reqTime(clock()), merchant_id: config.merchantId, tran_id: order.tranId,
      }, ['req_time', 'merchant_id', 'tran_id']);
      const data = answer.data;
      if (String(answer.status?.code) !== '00') return 'pending';
      if (answer.status?.tran_id !== order.tranId) return 'review';
      if (data?.payment_status !== 'APPROVED' || data.payment_status_code !== 0) return 'pending';
      return data.payment_currency === 'USD' && Number(data.payment_amount) === order.amount / 100 &&
        Number(data.original_amount) === order.amount / 100 &&
        Number(data.refund_amount ?? 0) === 0 ? 'paid' : 'review';
    },
  };
}

function snapshot(order, qr) {
  return { id: order.id, name: order.name, amount: money(order.amount), status: order.status,
    expires: order.expires, image: order.status === 'pending' && Date.now() < order.expires ? qr?.image : undefined,
    deeplink: order.status === 'pending' && Date.now() < order.expires ? qr?.deeplink : undefined };
}

async function bodyOf(req) {
  const parts = [];
  let bytes = 0;
  for await (const part of req.iterator({ destroyOnReturn: false })) {
    bytes += part.length;
    if (bytes > 4000) { req.resume(); return null; }
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString()); } catch { return null; }
}

export function khqrHandler({ config, store, shop, provider = payway(config.khqr) }) {
  const host = new URL(config.khqr.origin).host;
  const bursts = new Map();
  let total = { until: 0, count: 0 };
  const reply = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  const rate = (req, token, limit) => {
    const time = Date.now();
    if (bursts.size > 300) for (const [key, hit] of bursts) if (time >= hit.until) bursts.delete(key);
    const ip = req.socket.remoteAddress || '';
    const key = token + ':' + ip;
    const hit = bursts.get(key);
    const record = hit && time < hit.until ? hit : { until: time + minute, count: 0 };
    if (bursts.size > 5000 && !hit) return false;
    bursts.set(key, record);
    return ++record.count <= limit;
  };
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    try {
      if (req.headers.host !== host) return reply(res, 404, { error: 'not_found' });
      const path = (req.url || '').split('?', 1)[0].slice(prefix.length);
      if (req.method === 'GET' && path === 'products') {
        return reply(res, 200, { sandbox: config.khqr.mode === 'sandbox',
          products: shop.productsList().filter(p => p.status === 'live' && p.cents)
            .map(p => ({ id: p.id, name: p.name, km: p.km, amount: money(p.cents) })) });
      }
      if (req.method === 'GET' && path === 'web.css') {
        const bytes = await readFile(new URL('../public/catalog/shop-ui.css', import.meta.url));
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
        return res.end(bytes);
      }
      if (req.method === 'GET' && Object.hasOwn(routes, path)) {
        const [file, type] = routes[path];
        const bytes = await readFile(new URL('../public/web-shop/' + file, import.meta.url));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        return res.end(bytes);
      }
      if (req.method !== 'POST' || !['orders', 'status'].includes(path)) return reply(res, 404, { error: 'not_found' });
      if (req.headers.origin !== config.khqr.origin || req.headers['content-type']?.split(';', 1)[0] !== 'application/json') {
        return reply(res, 403, { error: 'origin' });
      }
      if (!rate(req, path, path === 'orders' ? 12 : 100)) return reply(res, 429, { error: 'retry_later' });
      const body = await bodyOf(req);
      if (!body || typeof body !== 'object') return reply(res, 400, { error: 'invalid' });
      if (path === 'status') {
        if (!orderKey.test(body.id || '') || !/^[a-f0-9]{48}$/.test(body.token || '')) return reply(res, 404, { error: 'not_found' });
        const current = store.get('shop_orders', body.id);
        if (current?.method !== 'khqr' || !timingSafeEqual(Buffer.from(current.token), Buffer.from(body.token))) {
          return reply(res, 404, { error: 'not_found' });
        }
        return reply(res, 200, snapshot(current, store.get('shop_qr', current.id)));
      }
      const product = shop.product(body.product);
      const company = typeof body.company === 'string' ? body.company.trim() : '';
      const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
      if (!requestKey.test(body.requestId || '') || !company || company.length > 80 || !emailPattern.test(contact) ||
          product?.status !== 'live' || !product.cents || money(product.cents) !== body.amount) {
        return reply(res, 400, { error: 'invalid_checkout' });
      }
      const existing = store.get('shop_requests', 'web:' + body.requestId);
      if (existing) {
        const order = store.get('shop_orders', existing.orderId);
        if (!order || order.contact !== contact || order.company !== company || order.product !== product.id) {
          return reply(res, 409, { error: 'request_conflict' });
        }
        return reply(res, 200, { ...snapshot(order, store.get('shop_qr', order.id)), token: order.token });
      }
      const time = Date.now();
      if (time > total.until) total = { until: time + minute, count: 0 };
      if (++total.count > 30) return reply(res, 429, { error: 'retry_later' });
      const order = store.transaction(() => {
        const current = store.save('shop_orders', {
          id: store.serial('shop_orders', 'DS'), tranId: randomBytes(10).toString('hex'),
          token: randomBytes(24).toString('hex'), method: 'khqr', currency: 'USD',
          product: product.id, name: product.name, company, contact, amount: product.cents,
          expires: time + life * minute, status: 'pending', created: time, updated: time,
        }, time);
        store.save('shop_requests', { id: 'web:' + body.requestId, orderId: current.id }, time);
        store.queue('shop-qr', 'shop-qr:' + current.id, { id: current.id }, time + 15_000);
        return current;
      });
      try {
        store.save('shop_qr', { id: order.id, ...(await provider.generate(order)) }, Date.now());
      } catch {
        store.save('shop_qr', { id: order.id, uncertain: true }, Date.now());
      }
      return reply(res, 201, { ...snapshot(order, store.get('shop_qr', order.id)), token: order.token });
    } catch {
      if (!res.headersSent && !res.destroyed) reply(res, 503, { error: 'unavailable' });
    }
  };
}

export async function runKhqrJob({ store, config, shop, now = Date.now, provider }, job) {
  const order = store.get('shop_orders', job.payload.id);
  if (!order || order.method !== 'khqr' || order.status !== 'pending') { store.finish(job, 'done', now()); return; }
  if (!config.khqr && !provider) { store.finish(job, 'pending', now() + minute, 'Configure PayWay'); return; }
  let status;
  try { status = await (provider || payway(config.khqr)).verify(order); } catch { status = 'unavailable'; }
  const time = now();
  if (status === 'pending' && time < order.expires + 5 * minute) {
    store.finish(job, 'pending', time + 20_000);
    return;
  }
  if (status === 'unavailable' && time < order.expires + 24 * 60 * minute) {
    store.finish(job, 'pending', time + minute, 'PayWay verification unavailable');
    return;
  }
  store.transaction(() => {
    const current = store.get('shop_orders', order.id);
    if (current?.status === 'pending') {
      const state = status === 'paid' ? 'paid' : status === 'pending' ? 'expired' : 'review';
      const next = store.save('shop_orders', { ...current, status: state, updated: time }, time);
      store.forget('shop_qr', order.id);
      if (state === 'paid') shop.notifyPaid(next);
      if (state === 'review') store.queue('telegram', 'shop-qr-review:' + order.id, {
        method: 'sendMessage', body: { chat_id: config.salesChat,
          text: 'ពិនិត្យប្រតិបត្តិការ KHQR · ' + order.id + '\nPayWay: ' + order.tranId },
      }, time);
    }
    store.finish(job, 'done', time);
  });
}
