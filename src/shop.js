import { randomBytes, randomUUID } from 'node:crypto';
import { localDateEnd, formattedDate } from './config.js';

const keyPattern = /^[a-z][a-z0-9-]{1,23}$/;
const threadPattern = /^CH-\d{4,12}$/;
const orderPattern = /^DS-\d{4,12}$/;
const imageNames = new Set(['staffday.webp', 'inventra.webp', 'luyvio.webp', 'fleetday.webp']);
const day = 86_400_000;
const hold = 10 * 60_000;
const statuses = new Set(['draft', 'live', 'hidden']);
const compact = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value, max) => Number.isInteger(value) && value > 0 && value <= max ? value : null;
export const result = (body, status = 200) => ({ body, status });
const failure = (error, status = 400) => result({ error }, status);
const inline = (text, callback_data) => ({ text, callback_data });
const urlButton = (text, url) => ({ text, url });
const markup = button => ({ inline_keyboard: [[button]] });
const productName = p => p?.name || 'Dalin Mini Apps';

function https(value) {
  if (!value) return '';
  const url = URL.parse(value);
  return url?.protocol === 'https:' && !url.username && !url.password && value.length <= 700 ? url.href : null;
}

export function createShop({ store, config, clock = Date.now, products = {} }) {
  const defaults = Object.entries(products).map(([id, item]) => ({
    id, name: item.name, km: item.details, en: item.en, status: 'live',
    image: id + '.webp', trialUrl: '', stars: null, cents: null,
  }));
  const now = () => clock();
  const owner = id => config.owners?.has(id) === true;
  const seller = id => owner(id) || config.sellers?.has(id) === true;
  const language = id => store.get('preferences', id)?.language === 'en' ? 'en' : 'km';
  const tr = (id, km, en) => language(id) === 'en' ? en : km;
  const send = (id, chat, text, reply_markup) => store.queue('telegram', id, {
    method: 'sendMessage', body: { chat_id: chat, text, reply_markup, link_preview_options: { is_disabled: true } },
  }, now());
  const deepLink = payload => config.botUsername ? 'https://t.me/' + config.botUsername + '?start=' + payload : '';
  const product = id => store.get('shop_products', id) || defaults.find(row => row.id === id);
  const productsList = () => {
    const rows = new Map(defaults.map(row => [row.id, row]));
    for (const row of store.all('shop_products')) rows.set(row.id, row);
    return [...rows.values()];
  };
  const isLive = id => product(id)?.status === 'live';
  const promos = () => store.all('shop_promos');
  const activePromo = (id, time = now()) => promos().filter(p =>
    p.product === id && p.state === 'published' && p.expires > time
  ).sort((a, b) => b.created - a.created)[0];
  const starsQuote = (id, time = now(), regular = product(id)?.stars) => {
    const promo = activePromo(id, time);
    return promo ? { amount: promo.stars, expires: promo.expires, promo: promo.id } :
      { amount: regular, expires: null, promo: null };
  };
  const publicItem = row => ({
    id: row.id, name: row.name, km: row.km, en: row.en, image: row.image, imageUrl: row.imageUrl,
    stars: config.stars ? starsQuote(row.id).amount : null,
    regularStars: config.stars ? row.stars : null,
    promotionEnds: config.stars ? starsQuote(row.id).expires : null,
  });

  function saveProduct(body, user) {
    const id = compact(body.id, 30), name = compact(body.name, 65);
    const km = compact(body.km, 240), en = compact(body.en, 240);
    const old = product(id), trialUrl = https(compact(body.trialUrl, 701));
    const imageUrl = https(compact(body.imageUrl, 701));
    const stars = body.stars === null ? null : number(body.stars, 10000);
    const cents = body.cents === null ? null : number(body.cents, 1_000_000);
    if (!keyPattern.test(id) || !name || !km || !en || !statuses.has(body.status) ||
        typeof body.trialUrl !== 'string' || typeof body.imageUrl !== 'string' ||
        trialUrl === null || imageUrl === null || (body.stars !== null && !stars) || (body.cents !== null && !cents)) {
      return failure('product_invalid');
    }
    if (Boolean(old) !== Boolean(body.editing)) return failure('product_conflict', 409);
    if (old && old.revision !== body.revision) return failure('product_conflict', 409);
    const pendingPromo = promos().some(p => p.product === id && p.expires > now() &&
      ['queued', 'sending', 'published'].includes(p.state));
    const publishing = promos().some(p => p.product === id && p.state === 'sending');
    if ((publishing && body.status !== 'live') ||
        (pendingPromo && body.status === 'live' && (name !== old?.name || stars !== old?.stars))) {
      return failure('promo_active', 409);
    }
    if (body.status !== 'live') {
      for (const p of promos().filter(p => p.product === id && p.expires > now() && ['queued', 'published'].includes(p.state))) endPromo(p.id);
    }
    const row = store.save('shop_products', {
      id, name, km, en, trialUrl, imageUrl, stars, cents, status: body.status,
      image: imageNames.has(old?.image) ? old.image : '', updated: now(), updatedBy: user,
      revision: (old?.revision || 0) + 1,
    }, now());
    return result(row);
  }

  function promoText(p) {
    return [
      '🎉 ' + p.name,
      p.regular + ' → ' + p.stars + ' Stars',
      'មានសុពលភាពដល់ ' + formattedDate(p.expires),
      p.note,
    ].filter(Boolean).join('\n');
  }

  function makePromo(body, user) {
    const row = product(body.product), stars = number(body.stars, 10000);
    const expires = localDateEnd(body.date), video = https(compact(body.video, 701));
    if (!config.stars || row?.status !== 'live' || !row.stars || !stars || stars >= row.stars ||
        !expires || expires <= now() || expires > now() + 90 * day || video === null) {
      return failure('promo_invalid');
    }
    const p = store.save('shop_promos', {
      id: randomBytes(8).toString('hex'), product: row.id, name: row.name, regular: row.stars,
      stars, expires, video, note: compact(body.note, 400), state: 'draft', created: now(), owner: user,
    }, now());
    return result({ ...p, preview: promoText(p) });
  }

  function publishPromo(id) {
    const p = store.get('shop_promos', id);
    if (!p) return failure('not_found', 404);
    if (['queued', 'sending', 'published'].includes(p.state)) return result(p);
    if (!config.promotionsChat || !config.botUsername) return failure('channel_unconfigured', 409);
    if (!['draft', 'failed'].includes(p.state) || p.expires <= now()) return failure('promo_invalid', 409);
    const row = product(p.product);
    if (row?.status !== 'live' || row.stars !== p.regular || row.name !== p.name ||
        promos().some(other => other.id !== id && other.product === p.product && other.expires > now() &&
          ['queued', 'sending', 'published'].includes(other.state))) return failure('promo_stale', 409);
    const attempt = (p.attempt || 0) + 1;
    store.queue('shop-promo', 'shop-promo:' + id + ':' + attempt, { id, attempt }, now());
    return result(store.save('shop_promos', { ...p, attempt, state: 'queued', channel: config.promotionsChat }, now()));
  }

  function endPromo(id) {
    const p = store.get('shop_promos', id);
    if (!p || !['queued', 'published'].includes(p.state) || p.expires <= now()) return failure('promo_invalid', 409);
    if (p.messageId && p.channel) {
      const note = promoText(p) + '\nប្រូម៉ូសិននេះបានបញ្ចប់។';
      store.queue('telegram', 'shop-end:' + p.id, {
        method: p.video ? 'editMessageCaption' : 'editMessageText',
        body: { chat_id: p.channel, message_id: p.messageId,
          [p.video ? 'caption' : 'text']: note, reply_markup: { inline_keyboard: [] } },
      }, now());
    }
    return result(store.save('shop_promos', { ...p, state: 'ended', ended: now() }, now()));
  }

  function thread(id, user) {
    if (!threadPattern.test(id || '')) return null;
    const current = store.get('shop_threads', id);
    return current && (current.buyer === user || seller(user)) ? current : null;
  }

  function createThread(user, body) {
    const id = body.product || 'general';
    if (id !== 'general' && !isLive(id)) return failure('not_found', 404);
    const text = compact(body.text, 1600);
    if (!text) return failure('message_empty');
    const existing = store.all('shop_threads').find(row => row.buyer === user && row.product === id && row.status === 'open');
    const current = existing || store.save('shop_threads', {
      id: store.serial('shop_threads', 'CH'), buyer: user, product: id, name: productName(product(id)),
      status: 'open', updated: now(), created: now(),
    }, now());
    return writeThread(current, user, text);
  }

  function writeThread(current, user, text) {
    if (current.status !== 'open') return failure('thread_closed', 409);
    if (!text) return failure('message_empty');
    const fromBuyer = user === current.buyer;
    const id = store.serial('shop_messages', 'MSG');
    store.save('shop_messages', { id, thread: current.id, fromBuyer, text, created: now() }, now());
    const next = store.save('shop_threads', { ...current, updated: now() }, now());
    const label = current.name + ' · ' + current.id + '\n' + text;
    if (fromBuyer) {
      send('shop-message:' + id, config.salesChat, label, markup(inline('ឆ្លើយតប', 'shop-r:' + current.id)));
    } else {
      send('shop-message:' + id, current.buyer, label,
        markup(inline(tr(current.buyer, 'ឆ្លើយតប', 'Reply'), 'shop-m:' + current.id)));
    }
    return result(next);
  }

  function invoice(user, id, company) {
    const row = product(id), quote = starsQuote(id);
    if (!config.stars || row?.status !== 'live' || !quote.amount) return failure('checkout_disabled', 409);
    if (!company) return failure('company_required');
    // Existing paid orders for the same company must be fulfilled before a renewal.
    const candidates = store.all('shop_orders').filter(o => o.method === 'stars' && o.buyer === user &&
      o.product === id && o.company.toLocaleLowerCase() === company.toLocaleLowerCase());
    if (candidates.some(o => ['paid', 'refund_pending', 'review'].includes(o.status))) return failure('order_pending', 409);
    const pending = candidates.find(o => o.status === 'pending' &&
      (o.checkedAt > now() - hold || (o.amount === quote.amount && o.promo === quote.promo && o.created > now() - day)));
    if (pending) return result({ id: pending.id, status: pending.status });
    const activeLegacy = id === 'staffday' && store.all('orders').some(order => {
      const lead = store.get('leads', order.leadId);
      return order.buyer === user && ['pending', 'paid', 'refund_pending', 'payment_review'].includes(order.status) &&
        lead?.company?.toLocaleLowerCase() === company.toLocaleLowerCase();
    });
    if (activeLegacy) return failure('order_pending', 409);
    const order = store.save('shop_orders', {
      id: store.serial('shop_orders', 'DS'), product: id, name: row.name, buyer: user, company,
      amount: quote.amount, currency: 'XTR', method: 'stars', promo: quote.promo, status: 'pending',
      created: now(), updated: now(), payload: 'ds:' + randomUUID(),
    }, now());
    store.queue('telegram', 'shop-invoice:' + order.id, { method: 'sendInvoice', body: {
      chat_id: user, title: row.name + ' · 1 month',
      description: tr(user, 'សិទ្ធិប្រើ ១ ខែ · ', 'One month of access · ') + company,
      payload: order.payload, provider_token: '', currency: 'XTR', start_parameter: id,
      prices: [{ label: row.name, amount: order.amount }],
    } }, now());
    return result({ id: order.id, status: order.status });
  }

  function verifyCheckout(query) {
    const order = store.all('shop_orders').find(o => o.payload === query.invoice_payload);
    const time = now();
    const quote = order && starsQuote(order.product, time);
    const matches = Boolean(config.stars && order &&
      order.status === 'pending' && String(query.from.id) === order.buyer &&
      query.currency === 'XTR' && query.total_amount === order.amount);
    const same = matches && order.checkId === query.id && order.checkedAt > time - hold;
    const newCheck = matches && isLive(order.product) && time - order.created < day &&
      !(order.checkedAt > time - hold) && quote.amount === order.amount && quote.promo === order.promo;
    if (newCheck) store.save('shop_orders', { ...order, checkId: query.id, checkedAt: time, updated: time }, time);
    const ok = Boolean(same || newCheck);
    return { pre_checkout_query_id: query.id, ok, ...(ok ? {} : {
      error_message: tr(String(query.from.id), 'តម្លៃ ឬស្ថានភាពបញ្ជាទិញបានផ្លាស់ប្តូរ។ សូមបើកហាងឡើងវិញ។',
        'The order or price has changed. Reopen the shop to try again.'),
    }) };
  }

  function recordPayment(user, payment) {
    const orders = store.all('shop_orders');
    const charge = payment.telegram_payment_charge_id;
    if (charge && orders.some(o => o.charge === charge)) return;
    const order = orders.find(o => o.payload === payment.invoice_payload);
    if (!order) return;
    if (order.buyer !== user || order.amount !== payment.total_amount || payment.currency !== 'XTR' ||
        !charge || order.status !== 'pending' || !order.checkId) {
      send('shop-payment-review:' + (charge || order.id), config.salesChat,
        'ត្រូវពិនិត្យការទូទាត់ Stars · ' + order.id);
      if (order.buyer === user && charge && order.status === 'pending') {
        store.save('shop_orders', { ...order, charge, status: 'review', updated: now() }, now());
      }
      return;
    }
    const paid = store.save('shop_orders', { ...order, charge, status: 'paid', updated: now() }, now());
    notifyPaid(paid);
  }

  function notifyPaid(order) {
    send('shop-paid-sales:' + order.id, config.salesChat, 'បានទទួលប្រាក់ · ' + order.name + ' · ' + order.id +
      '\n' + order.company + (order.contact ? '\n' + order.contact : '') + '\nOwner · Orders');
    if (order.buyer) send('shop-paid-buyer:' + order.id, order.buyer,
      tr(order.buyer, 'បានទទួលប្រាក់។ ក្រុមលក់នឹងបើកសិទ្ធិជូន · ', 'Payment received. Sales will activate your access · ') + order.id);
  }

  function orderAction(user, body) {
    if (!orderPattern.test(body.id || '')) return failure('not_found', 404);
    const order = store.get('shop_orders', body.id);
    if (!order) return failure('not_found', 404);
    if (body.action === 'shop-fulfill' && order.status === 'paid') {
      const current = store.save('shop_orders', { ...order, status: 'delivered', deliveredBy: user, updated: now() }, now());
      if (order.buyer) {
        const app = product(order.product);
        const keyboard = app?.trialUrl ? markup(urlButton(tr(order.buyer, 'បើកកម្មវិធី', 'Open app'), app.trialUrl)) : undefined;
        send('shop-delivered:' + order.id, order.buyer,
          tr(order.buyer, 'បានបើកសិទ្ធិ · ', 'Access activated · ') + order.name + ' · ' + order.id, keyboard);
      }
      return result(current);
    }
    if (body.action === 'shop-refund' && order.method === 'stars' && order.charge &&
        ['paid', 'delivered', 'review', 'refund_failed'].includes(order.status)) {
      const attempt = (order.refundAttempt || 0) + 1;
      store.queue('shop-refund', 'shop-refund:' + order.id + ':' + attempt, { id: order.id, attempt }, now());
      return result(store.save('shop_orders', { ...order, status: 'refund_pending', refundAttempt: attempt, updated: now() }, now()));
    }
    return failure('order_state', 409);
  }

  function recordRefund(charge, buyer) {
    const order = store.all('shop_orders').find(row => row.charge === charge && row.buyer === buyer);
    if (!order) return false;
    if (order.status === 'refunded') return true;
    store.save('shop_orders', { ...order, status: 'refunded', updated: now() }, now());
    send('shop-refund-sales:' + order.id, config.salesChat, 'បានសង Stars · ' + order.id + '\nOwner · ពិនិត្យការដកសិទ្ធិ');
    send('shop-refund-buyer:' + order.id, buyer, tr(buyer, 'បានសង Stars · ', 'Stars refunded · ') + order.id);
    return true;
  }

  function api(user, body) {
    if (body.action === 'shop-session') {
      return result({ owner: owner(user), seller: seller(user), language: language(user),
        products: productsList().filter(p => p.status === 'live').map(publicItem) });
    }
    if (body.action === 'shop-admin') {
      if (!owner(user)) return failure('forbidden', 403);
      return result({ products: productsList(), promotions: promos().slice(-50).reverse().map(p => ({
        ...p, preview: promoText(p),
      })), channel: config.promotionsChat || '', stars: !!config.stars });
    }
    if (body.action === 'shop-threads') {
      return result(store.all('shop_threads').filter(t => t.buyer === user || seller(user))
        .sort((a, b) => b.updated - a.updated).slice(0, 100));
    }
    if (body.action === 'shop-thread') {
      const current = thread(body.id, user);
      if (!current) return failure('not_found', 404);
      return result({ thread: current, messages: store.all('shop_messages').filter(m => m.thread === current.id).slice(-100) });
    }
    if (body.action === 'shop-orders') {
      const own = store.all('shop_orders').filter(o => owner(user) || o.buyer === user);
      return result(own.sort((a, b) => b.created - a.created).slice(0, 100).map(o => ({
        id: o.id, name: o.name, method: o.method, amount: o.amount, status: o.status,
        company: o.company, created: o.created, contact: owner(user) ? o.contact : undefined,
      })));
    }
    const privileged = ['shop-product-save', 'shop-promo-save', 'shop-promo-publish', 'shop-promo-end', 'shop-fulfill', 'shop-refund'];
    if (privileged.includes(body.action) && !owner(user)) return failure('forbidden', 403);
    return store.transaction(() => {
      const requestId = body.requestId;
      if (!/^[a-f0-9-]{36}$/i.test(requestId || '')) return failure('request_invalid');
      const receiptKey = user + ':' + requestId;
      const previous = store.get('shop_requests', receiptKey);
      if (previous) return previous.action === body.action ? previous.response : failure('request_invalid', 409);
      let response;
      switch (body.action) {
        case 'shop-product-save': response = saveProduct(body, user); break;
        case 'shop-promo-save': response = makePromo(body, user); break;
        case 'shop-promo-publish': response = publishPromo(body.id); break;
        case 'shop-promo-end': response = endPromo(body.id); break;
        case 'shop-open-thread': response = createThread(user, body); break;
        case 'shop-message': {
          const current = thread(body.id, user);
          response = current ? writeThread(current, user, compact(body.text, 1600)) : failure('not_found', 404);
          break;
        }
        case 'shop-close-thread': {
          const current = thread(body.id, user);
          response = seller(user) && current ? result(store.save('shop_threads', { ...current, status: 'closed', updated: now() }, now())) : failure('forbidden', 403);
          break;
        }
        case 'shop-buy': response = invoice(user, body.product, compact(body.company, 80)); break;
        case 'shop-fulfill':
        case 'shop-refund': response = orderAction(user, body); break;
        default: return failure('action_invalid');
      }
      if (response.status === 200) store.save('shop_requests', { id: receiptKey, action: body.action, response }, now());
      return response;
    });
  }

  function customerReply({ user, input, data, reply, say }) {
    if (data?.startsWith('shop-m:')) {
      const id = data.slice(7);
      const current = thread(id, user);
      if (!current || current.buyer !== user || current.status !== 'open') {
        say(tr(user, 'ការសន្ទនានេះបានបិទ។', 'This conversation is closed.'));
      } else {
        store.queue('telegram', 'shop-prompt:' + randomUUID(), { method: 'sendMessage', body: {
          chat_id: user, text: 'សូមឆ្លើយតបសារនេះ · ' + id + ' · ' + user,
          reply_markup: { force_reply: true, selective: false },
        } }, now());
      }
      return true;
    }
    const prompt = reply?.from?.id === config.botId &&
      /^សូមឆ្លើយតបសារនេះ · (CH-\d{4,12}) · (\d+)$/.exec(reply?.text || '');
    if (!input || !prompt || prompt[2] !== user) return false;
    const current = thread(prompt[1], user);
    if (!current) return false;
    const sent = writeThread(current, user, compact(input, 1600));
    say(sent.status === 200 ? tr(user, 'បានផ្ញើ។', 'Sent.') : tr(user, 'ការសន្ទនានេះបានបិទ។', 'This conversation is closed.'));
    return true;
  }

  function sellerReply({ user, input, data, reply, say }) {
    if (!seller(user)) return false;
    if (data?.startsWith('shop-r:')) {
      const id = data.slice(7);
      const current = thread(id, user);
      if (!current || current.status !== 'open') say('ការសន្ទនានេះបានបិទ។');
      else store.queue('telegram', 'shop-prompt:' + randomUUID(), { method: 'sendMessage', body: {
        chat_id: config.salesChat, text: 'សូមឆ្លើយតបសារនេះ · ' + id + ' · ' + user,
        reply_markup: { force_reply: true, selective: false },
      } }, now());
      return true;
    }
    return customerReply({ user, input, data: undefined, reply, say });
  }

  return { api, product, productsList, publicItem, isLive, activePromo, starsQuote, promoText, deepLink,
    verifyCheckout, recordPayment, recordRefund, notifyPaid, customerReply, sellerReply };
}

