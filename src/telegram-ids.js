import { telegramClient } from './clients.js';

async function showIds() {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token || !/^\d+:[\w-]+$/.test(token)) throw new Error('Set BOT_TOKEN in .env first');
  const api = telegramClient(token);
  const updates = await api('getUpdates', { timeout: 0, allowed_updates: ['message'] });
  const printed = new Set();
  for (const { message } of updates) {
    if (!message?.chat || !message.from || typeof message.text !== 'string') continue;
    const command = message.text.trim().split(/\s+/)[0].split('@')[0];
    let line;
    if (message.chat.type === 'private' && command === '/whoami') line = 'Telegram user ID: ' + message.from.id;
    if (['group', 'supergroup'].includes(message.chat.type) && command === '/chatid') {
      line = 'SALES_CHAT_ID=' + message.chat.id;
    }
    if (line && !printed.has(line)) {
      printed.add(line);
      console.log(line);
    }
  }
  if (!printed.size) console.log('Send /whoami to the bot and /chatid@YourBotUsername in the sales group first.');
}

await showIds().catch(error => { console.error(error.message); process.exitCode = 1; });
