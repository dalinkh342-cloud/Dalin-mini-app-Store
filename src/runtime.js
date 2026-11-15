import { setTimeout as sleep } from 'node:timers/promises';
import { DAY } from './config.js';
import { syncNotion } from './notion.js';

const expiryKeys = ['stage', 'trialEnd', 'paidUntil'];

export function processUpdate(store, bot, update, now) {
  return store.transaction(() => {
    const last = store.readCounter('offset');
    const newEpoch = now - store.readCounter('last_update_at') >= 6 * DAY;
    if (!newEpoch && update.update_id < last) return null;
    const query = update.pre_checkout_query;
    const response = query ? { method: 'answerPreCheckoutQuery', payload: bot.precheckout(query) } : null;
    if (!query) {
      bot.handle(update);
      store.setCounter('offset', update.update_id + 1);
      store.setCounter('last_update_at', now);
    }
    return response;
  });
}

function acknowledge(store, id, now) {
  store.transaction(() => {
    const last = store.readCounter('offset');
    const newEpoch = now - store.readCounter('last_update_at') >= 6 * DAY;
    store.setCounter('offset', newEpoch ? id + 1 : Math.max(last, id + 1));
    store.setCounter('last_update_at', now);
  });
}

export async function poll(store, bot, telegram, signal, logger = console) {
  while (!signal.aborted) {
    try {
      const now = Date.now();
      const offset = now - store.readCounter('last_update_at') >= 6 * DAY ? 0 : store.readCounter('offset');
      const updates = await telegram('getUpdates', {
        offset, timeout: 25, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
      }, { signal, timeout: 32_000 });
      for (const update of updates) {
        if (signal.aborted) break;
        const ack = processUpdate(store, bot, update, Date.now());
        if (ack) {
          try {
            await telegram(ack.method, ack.payload, { signal, timeout: 4000 });
          } catch (error) {
            if (error.status !== 400) throw error;
            logger.warn('Telegram checkout had already expired or been answered');
          }
          acknowledge(store, update.update_id, Date.now());
        }
        if (update.callback_query) {
          void telegram('answerCallbackQuery', { callback_query_id: update.callback_query.id },
            { signal, timeout: 3500 }).catch(() => {});
        }
      }
    } catch (error) {
      if (signal.aborted) break;
      if (error.status === 401 || error.status === 409) throw error;
      logger.warn(error.message);
      await sleep(Math.max(1500, (error.retryAfter || 0) * 1000), null, { signal }).catch(() => {});
    }
  }
}

function conditionMatches(store, condition, now) {
  const record = store.get('leads', condition.id);
  return Boolean(record && (!condition.beforeTrialEnd || record.trialEnd > now) && expiryKeys.every(key => condition[key] === undefined || condition[key] === record[key]));
}

export async function runJob({ store, bot, telegram, notion, config, now = Date.now, logger = console }, type) {
  const job = store.due(type, now());
  if (!job) return false;
  const payload = job.payload;
  try {
    const validOrder = !payload.pendingOrder || store.get('orders', payload.pendingOrder)?.status === 'pending';
    if (type === 'telegram' && validOrder && (!payload.condition || conditionMatches(store, payload.condition, now()))) {
      await telegram(payload.method, payload.body, { timeout: 8000 });
    }
    if (type === 'notion') await syncNotion(notion, store, config.sources, payload);
    if (type === 'refund') {
      const order = store.get('orders', payload.id);
      if (order?.status === 'refund_pending') {
        try {
          await telegram('refundStarPayment', { user_id: Number(order.buyer), telegram_payment_charge_id: order.charge });
        } catch (error) {
          if (error.code !== 'already_refunded') throw error;
        }
        store.transaction(() => bot.recordRefund(store.get('orders', order.id)));
      }
    }
    store.finish(job, 'done', now());
  } catch (error) {
    const retryable = !error.status || error.status === 429 || error.status >= 500;
    const failed = !retryable || job.attempts >= 7;
    const delay = Math.max((error.retryAfter || 0) * 1000, Math.min(30 * 60_000, 3000 * 2 ** job.attempts));
    const message = error.message.slice(0, 230);
    store.transaction(() => {
      store.finish(job, failed ? 'failed' : 'pending', now() + delay, message);
      const fromGroup = String(payload.body?.chat_id) === config.salesChat;
      if (failed && !fromGroup) {
        store.queue('telegram', 'failure:' + job.id + ':' + job.revision, {
          method: 'sendMessage',
          body: { chat_id: config.salesChat, text: 'ការងារបរាជ័យ · ' + job.id +
            '\nពិនិត្យ /failed និង /retry JOB_ID ក្នុងក្រុមលក់។' },
        }, now());
      }
    });
    logger.warn(job.type + ' job: ' + message);
  }
  return true;
}

export async function worker(context, type, signal) {
  while (!signal.aborted) {
    const worked = await runJob(context, type);
    const delay = worked ? (type === 'notion' ? 1100 : 120) : 1000;
    await sleep(delay, null, { signal }).catch(() => {});
  }
}
