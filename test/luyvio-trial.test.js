import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.js';
import { createBot } from '../src/bot.js';
import { runJob, processUpdate } from '../src/runtime.js';
import { luyvioTrialClient } from '../src/clients.js';

function fixture(t) {
  const store = openStore(':memory:');
  t.after(() => store.close());
  let now = Date.now(), sequence = 0;
  const config = { salesChat: '-100', owners: new Set(['90']), sellers: new Set(['91']),
    trialDays: 14, luyvioTrialApi: {}, luyvioUrl: 'https://t.me/LuyvioBot', botUsername: 'SalesBot' };
  const bot = createBot(store, config, () => now);
  const sent = [];
  const context = { store, bot, config, now: () => now, telegram: async(method, body) => sent.push({method,...body}), logger:{warn(){}} };
  const update = (user, text, data, group = false) => processUpdate(store, bot, {
    update_id: ++sequence,
    [data ? 'callback_query' : 'message']: {
      from: { id: user, first_name: 'Admin' }, text, data,
      ...(data ? { message: { chat: {type:group?'supergroup':'private',id:group?-100:user} } } :
        { chat: {type:group?'supergroup':'private',id:group?-100:user} }),
    },
  }, now);
  const click = (user, data, group) => update(user, '', data, group);
  const message = (user, text) => update(user, text);
  const request = () => {
    message(55, '/start luyvio_ad');
    click(55, 'lu-start');
    message(55, 'Lotus Invoice');
    click(55, 'lu-confirm:' + store.get('drafts', '55').nonce);
    return store.all('leads')[0];
  };
  return { ...context, sent, click, message, request,
    advance: ms => { now += ms; },
    drain: async () => { while (await runJob(context, 'telegram')) {} },
  };
}

test('Luyvio request and approval uses confirmed Telegram identity and retries the same provisioning request', async t => {
  const f = fixture(t), lead = f.request();
  f.click(55, 'lu-confirm:' + f.store.get('drafts', '55').nonce);
  assert.equal(f.store.all('leads').length, 1);
  f.click(66, 'lu-self:' + lead.id);
  assert.equal(f.store.get('leads', lead.id).adminId, undefined);
  f.click(55, 'lu-self:' + lead.id);
  assert.equal(f.store.get('leads', lead.id).adminId, '55');
  f.click(90, 'approve-lu:' + lead.id);
  assert.equal(f.store.get('leads', lead.id).luyvioRequestId, undefined);
  f.click(91, 'approve-lu:' + lead.id, true);
  assert.equal(f.store.get('leads', lead.id).luyvioRequestId, undefined);
  f.click(90, 'approve-lu:' + lead.id, true);
  const requestId = f.store.get('leads', lead.id).luyvioRequestId;
  f.click(90, 'approve-lu:' + lead.id, true);
  const attempts = [];
  const result = {requestId,companyCode:'sale-'+requestId,workspaceId:'f'.repeat(36),trialStart:f.now(),trialEnd:f.now()+14*86_400_000};
  const luyvioTrial = async body => {
    attempts.push(body);
    if (attempts.length === 1) throw new Error('Lost acknowledgement');
    return result;
  };
  await runJob({...f, luyvioTrial}, 'luyvio');
  f.advance(4000);
  await runJob({...f, luyvioTrial}, 'luyvio');
  assert.equal(f.store.get('leads', lead.id).stage, 'trial');
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(attempts[1].adminId, '55');
  assert.equal(await runJob({...f, luyvioTrial}, 'luyvio'), false);
  await f.drain();
  assert.equal(f.sent.filter(s=>s.chat_id==='55'&&s.reply_markup?.inline_keyboard?.[0]?.[0]?.url===f.config.luyvioUrl).length, 1);
});

test('Luyvio invitation binds the first other admin and rejects expired, reused or replaced invitations', t => {
  const f = fixture(t), lead = f.request();
  f.click(55, 'lu-other:' + lead.id);
  const original = f.store.get('leads', lead.id).adminInvite;
  f.click(55, 'lu-other:' + lead.id);
  const token = f.store.get('leads', lead.id).adminInvite;
  f.message(66, '/start luadmin_' + original);
  f.message(55, '/start luadmin_' + token);
  assert.equal(f.store.get('leads', lead.id).adminConfirmed, undefined);
  f.message(66, '/start luadmin_' + token);
  f.message(77, '/start luadmin_' + token);
  assert.equal(f.store.get('leads', lead.id).adminId, '66');
  const other = fixture(t), second = other.request();
  other.click(55, 'lu-other:' + second.id);
  const expired = other.store.get('leads', second.id).adminInvite;
  other.advance(86_400_001);
  other.message(66, '/start luadmin_' + expired);
  assert.equal(other.store.get('leads', second.id).adminConfirmed, undefined);
});

test('Luyvio client checks provisioning response before granting a successful trial', async () => {
  const requestId = 'a'.repeat(32), payload = {requestId};
  const invalid = luyvioTrialClient({origin:'https://example.com',secret:'b'.repeat(64)},
    async () => new Response(JSON.stringify({requestId:'wrong'})));
  await assert.rejects(invalid(payload), /invalid_response/);
  const valid = luyvioTrialClient({origin:'https://example.com',secret:'b'.repeat(64)}, async(url, init) => {
    assert.equal(url.pathname, '/internal/sales/trials');
    assert.equal(init.headers.Authorization, 'Bearer ' + 'b'.repeat(64));
    return new Response(JSON.stringify({requestId,companyCode:'sale-'+requestId,
      workspaceId:'3b7a5c71-e550-4c2c-8e07-2f3da31bc333',trialStart:1,trialEnd:2}));
  });
  assert.equal((await valid(payload)).requestId, requestId);
});
