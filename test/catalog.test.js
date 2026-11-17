import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { catalogHandler } from '../src/catalog-http.js';
import { createBot } from '../src/bot.js';
import { runJob } from '../src/runtime.js';
import { openStore } from '../src/store.js';

test('catalog validates Telegram identity and routes all customer actions through the existing bot', async t => {
  const userId = 600;
  const config = { token: 'test-token', catalogOrigin: 'https://sales.example.com', trialDays: 14 };
  const store = openStore(':memory:');
  t.after(() => store.close());
  const bot = createBot(store, config);
  const server = createServer(catalogHandler({ config, bot }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + '/catalog/';

  function signedData(date = Date.now()) {
    const data = new URLSearchParams({
      user: JSON.stringify({ id: userId, first_name: 'Test' }),
      signature: 'test-signature',
      auth_date: String(Math.floor(date / 1000)),
    });
    data.sort();
    const secret = createHmac('sha256', 'WebAppData').update(config.token).digest();
    const checkString = [...data].map(([key, value]) => key + '=' + value).join('\n');
    data.set('hash', createHmac('sha256', secret).update(checkString).digest('hex'));
    return data.toString();
  }
  const send = (action, extra = {}, headers = {}) => fetch(url + 'api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action, initData: signedData(), ...extra }),
  });
  const page = await fetch(url);
  assert.match(await page.text(), /StaffDay[\s\S]*Inventra[\s\S]*Luyvio/);
  assert.equal((await fetch(url + 'khmer.ttf', { method: 'HEAD' })).headers.get('content-type'), 'font/ttf');
  assert.equal((await send('session', { initData: signedData().replace('600', '601') })).status, 401);
  assert.equal((await send('session', { initData: signedData(Date.now() - 3_700_000) })).status, 401);
  assert.equal((await send('session', {}, { Origin: 'https://example.org' })).status, 403);
  assert.equal((await send('language', { language: 'th' })).status, 400);
  assert.deepEqual(await (await send('session')).json(), { language: 'km' });
  assert.deepEqual(await (await send('language', { language: 'en' })).json(), { language: 'en' });

  const requestId = randomUUID();
  for (const action of ['staffday', 'inventra', 'luyvio', 'mine', 'contact']) {
    assert.equal((await send(action, { requestId, chat_id: 999 })).status, 200, action);
  }
  assert.equal((await send('staffday', { requestId })).status, 200);
  assert.equal(store.get('drafts', userId).step, 'question');
  const sent = [];
  const telegram = async (_method, body) => sent.push(body);
  while (await runJob({ store, bot, config, telegram }, 'telegram')) {}
  assert.equal(sent.length, 5);
  assert.ok(sent.every(message => message.chat_id === String(userId)));
  assert.equal(sent[0].reply_markup.inline_keyboard[0][0].callback_data, 'starttrial');
  assert.equal(sent[1].reply_markup.inline_keyboard[0][0].callback_data, 'ask:inventra');
  assert.equal(sent[2].reply_markup.inline_keyboard[0][0].callback_data, 'ask:luyvio');
  assert.match(sent[3].text, /no requests/);
  assert.match(sent[4].text, /sales team/);
});

test('private /start shows the Mini App button even when Telegram rejects the welcome photo', async t => {
  const config = { catalogOrigin: 'https://sales.example.com' };
  const store = openStore(':memory:');
  t.after(() => store.close());
  const bot = createBot(store, config);
  bot.handle({ update_id: 1, message: { chat: { type: 'private', id: 600 }, from: { id: 600 }, text: '/start' } });

  const sent = [];
  const telegram = async (method, body) => {
    sent.push({ method, body });
    if (method === 'sendPhoto') throw Object.assign(new Error('photo unavailable'), { status: 400 });
  };
  assert.equal(await runJob({ store, bot, config, telegram }, 'telegram'), true);
  assert.equal(await runJob({ store, bot, config, telegram }, 'telegram'), false);
  assert.deepEqual(sent.map(item => item.method), ['sendPhoto', 'sendMessage']);
  assert.equal(sent[1].body.reply_markup.inline_keyboard[0][0].web_app.url, config.catalogOrigin + '/catalog/');
  bot.handle({ update_id: 2, callback_query: { message: { chat: { type: 'private', id: 600 } },
    from: { id: 600 }, data: 'language:en' } });
  assert.deepEqual(bot.catalogAction({ profile: { id: 600 }, action: 'session' }), { language: 'en' });
});
