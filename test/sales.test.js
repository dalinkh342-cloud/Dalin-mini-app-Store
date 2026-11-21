import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../src/store.js';
import { createBot } from '../src/bot.js';
import { processUpdate, runJob } from '../src/runtime.js';
import { syncNotion } from '../src/notion.js';
import { loadConfig, localDateEnd, DAY } from '../src/config.js';
import { telegramClient, notionClient, ApiError } from '../src/clients.js';

const group = { type: 'supergroup', id: -100001 };
const owner = 90;
const seller = 91;
const guest = 55;
const customerChat = user => ({ type: 'private', id: user });

function setup(t, override = {}) {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const config = { salesChat: String(group.id), owners: new Set([String(owner)]),
    sellers: new Set([String(seller)]), staffdayUrl: 'https://t.me/example_bot',
    demoUrl: 'https://example.com/demo', trialDays: 14, stars: false,
    starsAmount: 1000, sources: { leads: 'leads-ds', tasks: 'tasks-ds', orders: 'orders-ds' }, ...override };
  let now = Date.parse('2026-11-16T02:00:00Z');
  let sequence = 0;
  const clock = () => now;
  const bot = createBot(store, config, clock);
  function update(message) {
    const event = { update_id: ++sequence, ...message };
    processUpdate(store, bot, event, now);
    return event;
  }
  const sent = [];
  const telegram = async (method, body) => { sent.push({ method, ...body }); return true; };
  const e = {
    bot, store, config, sent, telegram, now: clock, tick: days => { now += days * DAY; },
    message(user, text, chat = customerChat(user)) { return update({ message: { chat, from: { id: user }, text } }); },
    click(user, data, chat = customerChat(user)) { return update({ callback_query: { id: 'q' + sequence, message: { chat }, from: { id: user }, data } }); },
    group(user, text) { return this.message(user, text, group); },
    async drain(type = 'telegram', extras = {}) {
      const context = { store, bot, config, telegram, now: clock, logger: { warn() {} }, ...extras };
      for (let i = 0; i < 100; i++) {
        if (!await runJob(context, type)) return;
      }
      assert.fail('job queue did not drain');
    },
    payment(user, order, fields = {}) {
      return update({ message: { chat: customerChat(user), from: { id: user }, successful_payment: {
        invoice_payload: order.payload, currency: 'XTR', total_amount: order.amount,
        telegram_payment_charge_id: 'charge_1', ...fields,
      } } });
    },
  };
  return e;
}

function request(e, user = guest, company = 'Lotus Office') {
  e.message(user, '/start staffday_tiktok');
  e.click(user, 'starttrial');
  e.message(user, company);
  e.message(user, '២០');
  const draft = e.store.get('drafts', user);
  const confirm = 'confirm:' + draft.nonce;
  const event = e.click(user, confirm);
  const lead = e.store.get('drafts', user).leadId;
  return { lead, confirm, event };
}

function activateTrial(e, user = guest) {
  const { lead } = request(e, user);
  e.click(seller, 'claim:' + lead, group);
  e.group(seller, '/verify@DalinBot ' + lead + ' 555123 1 Office shift');
  e.group(owner, '/trial ' + lead + ' LOTUS-01');
  return lead;
}

test('StaffDay request tracks source, validates count, and deduplicates updates and repeated requests', async t => {
  const e = setup(t);
  const { lead, confirm, event } = request(e);
  e.click(guest, confirm);
  processUpdate(e.store, e.bot, event, e.now());
  request(e, guest, '  LOTUS   Office ');
  await e.drain();
  assert.equal(e.store.all('leads').length, 1);
  assert.equal(e.store.get('leads', lead).source, 'tiktok');
  assert.equal(e.store.get('leads', lead).count, 20);
  assert.equal(e.sent.filter(row => row.chat_id === String(group.id)).length, 1);
});

