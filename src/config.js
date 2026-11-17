export const DAY = 86_400_000;
export const TZ = 'Asia/Phnom_Penh';

export function positiveInteger(value, min, max) {
  if (!/^\d+$/.test(String(value ?? ''))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function requireSetting(env, key, validate = value => Boolean(value)) {
  const value = env[key]?.trim();
  if (!validate(value)) throw new Error('Missing or invalid setting ' + key);
  return value;
}

function memberIds(value = '') {
  const ids = value.split(',').map(id => id.trim()).filter(Boolean);
  if (ids.some(id => !positiveInteger(id, 1, Number.MAX_SAFE_INTEGER))) {
    throw new Error('OWNER_IDS and SELLER_IDS must be comma-separated Telegram user IDs');
  }
  return new Set(ids);
}

function httpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export function loadConfig(env = process.env) {
  const owners = memberIds(requireSetting(env, 'OWNER_IDS'));
  if (!owners.size) throw new Error('OWNER_IDS must contain at least one Telegram user ID');
  const starsFlag = env.ENABLE_STARS?.trim() || 'false';
  if (!['true', 'false'].includes(starsFlag)) throw new Error('ENABLE_STARS must be true or false');
  const stars = starsFlag === 'true';
  const trialDays = positiveInteger(env.TRIAL_DAYS || '14', 3, 90);
  const starsAmount = positiveInteger(env.STAFFDAY_PRICE_XTR, 1, 10000);
  const port = positiveInteger(env.PORT || '3000', 1, 65535);
  if (!trialDays || !port) throw new Error('Invalid TRIAL_DAYS or PORT');
  if (stars && !starsAmount) throw new Error('Set an approved integer STAFFDAY_PRICE_XTR before enabling Stars');
  if (env.RAILWAY_ENVIRONMENT_ID && !env.RAILWAY_VOLUME_MOUNT_PATH) {
    throw new Error('Attach a Railway volume before starting the bot');
  }
  for (const key of ['STAFFDAY_DEMO_URL', 'HR_REPORT_DEMO_URL']) {
    if (env[key] && !httpsUrl(env[key])) throw new Error('Invalid HTTPS URL in ' + key);
  }
  const trialApiUrl = env.STAFFDAY_TRIAL_API_URL?.trim();
  const trialApiSecret = env.STAFFDAY_TRIAL_API_SECRET?.trim();
  let trialApi;
  if (trialApiUrl || trialApiSecret) {
    const origin = URL.parse(trialApiUrl || '');
    const privateHttp = origin?.protocol === 'http:' && origin.hostname.endsWith('.railway.internal');
    if (!origin || (origin.protocol !== 'https:' && !privateHttp) || origin.username || origin.password ||
        origin.pathname !== '/' || origin.search || origin.hash || !/^[a-f0-9]{64}$/.test(trialApiSecret || '')) {
      throw new Error('StaffDay trial integration requires a valid origin and a 64-character lowercase hex secret.');
    }
    trialApi = {origin: origin.origin, secret: trialApiSecret};
  }
  const catalogSetting = env.CATALOG_PUBLIC_URL?.trim();
  const luyvioOrigin = env.LUYVIO_TRIAL_API_URL?.trim();
  const luyvioSecret = env.LUYVIO_TRIAL_API_SECRET?.trim();
  const luyvioUrl = env.LUYVIO_URL?.trim();
  let luyvioTrialApi;
  if (luyvioOrigin || luyvioSecret) {
    const url = URL.parse(luyvioOrigin || '');
    const privateHttp = url?.protocol === 'http:' && url.hostname.endsWith('.railway.internal');
    if (!url || (url.protocol !== 'https:' && !privateHttp) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash || !/^[a-f0-9]{64}$/.test(luyvioSecret || '') ||
        !httpsUrl(luyvioUrl)) throw new Error('Luyvio trial integration requires an origin, a 64-character lowercase hex secret and LUYVIO_URL.');
    luyvioTrialApi = { origin: url.origin, secret: luyvioSecret };
  }
  let catalogOrigin;
  if (catalogSetting) {
    const url = URL.parse(catalogSetting);
    if (!url || url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      throw new Error('CATALOG_PUBLIC_URL must be the HTTPS origin of the Sales Bot.');
    }
    catalogOrigin = url.origin;
  }
  return {
    token: requireSetting(env, 'BOT_TOKEN', value => /^\d+:[\w-]+$/.test(value ?? '')),
    salesChat: requireSetting(env, 'SALES_CHAT_ID', value => /^-\d+$/.test(value ?? '')),
    owners,
    sellers: memberIds(env.SELLER_IDS),
    staffdayUrl: requireSetting(env, 'STAFFDAY_URL', httpsUrl),
    demoUrl: env.STAFFDAY_DEMO_URL?.trim(),
    reportDemoUrl: env.HR_REPORT_DEMO_URL?.trim(),
    priceLabel: env.STAFFDAY_PRICE_LABEL?.trim(),
    stars, starsAmount, trialDays, trialApi, luyvioTrialApi, luyvioUrl, catalogOrigin, port,
    dataDir: env.RAILWAY_VOLUME_MOUNT_PATH || env.DATA_DIR || './data',
    notionToken: requireSetting(env, 'NOTION_TOKEN'),
    sources: {
      leads: requireSetting(env, 'NOTION_LEADS_SOURCE_ID'),
      tasks: requireSetting(env, 'NOTION_TASKS_SOURCE_ID'),
      orders: stars ? requireSetting(env, 'NOTION_ORDERS_SOURCE_ID') : env.NOTION_ORDERS_SOURCE_ID?.trim(),
    },
  };
}

export function formattedDate(time) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, dateStyle: 'medium', timeStyle: 'short',
  }).format(time) + ' (ម៉ោងកម្ពុជា)';
}

export function localDateEnd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null;
  const day = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(+day) || day.toISOString().slice(0, 10) !== value) return null;
  return +day + 17 * 3_600_000 - 1;
}
