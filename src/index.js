import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { openStore } from './store.js';
import { notionClient, telegramClient } from './clients.js';
import { createBot } from './bot.js';
import { poll, worker } from './runtime.js';

async function start() {
  const config = loadConfig();
  const telegram = telegramClient(config.token);
  const notion = notionClient(config.notionToken);
  const [identity, webhook] = await Promise.all([telegram('getMe'), telegram('getWebhookInfo')]);
  if (webhook.url) throw new Error('Use a dedicated Sales Bot with no webhook configured');
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const store = openStore(join(config.dataDir, 'sales.sqlite'));
  const bot = createBot(store, config);
  const abort = new AbortController();
  const { signal } = abort;
  const server = createServer((req, res) => {
    const health = req.method === 'GET' && req.url === '/health';
    res.writeHead(health ? (signal.aborted ? 503 : 200) : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health ? { ok: !signal.aborted } : { error: 'not_found' }));
  });
  process.once('SIGTERM', () => abort.abort());
  process.once('SIGINT', () => abort.abort());
  server.listen(config.port, '0.0.0.0');
  console.log('Dalin sales bot is running as @' + identity.username);
  const context = { store, bot, telegram, notion, config };
  const jobs = [poll(store, bot, telegram, signal),
    ...['telegram', 'notion', 'refund'].map(type => worker(context, type, signal))];
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