test('only verified owner can record StaffDay Trial and other buyers cannot open the request', async t => {
  const e = setup(t);
  const { lead } = request(e);
  e.group(owner, '/trial ' + lead + ' LOTUS-01');
  assert.equal(e.store.get('leads', lead).stage, 'new');
  e.group(guest, '/claim ' + lead);
  assert.equal(e.store.get('leads', lead).stage, 'new');
  e.click(seller, 'claim:' + lead, group);
  e.group(seller, '/verify ' + lead + ' 555123 1 Office shift');
  e.group(seller, '/trial ' + lead + ' LOTUS-01');
  assert.equal(e.store.get('leads', lead).stage, 'ready');
  e.group(owner, '/trial ' + lead + ' LOTUS-01');
  e.click(321, 'lead:' + lead);
  await e.drain();
  const result = e.store.get('leads', lead);
  assert.equal(result.stage, 'trial');
  assert.equal(result.trialEnd - result.trialStart, 14 * DAY);
  assert.ok(e.sent.filter(row => row.chat_id === '321').every(row => !row.text.includes('Lotus Office')));
  assert.ok(e.sent.some(row => row.chat_id === String(guest) && row.text.includes(e.config.staffdayUrl)));
});

test('extended Trial suppresses stale expiry work and active customers keep their company code', async t => {
  const e = setup(t);
  const lead = activateTrial(e);
  await e.drain();
  e.tick(2);
  await e.drain();
  assert.equal(e.sent.filter(row => row.text.includes('ថ្ងៃទី ៣')).length, 1);
  e.tick(8);
  e.group(owner, '/extend ' + lead + ' 7');
  e.tick(4);
  await e.drain();
  assert.equal(e.sent.filter(row => row.text.startsWith('Trial ដល់ថ្ងៃផុត')).length, 0);
  e.tick(5);
  await e.drain();
  assert.equal(e.sent.filter(row => row.text.includes('នឹងផុតកំណត់នៅ')).length, 1);
  e.click(guest, 'renew:' + lead);
  e.click(guest, 'renew:' + lead);
  assert.equal(e.store.all('tasks').filter(row => row.kind === 'renewal').length, 1);
  e.group(owner, '/active ' + lead + ' 2026-12-30');
  e.tick(2);
  await e.drain();
  assert.equal(e.store.get('leads', lead).stage, 'active');
  assert.equal(e.store.get('leads', lead).companyCode, 'LOTUS-01');
  assert.equal(e.sent.filter(row => row.text.startsWith('Trial ដល់ថ្ងៃផុត')).length, 0);
});

test('non-StaffDay enquiries can be replied to and closed by an assigned-role user in the sales group', async t => {
  const e = setup(t);
  e.message(guest, '/start inventra_fb');
  e.click(guest, 'ask:inventra');
  e.message(guest, 'Can we use two locations?');
  const [ticket] = e.store.all('tasks');
  assert.equal(ticket.product, 'inventra');
  e.group(guest, '/reply ' + ticket.id + ' Unauthorized');
  e.group(seller, '/reply ' + ticket.id + ' Hello from the sales team.');
  e.group(seller, '/resolve ' + ticket.id);
  await e.drain();
  assert.equal(e.store.get('tasks', ticket.id).status, 'resolved');
  assert.equal(e.sent.filter(row => row.chat_id === String(guest) && row.text.includes('Hello from')).length, 1);
  assert.equal(e.sent.some(row => row.text.includes('Unauthorized')), false);
});

