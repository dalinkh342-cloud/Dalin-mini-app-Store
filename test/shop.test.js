import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createBot } from '../src/bot.js';
import { openStore } from '../src/store.js';
import { runJob } from '../src/runtime.js';
import { payway, runKhqrJob } from '../src/khqr.js';

function setup(t) {
  let time = Date.parse('2026-04-01T04:00:00Z');
  const now = () => time;
  const move = value => { time += value; };
  const store = openStore(':memory:');
  t.after(() => store.close());
  const config = { owners: new Set(['1']), sellers: new Set(['2']), salesChat: '-10',
    promotionsChat: '@DalinStoreTest', botUsername: 'DalinStoreTestBot', botId: 9, stars: true,
    starsAmount: 500, catalogOrigin: 'https://sales.example.com', trialDays: 14 };
  const bot = createBot(store, config, now);
  const shop = bot.shop;
  const call = (user, action, fields = {}) => shop.api(user, { action, requestId: randomUUID(), ...fields });
  return { store, config, bot, shop, call, now, move };
}

test('owner edits durable shared catalog and hidden products keep existing sales conversations', t => {
  const { store, shop, call } = setup(t);
  const product = { id: 'workday', name: 'Workday', km: 'កម្មវិធី', en: 'Work app',
    trialUrl: '', imageUrl: '', stars: 600, cents: 1200, status: 'live' };
  assert.equal(call('3', 'shop-product-save', product).status, 403);
  assert.equal(call('1', 'shop-product-save', product).status, 200);
  assert.equal(call('3', 'shop-session').body.products.length, 5);
  const thread = call('3', 'shop-open-thread', { product: product.id, text: 'Can I get a demo?' }).body;
  const current = shop.product(product.id);
  const hide = { ...current, editing: true, status: 'hidden' };
  assert.equal(call('1', 'shop-product-save', hide).status, 200);
  assert.equal(call('1', 'shop-product-save', hide).status, 409);
  assert.equal(call('3', 'shop-session').body.products.length, 4);
  assert.equal(call('3', 'shop-buy', { product: product.id, company: 'Acme' }).status, 409);
  assert.equal(call('4', 'shop-thread', { id: thread.id }).status, 404);
  const message = { id: thread.id, text: 'Yes, please let me know your availability.', requestId: randomUUID() };
  assert.equal(call('2', 'shop-message', message).status, 200);
  assert.equal(call('2', 'shop-message', message).status, 200);
  assert.equal(call('3', 'shop-thread', { id: thread.id }).body.messages.length, 2);
  assert.equal(store.get('shop_products', product.id).status, 'hidden');
});

test('published promo sets checkout price exactly once and stale promo invoices expire', async t => {
  const { store, config, shop, bot, call, now, move } = setup(t);
  assert.equal(call('1', 'shop-product-save', { ...shop.product('fleetday'), imageUrl: '',
    editing: true, stars: 600 }).status, 200);
  const promo = call('1', 'shop-promo-save', { product: 'fleetday', stars: 480, date: '2026-04-01' }).body;
  assert.equal(shop.starsQuote('fleetday').amount, 600);
  assert.equal(call('1', 'shop-promo-publish', { id: promo.id }).status, 200);
  assert.equal(call('1', 'shop-promo-publish', { id: promo.id }).status, 200);
  const sent = [];
  const telegram = async (method, data) => {
    if (method === 'getChat') return { type: 'channel' };
    sent.push({ method, data });
    return { message_id: 501 };
  };
  assert.equal(await runJob({ store, shop, bot, config, telegram, now }, 'shop-promo'), true);
  assert.equal(await runJob({ store, shop, bot, config, telegram, now }, 'shop-promo'), false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].data.chat_id, config.promotionsChat);
  assert.match(sent[0].data.reply_markup.inline_keyboard[0][0].url, /start=promo_/);
  assert.equal(shop.starsQuote('fleetday').amount, 480);
  const orderId = call('3', 'shop-buy', { product: 'fleetday', company: 'Acme' }).body.id;
  const order = store.get('shop_orders', orderId);
  const query = { id: 'pc-1', from: { id: 3 }, invoice_payload: order.payload, currency: 'XTR', total_amount: 480 };
  assert.equal(bot.precheckout({ ...query, from: { id: 4 } }).ok, false);
  assert.equal(bot.precheckout(query).ok, true);
  const staleId = call('4', 'shop-buy', { product: 'fleetday', company: 'Another' }).body.id;
  const stale = store.get('shop_orders', staleId);
  move(24 * 60 * 60_000);
  assert.equal(shop.starsQuote('fleetday').amount, 600);
  assert.equal(bot.precheckout({ ...query, id: 'pc-2', from: { id: 4 }, invoice_payload: stale.payload }).ok, false);
  const payment = { invoice_payload: order.payload, currency: 'XTR', total_amount: 480, telegram_payment_charge_id: 'charge-1' };
  shop.recordPayment('3', payment);
  shop.recordPayment('3', payment);
  assert.equal(store.get('shop_orders', orderId).status, 'paid');
  assert.equal(call('4', 'shop-orders').body.some(row => row.id === orderId), false);
  assert.equal(call('2', 'shop-fulfill', { id: orderId }).status, 403);
  assert.equal(call('1', 'shop-fulfill', { id: orderId }).body.status, 'delivered');
});

test('PayWay verification checks reference, amount, currency and approval before fulfillment', async t => {
  const { store, shop, config, now } = setup(t);
  const order = store.save('shop_orders', { id: 'DS-0101', method: 'khqr', currency: 'USD', tranId: 'order-123',
    status: 'pending', amount: 1200, name: 'FleetDay', company: 'Acme', contact: 'acme@example.com', expires: now() + 60_000 }, now());
  let bank = { status: { code: '00', tran_id: order.tranId }, data: {
    payment_status: 'APPROVED', payment_status_code: 0, payment_currency: 'USD', payment_amount: 13, original_amount: 12 } };
  const provider = payway({ mode: 'sandbox', merchantId: 'test', apiKey: 'test' }, async (url, options) => {
    assert.match(url, /checkout-sandbox\.payway\.com\.kh.+check-transaction-2$/);
    const body = JSON.parse(options.body);
    assert.equal(body.tran_id, order.tranId);
    return { ok: true, json: async () => bank };
  }, now);
  assert.equal(await provider.verify(order), 'review');
  bank = { ...bank, data: { ...bank.data, payment_amount: 12 } };
  assert.equal(await provider.verify(order), 'paid');
  store.queue('shop-qr', 'shop-qr:' + order.id, { id: order.id }, now());
  await runKhqrJob({ store, config, shop, provider, now }, store.due('shop-qr', now()));
  assert.equal(store.get('shop_orders', order.id).status, 'paid');
  assert.equal(store.hasJob('shop-paid-sales:' + order.id), true);
});