export async function runShopJob({ store, bot, telegram, config, now = Date.now }, job) {
  const { id, attempt } = job.payload;
  if (job.type === 'shop-refund') {
    const order = store.get('shop_orders', id);
    if (!order || order.status !== 'refund_pending' || order.refundAttempt !== attempt) {
      store.finish(job, 'done', now());
      return;
    }
    try {
      await telegram('refundStarPayment', { user_id: Number(order.buyer), telegram_payment_charge_id: order.charge });
    } catch (error) {
      if (error.code !== 'already_refunded' && (error.status === 429 || !error.status || error.status >= 500) && job.attempts < 6) {
        store.finish(job, 'pending', now() + Math.max(3000 * 2 ** job.attempts, (error.retryAfter || 0) * 1000), 'Refund request will retry');
        return;
      }
      if (error.code !== 'already_refunded') {
        store.transaction(() => {
          const current = store.get('shop_orders', id);
          if (current?.status === 'refund_pending') store.save('shop_orders', { ...current, status: 'refund_failed', updated: now() }, now());
          store.finish(job, 'failed', now(), 'Use the Owner Orders tab to review and retry the refund');
        });
        return;
      }
    }
    store.transaction(() => {
      bot.shop.recordRefund(order.charge, order.buyer);
      store.finish(job, 'done', now());
    });
    return;
  }
  const promo = store.get('shop_promos', id);
  if (!promo || promo.attempt !== attempt || !['queued', 'sending'].includes(promo.state)) {
    store.finish(job, 'done', now());
    return;
  }
  const update = (state, fields = {}) => {
    const current = store.get('shop_promos', id);
    if (current?.attempt === attempt) store.save('shop_promos', { ...current, ...fields, state }, now());
  };
  if (promo.state === 'sending' || promo.expires <= now() || promo.channel !== config.promotionsChat ||
      !config.botUsername || !config.stars) {
    store.transaction(() => {
      update(promo.state === 'sending' ? 'uncertain' : 'failed');
      store.finish(job, 'done', now());
    });
    return;
  }
  try {
    const channel = await telegram('getChat', { chat_id: promo.channel });
    if (channel?.type !== 'channel') {
      store.transaction(() => { update('failed'); store.finish(job, 'done', now()); });
      return;
    }
  } catch (error) {
    store.transaction(() => {
      if ((!error.status || error.status === 429 || error.status >= 500) && job.attempts < 6) {
        store.finish(job, 'pending', now() + Math.max(3000 * 2 ** job.attempts, (error.retryAfter || 0) * 1000));
      } else {
        update('failed');
        store.finish(job, 'done', now());
      }
    });
    return;
  }
  const sendAllowed = store.transaction(() => {
    const current = store.get('shop_promos', id);
    if (current?.state !== 'queued' || current.attempt !== attempt) {
      store.finish(job, 'done', now());
      return false;
    }
    update('sending');
    return true;
  });
  if (!sendAllowed) return;
  const text = bot.shop.promoText(promo);
  const reply_markup = markup(urlButton('មើលប្រូម៉ូសិន', bot.shop.deepLink('promo_' + id)));
  try {
    const response = promo.video ? await telegram('sendVideo', { chat_id: promo.channel, video: promo.video,
      caption: text, reply_markup }) : await telegram('sendMessage', { chat_id: promo.channel, text,
      reply_markup, link_preview_options: { is_disabled: true } });
    store.transaction(() => {
      update(Number.isSafeInteger(response?.message_id) ? 'published' : 'uncertain', { messageId: response?.message_id });
      store.finish(job, 'done', now());
    });
  } catch (error) {
    if (error.status === 429 && job.attempts < 6) {
      store.transaction(() => {
        update('queued');
        store.finish(job, 'pending', now() + Math.max(3000 * 2 ** job.attempts, (error.retryAfter || 0) * 1000));
      });
    } else {
      store.transaction(() => {
        update(error.status >= 400 && error.status < 500 ? 'failed' : 'uncertain');
        store.finish(job, 'done', now());
      });
    }
  }
}