test('Stars checks order buyer, amount, currency and precheckout reservation before recording payment once', async t => {
  const e = setup(t, { stars: true });
  const lead = activateTrial(e);
  e.group(owner, '/invoice ' + lead);
  e.group(owner, '/invoice ' + lead);
  const [order] = e.store.all('orders');
  assert.equal(e.store.all('orders').length, 1);
  await e.drain();
  const query = { id: 'pc1', from: { id: guest }, invoice_payload: order.payload, total_amount: order.amount, currency: 'XTR' };
  assert.equal(e.bot.precheckout({ ...query, total_amount: 10 }).ok, false);
  assert.equal(e.bot.precheckout({ ...query, from: { id: 123 } }).ok, false);
  assert.equal(e.bot.precheckout(query).ok, true);
  assert.equal(e.bot.precheckout({ ...query, id: 'pc2' }).ok, false);
  assert.equal(e.bot.precheckout(query).ok, true);
  e.group(owner, '/active ' + lead + ' 2026-12-30');
  assert.equal(e.store.get('leads', lead).stage, 'trial');
  e.payment(guest, order);
  e.payment(guest, order);
  assert.equal(e.store.get('orders', order.id).status, 'paid');
  e.group(owner, '/active ' + lead + ' 2026-12-30');
  assert.equal(e.store.get('orders', order.id).status, 'delivered');
  assert.equal(e.store.get('leads', lead).stage, 'active');
  await e.drain();
  assert.equal(e.sent.filter(row => row.method === 'sendInvoice').length, 1);
  assert.equal(e.sent.filter(row => row.text?.startsWith('បានទទួលការទូទាត់')).length, 1);
  e.group(owner, '/refund ' + order.id);
  await e.drain('refund');
  assert.equal(e.store.get('orders', order.id).status, 'refunded');
  assert.equal(e.store.all('tasks').filter(row => row.kind === 'refund_access_review').length, 1);
  assert.equal(e.sent.filter(row => row.method === 'refundStarPayment').length, 1);
});

test('an unpaid invoice can be voided and a late charge is held for owner review', async t => {
  const e = setup(t, { stars: true });
  const lead = activateTrial(e);
  e.group(owner, '/invoice ' + lead);
  const [order] = e.store.all('orders');
  e.group(seller, '/voidinvoice ' + order.id);
  assert.equal(e.store.get('orders', order.id).status, 'pending');
  e.group(owner, '/voidinvoice ' + order.id);
  assert.equal(e.store.get('orders', order.id).status, 'void');
  await e.drain();
  assert.ok(e.sent.every(row => row.method !== 'sendInvoice'));
  assert.equal(e.bot.precheckout({ id: 'query', from: { id: guest }, invoice_payload: order.payload,
    total_amount: order.amount, currency: 'XTR' }).ok, false);
  e.payment(guest, order);
  assert.equal(e.store.get('orders', order.id).status, 'payment_review');
  e.group(owner, '/active ' + lead + ' 2026-12-30');
  assert.equal(e.store.get('leads', lead).stage, 'trial');
  e.group(owner, '/refund ' + order.id);
  await e.drain('refund');
  assert.equal(e.store.get('orders', order.id).status, 'refunded');
});

test('Notion creates a single lead by External ID and patches it on further changes', async t => {
  const e = setup(t);
  const { lead } = request(e);
  const calls = [];
  const notion = async (verb, path, data) => {
    calls.push({ verb, path, data });
    if (path.endsWith('/query')) return { results: [] };
    if (verb === 'POST') return { id: 'page-1' };
    return {};
  };
  await e.drain('notion', { notion });
  e.click(seller, 'claim:' + lead, group);
  await e.drain('notion', { notion });
  assert.deepEqual(calls.map(call => call.verb + ' ' + call.path), [
    'POST data_sources/leads-ds/query', 'POST pages', 'PATCH pages/page-1',
  ]);
  assert.equal(calls[1].data.parent.data_source_id, 'leads-ds');
  assert.equal(calls[2].data.properties['External ID'].rich_text[0].text.content, lead);
  assert.equal(calls[2].data.properties.Status.rich_text[0].text.content, 'review');
});

