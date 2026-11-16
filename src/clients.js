export class ApiError extends Error {
  constructor(service, method, status, code, retryAfter = 0) {
    super(service + ' ' + method + ' (' + status + ' ' + code + ')');
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

async function request(url, init, { service, method, fetchImpl, timeout = 10_000, signal }) {
  const timer = AbortSignal.timeout(timeout);
  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: signal ? AbortSignal.any([timer, signal]) : timer });
  } catch {
    throw new ApiError(service, method, 0, 'network');
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    const retryAfter = Number(response.headers.get('retry-after') || json.parameters?.retry_after || 0);
    const telegramRefunded = method === 'refundStarPayment' && /already.refunded/i.test(json.description || '');
    const code = telegramRefunded ? 'already_refunded' : (json.code || json.error_code || 'http_error');
    throw new ApiError(service, method, response.status, code, retryAfter);
  }
  return json;
}

export function telegramClient(token, fetchImpl = fetch) {
  return async (method, body = {}, options = {}) => {
    const chatId = /^-?\d+$/.test(String(body.chat_id)) ? Number(body.chat_id) : body.chat_id;
    const json = await request('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, chat_id: chatId }),
    }, { service: 'Telegram', method, fetchImpl, ...options });
    return json.result;
  };
}

export function notionClient(token, fetchImpl = fetch) {
  return (method, path, body) => request('https://api.notion.com/v1/' + path, {
    method, headers: {
      Authorization: 'Bearer ' + token, 'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, { service: 'Notion', method, fetchImpl });
}

export function staffdayTrialClient({ origin, secret }, fetchImpl = fetch) {
  return async (method, payload) => {
    const result = await request(new URL('/internal/sales/trials', origin), {
      method, redirect: 'error', headers: {
        Authorization: 'Bearer ' + secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, { service: 'StaffDay', method, fetchImpl, timeout: 25_000 });
    if (result?.requestId !== payload.requestId || result?.companyCode !== 'sale-' + payload.requestId ||
        !Number.isSafeInteger(result.trialStart) || !Number.isSafeInteger(result.trialEnd) ||
        result.trialStart <= 0 || result.trialEnd <= result.trialStart ||
        !Number.isFinite(+new Date(result.trialEnd)) ||
        (method === 'PATCH' && result.trialEnd < payload.trialEnd)) {
      throw new ApiError('StaffDay', method, 502, 'invalid_response');
    }
    return result;
  };
}
