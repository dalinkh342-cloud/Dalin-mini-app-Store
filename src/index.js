import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { openStore } from './store.js';
import { notionClient, staffdayTrialClient, luyvioTrialClient, telegramClient } from './clients.js';
import { createBot } from './bot.js';
import { poll, worker } from './runtime.js';
import { catalogHandler } from './catalog-http.js';

async function start() {
  const config = loadConfig();
  const telegram = telegramClient(config.token);
  const notion = notionClient(config.notionToken);
  const [identity, webhook] = await Promise.all([telegram('getMe'), telegram('getWebhookInfo')]);
  if (webhook.url) throw new Error('Use a dedicated Sales Bot with no webhook configured');
  config.botUsername = identity.username;
  const staffdayTrial = config.trialApi && staffdayTrialClient(config.trialApi);
  const luyvioTrial = config.luyvioTrialApi && luyvioTrialClient(config.luyvioTrialApi);
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const store = openStore(join(config.dataDir, 'sales.sqlite'));
  const bot = createBot(store, config);
  const abort = new AbortController();
  const { signal } = abort;
  const catalog = catalogHandler({ config, bot });
  const server = createServer({requestTimeout: 15_000}, (req, res) => {
    if (catalog && req.url?.startsWith('/catalog/')) return void catalog(req, res);
    const health = req.method === 'GET' && req.url === '/health';
    res.writeHead(health ? (signal.aborted ? 503 : 200) : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health ? { ok: !signal.aborted } : { error: 'not_found' }));
  });
  process.once('SIGTERM', () => abort.abort());
  process.once('SIGINT', () => abort.abort());
  server.listen(config.port, '0.0.0.0');
  console.log('Dalin sales bot is running as @' + identity.username);
  const context = { store, bot, telegram, notion, staffdayTrial, luyvioTrial, config };
  const jobTypes = ['telegram', 'notion', 'refund'];
  if (staffdayTrial) jobTypes.push('staffday');
  if (luyvioTrial) jobTypes.push('luyvio');
  const jobs = [poll(store, bot, telegram, signal), ...jobTypes.map(type => worker(context, type, signal))];
  try {
    await Promise.race(jobs);
  } finally {
    abort.abort();
    await Promise.allSettled(jobs);
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
}

await start().catch(error => { console.error(error.message); process.exitCode = 1; });