test('sync reuses a Notion row after lost acknowledgement', async t => {
  const e = setup(t);
  const { lead } = request(e);
  const calls = [];
  const notion = async (method, path) => {
    calls.push(method + ' ' + path);
    if (path.endsWith('/query')) return { results: [{ id: 'existing-row' }] };
    return {};
  };
  await syncNotion(notion, e.store, e.config.sources, { kind: 'leads', id: lead });
  assert.deepEqual(calls, ['POST data_sources/leads-ds/query', 'PATCH pages/existing-row']);
});

test('failed Telegram delivery is recorded for retry and does not discard the lead', async t => {
  const e = setup(t);
  const lead = activateTrial(e);
  await e.drain('telegram', { telegram: async (_method, body) => {
    if (body.text.includes('StaffDay រួចរាល់')) throw new ApiError('Telegram', 'sendMessage', 403, 'blocked');
    return true;
  } });
  assert.equal(e.store.get('leads', lead).stage, 'trial');
  assert.equal(e.store.failedJobs()[0].id, 'trial-open:' + lead);
  e.group(owner, '/retry trial-open:' + lead);
  await e.drain();
  assert.equal(e.store.failed(), 0);
  assert.ok(e.sent.some(row => row.text.includes(e.config.staffdayUrl)));
});

test('SQLite retains unfinished jobs and draft state after restart', t => {
  const dir = mkdtempSync(join(tmpdir(), 'dalin-sales-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'sales.sqlite');
  let store = openStore(path);
  store.transaction(() => {
    store.save('drafts', { id: '12', step: 'confirm' }, 10);
    store.queue('telegram', 'future-reminder', { method: 'sendMessage' }, 20);
    store.setCounter('offset', 99);
  });
  store.close();
  store = openStore(path);
  assert.equal(store.get('drafts', 12).step, 'confirm');
  assert.equal(store.due('telegram', 30).id, 'future-reminder');
  assert.equal(store.readCounter('offset'), 99);
  store.close();
});

test('client sends Notion data-source version, numeric Telegram chat ID and no token in errors', async () => {
  const fetch = async (url, options) => {
    if (url.startsWith('https://api.notion')) {
      assert.equal(options.headers['Notion-Version'], '2025-09-03');
      return Response.json({ id: 'notion-page' });
    }
    assert.equal(JSON.parse(options.body).chat_id, 100);
    throw new Error(url);
  };
  const notion = notionClient('secret', fetch);
  assert.equal((await notion('GET', 'pages/example')).id, 'notion-page');
  await assert.rejects(telegramClient('123:secret', fetch)('sendMessage', { chat_id: '100', text: 'hello' }),
    error => error instanceof ApiError && !error.message.includes('secret'));
});

test('config requires a Railway volume and validates UTC+7 paid-through date', () => {
  const env = { BOT_TOKEN:'123:abc', OWNER_IDS:'90', SELLER_IDS:'91', SALES_CHAT_ID:'-100001',
    STAFFDAY_URL:'https://t.me/staffday_example', NOTION_TOKEN:'abc', NOTION_LEADS_SOURCE_ID:'leads',
    NOTION_TASKS_SOURCE_ID:'tasks' };
  assert.equal(loadConfig(env).trialDays, 14);
  assert.equal(new Date(localDateEnd('2026-11-30')).toISOString(), '2026-11-30T16:59:59.999Z');
  assert.equal(localDateEnd('2026-02-30'), null);
  assert.throws(() => loadConfig({ ...env, RAILWAY_ENVIRONMENT_ID:'production' }), /volume/);
  assert.equal(loadConfig({ ...env, RAILWAY_ENVIRONMENT_ID:'production', RAILWAY_VOLUME_MOUNT_PATH:'/data' }).dataDir, '/data');
});

const integrated = { trialApi: { origin:'https://staffday.test', secret:'a'.repeat(64) }, botUsername:'DalinTestBot' };

function fakeStaffDay(e) {
  const receipts = new Map();
  const calls = [];
  const api = async (method, body) => {
    calls.push({method,...body});
    let result = receipts.get(body.requestId);
    if (method === 'POST' && !result) {
      const trialStart = e.now();
      result = {requestId:body.requestId,companyCode:'sale-' + body.requestId,trialStart,
        trialEnd:trialStart + body.trialDays * DAY};
    }
    if (method === 'PATCH') result = {...result,trialEnd:body.trialEnd};
    receipts.set(body.requestId,result);
    return result;
  };
  return { api, calls, receipts };
}

test('requester-as-HR uses their Telegram ID and only one owner approval creates and sends the trial', async t => {
  const e = setup(t,integrated);
  const { lead } = request(e);
  e.click(owner,'approve-trial:' + lead,group);
  assert.equal(e.store.due('staffday',e.now()),undefined);
  e.click(guest,'hr-self:' + lead);
  assert.equal(e.store.get('leads',lead).hrId,String(guest));
  e.click(seller,'approve-trial:' + lead,group);
  assert.equal(e.store.due('staffday',e.now()),undefined);
  e.click(owner,'approve-trial:' + lead,{...group,id:-10099});
  assert.equal(e.store.due('staffday',e.now()),undefined);
  e.click(owner,'approve-trial:' + lead,group);
  const job = e.store.due('staffday',e.now());
  assert.equal(e.store.get('leads',lead).stage,'ready');
  e.click(owner,'approve-trial:' + lead,group);
  const staffday = fakeStaffDay(e);
  await e.drain('staffday',{staffdayTrial:staffday.api});
  await e.drain();
  const saved = e.store.get('leads',lead);
  assert.equal(saved.stage,'trial');
  assert.equal(saved.companyCode,'sale-' + job.payload.staffdayRequestId);
  assert.equal(saved.trialEnd - saved.trialStart,14 * DAY);
  assert.equal(staffday.calls.length,1);
  assert.equal(staffday.calls[0].hrId,String(guest));
  assert.equal(e.sent.filter(message => message.chat_id === String(guest) && message.text.startsWith('StaffDay រួចរាល់')).length,1);
  e.group(owner,'/extend ' + lead + ' 7');
  assert.equal(e.store.get('leads',lead).trialEnd,saved.trialEnd);
  await e.drain('staffday',{staffdayTrial:staffday.api});
  assert.equal(e.store.get('leads',lead).trialEnd,saved.trialEnd + 7 * DAY);
});

test('an existing request can invite another HR and binds exactly the first valid Telegram identity', async t => {
  const e = setup(t,integrated);
  const old = request(e);
  e.store.transaction(() => {
    const record = e.store.get('leads',old.lead);
    e.store.save('leads',{...record,stage:'review',assigned:String(seller)},e.now());
  });
  e.message(guest,'/my');
  e.click(guest,'lead:' + old.lead);
  e.click(guest,'hr-other:' + old.lead);
  const expired = e.store.get('leads',old.lead).hrInvite;
  e.message(guest,'/start hr_' + expired);
  assert.equal(e.store.get('leads',old.lead).hrId,undefined);
  e.tick(1);
  e.message(555,'/start hr_' + expired);
  assert.equal(e.store.get('leads',old.lead).hrId,undefined);
  e.click(guest,'hr-other:' + old.lead);
  const invite = e.store.get('leads',old.lead).hrInvite;
  assert.notEqual(invite,expired);
  e.message(555,'/start hr_' + invite);
  e.message(556,'/start hr_' + invite);
  assert.equal(e.store.get('leads',old.lead).hrId,'555');
  assert.equal(e.store.get('trial_invites',invite),null);
  await e.drain();
  assert.ok(e.sent.some(row => row.chat_id === String(guest) && row.text.includes('https://t.me/DalinTestBot?start=hr_' + invite)));
  assert.equal(e.sent.filter(row => row.chat_id === String(group.id) &&
    row.reply_markup?.inline_keyboard[0][0].callback_data === 'approve-trial:' + old.lead).length,1);
  e.click(owner,'approve-trial:' + old.lead,group);
  await e.drain('staffday',{staffdayTrial:fakeStaffDay(e).api});
  await e.drain();
  assert.equal(e.store.get('leads',old.lead).stage,'trial');
  for (const chat of [String(guest),'555']) {
    assert.ok(e.sent.find(row => row.chat_id === chat &&
      row.reply_markup?.inline_keyboard[0][0].url === e.config.staffdayUrl));
  }
});

test('an uncertain StaffDay response is retried with the same approval ID', async t => {
  const e = setup(t,integrated);
  const {lead} = request(e);
  e.click(guest,'hr-self:' + lead);
  e.click(owner,'approve-trial:' + lead,group);
  const staffday = fakeStaffDay(e);
  await e.drain('staffday',{staffdayTrial:async (method,payload) => {
    await staffday.api(method,payload);
    throw new ApiError('StaffDay',method,0,'network');
  }});
  assert.equal(e.store.get('leads',lead).stage,'ready');
  const requestId = e.store.get('leads',lead).staffdayRequestId;
  e.click(owner,'approve-trial:' + lead,group);
  e.tick(.001);
  await e.drain('staffday',{staffdayTrial:staffday.api});
  assert.equal(e.store.get('leads',lead).stage,'trial');
  assert.deepEqual(staffday.calls.map(call => call.requestId),[requestId,requestId]);
  assert.equal(staffday.receipts.size,1);
});

test('FleetDay: deep link shows the product, free trial opens FleetDay and tells the sales group once', async t => {
  const e = setup(t, { fleetdayUrl: 'https://t.me/FleetDayDalinBot', fleetdayTrialDays: 14 });
  e.message(guest, '/start fleetday_fb');
  e.click(guest, 'fd-trial');
  e.click(guest, 'fd-trial');
  await e.drain();
  const card = e.sent.find(row => row.text?.startsWith('FleetDay'));
  assert.match(card.text, /សាកល្បងឥតគិតថ្លៃ 14 ថ្ងៃ/);
  assert.equal(card.reply_markup.inline_keyboard[0][0].callback_data, 'fd-trial');
  const opens = e.sent.filter(row => row.chat_id === String(guest) && row.reply_markup?.inline_keyboard[0][0].url);
  assert.equal(opens.length, 2);
  assert.equal(opens[0].reply_markup.inline_keyboard[0][0].url, 'https://t.me/FleetDayDalinBot');
  const salesNotes = e.sent.filter(row => row.chat_id === String(group.id) && /FleetDay/.test(row.text));
  assert.equal(salesNotes.length, 1);
  assert.match(salesNotes[0].text, /ប្រភព: fb/);
});

test('FleetDay: questions become sales tickets tagged with the product', async t => {
  const e = setup(t);
  e.message(guest, '/start fleetday');
  e.click(guest, 'ask:fleetday');
  e.message(guest, 'Can drivers log fuel?');
  const [ticket] = e.store.all('tasks');
  assert.equal(ticket.product, 'fleetday');
  await e.drain();
  assert.ok(e.sent.some(row => row.chat_id === String(group.id) && /FleetDay/.test(row.text)));
});

test('FleetDay: config defaults to the FleetDay bot and rejects a non-HTTPS link', () => {
  const base = { BOT_TOKEN: '1:abc', SALES_CHAT_ID: '-100', OWNER_IDS: '1', STAFFDAY_URL: 'https://t.me/a',
    NOTION_TOKEN: 'x', NOTION_LEADS_SOURCE_ID: 'l', NOTION_TASKS_SOURCE_ID: 't' };
  assert.equal(loadConfig(base).fleetdayUrl, 'https://t.me/FleetDayDalinBot');
  assert.equal(loadConfig(base).fleetdayTrialDays, 14);
  assert.throws(() => loadConfig({ ...base, FLEETDAY_URL: 'http://t.me/x' }), /FLEETDAY_URL/);
});
