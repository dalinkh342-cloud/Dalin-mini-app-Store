const tg = window.Telegram?.WebApp;
const root = document.querySelector('#shop-root');
const dialog = document.querySelector('#shop-dialog');
const language = document.querySelector('#language');
const status = document.querySelector('#status');
root.classList.add('shop-surface');
const dictionary = {
  shop: ['ហាង', 'Shop'], owner: ['ម្ចាស់ហាង', 'Owner'], messages: ['សារ', 'Messages'],
  orders: ['ការបញ្ជាទិញ', 'Orders'], title: ['កម្មវិធីរបស់យើង', 'Our Mini Apps'],
  intro: ['ជ្រើសកម្មវិធីសម្រាប់អាជីវកម្មរបស់អ្នក។', 'Choose an app for your business.'],
  contact: ['ជជែកជាមួយអ្នកលក់', 'Chat with sales'], details: ['មើលលម្អិត', 'View details'],
  openTrial: ['ព័ត៌មានសាកល្បងក្នុង Bot', 'Trial details in chat'],
  requests: ['សំណើសាកល្បងរបស់ខ្ញុំ', 'My trial requests'], close: ['បិទ', 'Close'],
  preview: ['មើលជាមុន', 'Preview'], publish: ['ផ្សាយទៅ Channel', 'Publish to channel'],
  products: ['ផលិតផល', 'Products'], promos: ['ប្រូម៉ូសិន', 'Promotions'],
  add: ['បន្ថែមផលិតផល', 'Add product'], edit: ['កែព័ត៌មាន', 'Edit'],
  hide: ['លាក់ពីហាង', 'Hide from shop'], restore: ['ដាក់លក់', 'Publish product'],
  draft: ['ព្រាង', 'Draft'], live: ['កំពុងលក់', 'Published'], hidden: ['បានលាក់', 'Hidden'],
  name: ['ឈ្មោះផលិតផល', 'Product name'], key: ['លេខកូដផលិតផល', 'Product key'],
  km: ['ពិពណ៌នាខ្មែរ', 'Khmer description'], en: ['ពិពណ៌នាអង់គ្លេស', 'English description'],
  image: ['តំណរូបភាព HTTPS', 'HTTPS image URL'], trial: ['តំណសាកល្បង HTTPS', 'HTTPS trial URL'],
  starsPrice: ['តម្លៃ Stars សម្រាប់ ១ ខែ', 'Stars price for one month'],
  webPrice: ['តម្លៃ USD សម្រាប់ហាង Web', 'USD price for web shop'],
  state: ['ស្ថានភាព', 'Status'], save: ['រក្សាទុក', 'Save'],
  stars: ['Stars / ខែ', 'Stars / month'], buy: ['ទិញដោយ Stars', 'Buy with Stars'],
  company: ['ឈ្មោះក្រុមហ៊ុន', 'Company name'],
  sendInvoice: ['ផ្ញើវិក្កយបត្រ', 'Send invoice'], sentInvoice: ['បើក Telegram Chat ដើម្បីមើលវិក្កយបត្រ។', 'Open the bot chat to see the invoice.'],
  chatText: ['សរសេរសារ', 'Write a message'], send: ['ផ្ញើ', 'Send'],
  empty: ['មិនទាន់មានកំណត់ត្រា។', 'No records yet.'],
  closeThread: ['បិទការសន្ទនា', 'Close conversation'],
  refresh: ['ធ្វើបច្ចុប្បន្នភាព', 'Refresh'],
  openBot: ['សូមបើកតាមប៊ូតុង «មើលផលិតផល» ក្នុង Telegram Bot។', 'Open this from the View products button in the Telegram bot.'],
  expired: ['សូមបិទ ហើយបើក Mini App ឡើងវិញ។', 'Close and reopen the Mini App.'],
  failed: ['មានបញ្ហា។ សូមសាកម្តងទៀត។', 'Something went wrong. Please try again.'],
  saved: ['បានរក្សាទុក។', 'Saved.'], sent: ['បានផ្ញើ។', 'Sent.'], busy: ['កំពុងដំណើរការ…', 'Working…'],
  promoAdd: ['បង្កើតប្រូម៉ូសិន', 'New promotion'], promoPrice: ['តម្លៃពិសេស (Stars)', 'Sale price (Stars)'],
  promoDate: ['ថ្ងៃផុតកំណត់ (ម៉ោងកម្ពុជា)', 'End date (Cambodia time)'],
  promoVideo: ['តំណវីដេអូ MP4 (ជាជម្រើស)', 'MP4 video URL (optional)'],
  promoNote: ['សារបន្ថែម', 'Additional note'], sale: ['តម្លៃប្រូម៉ូសិន', 'Sale price'],
  queued: ['កំពុងរង់ចាំផ្សាយ', 'Queued'], sending: ['កំពុងផ្សាយ', 'Publishing'],
  published: ['បានផ្សាយ', 'Published'], ended: ['បានបញ្ចប់', 'Ended'],
  endPromo: ['បញ្ចប់ប្រូម៉ូសិន', 'End promotion'], confirmEnd: ['បញ្ចប់តម្លៃពិសេសនេះ?', 'End this sale price?'], uncertain: ['ត្រូវពិនិត្យប្រកាសក្នុង Channel', 'Check the channel for the post'],
  pending: ['រង់ចាំទូទាត់', 'Awaiting payment'], paid: ['បានបង់ · រង់ចាំបើកសិទ្ធិ', 'Paid · awaiting access'],
  delivered: ['បានបើកសិទ្ធិ', 'Access activated'], refunded: ['បានសងប្រាក់', 'Refunded'],
  refund_pending: ['កំពុងសងប្រាក់', 'Refund pending'], refund_failed: ['ការសងប្រាក់បរាជ័យ', 'Refund failed'], review: ['ត្រូវពិនិត្យ', 'Needs review'],
  fulfill: ['កត់ថាបានបើកសិទ្ធិ', 'Mark access activated'], refund: ['សង Stars', 'Refund Stars'],
  confirmFulfill: ['អ្នកបានបើកសិទ្ធិជូនក្រុមហ៊ុនក្នុងកម្មវិធីពិតរួចហើយមែនទេ?', 'Have you already activated access for this company in the actual product?'],
  confirmRefund: ['សង Stars សម្រាប់ការបញ្ជាទិញនេះ?', 'Refund the Stars for this order?'],
};
const errors = {
  promo_stale: ['មានប្រូម៉ូសិនសកម្ម ឬតម្លៃដើមបានផ្លាស់ប្តូរ។', 'An offer is active or the original price has changed.'],
  promo_active: ['មានប្រូម៉ូសិនសកម្មសម្រាប់ផលិតផលនេះ។', 'This product has an active promotion.'],
  promo_invalid: ['តម្លៃពិសេសត្រូវតិចជាងតម្លៃដើម និងមានថ្ងៃផុតកំណត់ត្រឹមត្រូវ។', 'Use a sale price below the regular price and a valid end date.'],
  channel_unconfigured: ['សូមភ្ជាប់ Telegram Channel មុនផ្សាយ។', 'Configure the Telegram channel first.'],
  product_conflict: ['ទិន្នន័យបានផ្លាស់ប្តូរ។ សូមបើកផលិតផលឡើងវិញ។', 'The product changed. Reopen it and try again.'],
  product_invalid: ['សូមពិនិត្យឈ្មោះ ព័ត៌មាន តម្លៃ និងតំណ HTTPS។', 'Check the name, descriptions, prices and HTTPS links.'],
  order_pending: ['មានការបញ្ជាទិញកំពុងដំណើរការ។ សូមមើលផ្ទាំងការបញ្ជាទិញ។', 'An order is in progress. Check Orders.'],
  checkout_disabled: ['ផលិតផលនេះមិនទាន់អាចទូទាត់បាន។', 'Checkout is unavailable for this product.'],
  thread_closed: ['ការសន្ទនានេះបានបិទ។', 'This conversation has been closed.'],
  company_required: ['សូមបញ្ចូលឈ្មោះក្រុមហ៊ុន។', 'Enter a company name.'],
};
let lang = 'km', current = 'shop', session, screenVersion = 0;
const t = key => (dictionary[key] || [key, key])[lang === 'en' ? 1 : 0];
const msg = key => errors[key]?.[lang === 'en' ? 1 : 0] || t(dictionary[key] ? key : 'failed');
function element(tag, text, cls) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (cls) item.className = cls;
  return item;
}
function show(key) { status.hidden = !key; status.textContent = key ? msg(key) : ''; }
function button(label, call, primary = false) {
  const item = element('button', t(label), primary ? 'primary' : '');
  item.type = 'button';
  item.onclick = async () => {
    item.disabled = true;
    try { await call(); } catch (error) { show(error.message); }
    finally { item.disabled = false; }
  };
  return item;
}
const requests = new Map();
async function api(action, fields = {}, change = false) {
  const key = change ? JSON.stringify([action, fields]) : '';
  let requestId = requests.get(key);
  if (change && !requestId) {
    if (requests.size >= 100) requests.delete(requests.keys().next().value);
    requestId = crypto.randomUUID();
    requests.set(key, requestId);
  }
  const response = await fetch('api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: tg.initData, action, ...fields, requestId }),
    signal: AbortSignal.timeout(12_000),
  });
  const answer = await response.json();
  if (key && (response.ok || response.status < 500)) requests.delete(key);
  if (!response.ok) throw new Error(response.status === 401 ? 'expired' : answer.error || 'failed');
  return answer;
}
function sheet(title) {
  const body = element('section', undefined, 'shop-surface shop-sheet');
  const header = element('div', undefined, 'shop-sheet-head');
  const h = element('h2', t(title));
  h.id = 'shop-dialog-title';
  header.append(h, button('close', () => dialog.close()));
  body.append(header);
  dialog.replaceChildren(body);
  if (!dialog.open) dialog.showModal();
  return body;
}
function badge(key) {
  return element('span', t(key), 'shop-badge' + (['live', 'paid', 'delivered', 'published'].includes(key) ? ' good' : ''));
}
function field(key, name, options = {}) {
  const wrap = element('label', t(key));
  const input = element(options.tag || 'input');
  input.name = name;
  input.value = options.value ?? '';
  for (const [prop, value] of Object.entries(options)) {
    if (prop !== 'tag' && prop !== 'value') input[prop] = value;
  }
  wrap.append(input);
  return wrap;
}
function formButton(form, key, call) {
  const send = element('button', t(key), 'primary');
  send.type = 'submit';
  const actions = element('div', undefined, 'shop-actions'), feedback = element('small', undefined, 'shop-form-status');
  feedback.setAttribute('role', 'status');
  actions.append(send);
  form.append(actions, feedback);
  form.onsubmit = async event => {
    event.preventDefault();
    if (send.disabled) return;
    send.disabled = true;
    feedback.textContent = t('busy');
    try { await call(Object.fromEntries(new FormData(form))); feedback.textContent = ''; }
    catch (error) { feedback.textContent = msg(error.message); }
    finally { send.disabled = false; }
  };
}
function gotoBot(p) {
  return async () => {
    await api(p ? 'shop-open-bot' : 'mine', p ? { product: p.id } : {}, true);
    tg.close();
  };
}
async function render(next = current) {
  current = next;
  const version = ++screenVersion;
  const tabs = element('nav', undefined, 'shop-tabs');
  for (const key of ['shop', 'messages', 'orders', ...(session.owner ? ['owner'] : [])]) {
    const item = button(key, () => render(key));
    item.setAttribute('aria-pressed', String(next === key));
    tabs.append(item);
  }
  const body = element('div', undefined, 'shop-flow');
  root.replaceChildren(tabs, body);
  show('');
  if (next === 'shop') {
    const latest = await api('shop-session');
    if (version !== screenVersion) return;
    session = latest;
    shopPage(body);
  } else if (next === 'messages') {
    const rows = await api('shop-threads');
    if (version === screenVersion) threadList(body, rows);
  } else if (next === 'owner') {
    const data = await api('shop-admin');
    if (version === screenVersion) ownerPage(body, data);
  } else if (next === 'orders') {
    const data = await api('shop-orders');
    if (version === screenVersion) ordersPage(body, data);
  }
}
function productImage(p) {
  if (!p.image && !p.imageUrl) return element('span', p.name[0], 'shop-logo');
  const image = element('img');
  image.src = p.imageUrl || p.image;
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  image.loading = 'lazy';
  image.onerror = () => image.replaceWith(element('span', p.name[0], 'shop-logo'));
  return image;
}
function shopPage(body) {
  body.append(element('h1', t('title')), element('p', t('intro'), 'shop-muted'));
  const grid = element('div', undefined, 'shop-grid');
  for (const p of session.products) {
    const card = element('article', undefined, 'shop-product');
    const details = element('div');
    details.append(element('h3', p.name), element('p', p[lang], 'shop-muted'));
    if (p.stars) details.append(element('div', p.stars + ' ' + t('stars'), p.promotionEnds ? 'shop-promo' : 'shop-money'));
    const actions = element('div', undefined, 'shop-actions');
    actions.append(button('details', () => productDetail(p)));
    card.append(productImage(p), details, actions);
    grid.append(card);
  }
  const buttons = element('div', undefined, 'shop-actions');
  buttons.append(button('requests', gotoBot()), button('contact', () => startChat()));
  body.append(grid, buttons);
}
function productDetail(p) {
  const panel = sheet('details');
  panel.append(element('h3', p.name), element('p', p[lang]));
  if (p.promotionEnds) panel.append(element('div',
    t('sale') + ' · ' + p.regularStars + ' → ' + p.stars + ' Stars\n' + dateFormat(p.promotionEnds), 'shop-promo'));
  const controls = element('div', undefined, 'shop-actions');
  if (p.stars) controls.append(button('buy', () => invoiceForm(p), true));
  controls.append(button('openTrial', gotoBot(p)), button('contact', () => startChat(p)));
  panel.append(controls);
}
function invoiceForm(p) {
  const panel = sheet('buy'), form = element('form');
  panel.append(element('h3', p.name), element('p', p.stars + ' ' + t('stars'), 'shop-money'));
  form.append(field('company', 'company', { required: true, maxLength: 80 }));
  formButton(form, 'sendInvoice', async data => {
    await api('shop-buy', { ...data, product: p.id }, true);
    dialog.close();
    await render('orders');
    show('sentInvoice');
    tg.close();
  });
  panel.append(form);
}
function startChat(p) {
  const panel = sheet('contact'), form = element('form');
  if (p) panel.append(element('h3', p.name));
  form.append(field('chatText', 'text', { tag: 'textarea', required: true, maxLength: 1600 }));
  formButton(form, 'send', async data => {
    const thread = await api('shop-open-thread', { ...data, product: p?.id || 'general' }, true);
    await render('messages');
    await openThread(thread.id);
  });
  panel.append(form);
}
function threadList(body, rows) {
  body.append(element('h1', t('messages')), button('refresh', () => render('messages')));
  if (!rows.length) body.append(element('p', t('empty'), 'shop-note'));
  for (const row of rows) {
    const card = element('article', undefined, 'shop-row');
    card.append(element('h3', row.name + ' · ' + row.id), button(row.id, () => openThread(row.id)));
    body.append(card);
  }
}
async function openThread(id) {
  const data = await api('shop-thread', { id });
  const panel = sheet('messages');
  panel.append(element('h3', data.thread.name + ' · ' + id));
  const log = element('div', undefined, 'shop-chat');
  log.setAttribute('role', 'log');
  for (const m of data.messages) log.append(element('div', m.text, 'shop-bubble' + (m.fromBuyer ? ' buyer' : '')));
  panel.append(log);
  log.scrollTop = log.scrollHeight;
  if (data.thread.status === 'open') {
    const form = element('form');
    form.append(field('chatText', 'text', { tag: 'textarea', required: true, maxLength: 1600 }));
    formButton(form, 'send', async draft => { await api('shop-message', { id, ...draft }, true); await openThread(id); });
    panel.append(form);
  }
  const actions = element('div', undefined, 'shop-actions');
  actions.append(button('refresh', () => openThread(id)));
  if (session.seller && data.thread.status === 'open') actions.append(button('closeThread', async () => {
    await api('shop-close-thread', { id }, true);
    await openThread(id);
  }));
  panel.append(actions);
}
function ownerPage(body, data) {
  body.append(element('h1', t('owner')));
  const actions = element('div', undefined, 'shop-actions');
  actions.append(button('add', () => editProduct(), true), button('refresh', () => render('owner')));
  body.append(actions, element('h2', t('products')));
  for (const p of data.products) {
    const card = element('article', undefined, 'shop-row');
    card.append(element('h3', p.name), badge(p.status));
    const row = element('div', undefined, 'shop-actions');
    row.append(button('edit', () => editProduct(p)));
    row.append(button(p.status === 'live' ? 'hide' : 'restore', async () => {
      await api('shop-product-save', { ...p, editing: true, imageUrl: p.imageUrl || '',
        status: p.status === 'live' ? 'hidden' : 'live' }, true);
      await render('owner');
    }));
    card.append(row);
    body.append(card);
  }
  body.append(element('h2', t('promos')), element('p', data.channel || msg('channel_unconfigured'), 'shop-muted'));
  if (data.stars) body.append(button('promoAdd', () => promotionForm(data.products), true));
  for (const p of data.promotions) {
    const card = element('article', undefined, 'shop-row');
    card.append(element('h3', p.name), badge(p.state), element('p', p.stars + ' Stars · ' + dateFormat(p.expires), 'shop-muted'));
    card.append(button('preview', () => promoPreview(p)));
    body.append(card);
  }
}
function editProduct(p) {
  const panel = sheet(p ? 'edit' : 'add'), form = element('form');
  form.append(
    field('key', 'id', { value: p?.id, readOnly: Boolean(p), required: true, pattern: '[a-z][a-z0-9\\-]{1,23}', maxLength: 24 }),
    field('name', 'name', { value: p?.name, required: true, maxLength: 65 }),
    field('km', 'km', { tag: 'textarea', value: p?.km, required: true, maxLength: 240 }),
    field('en', 'en', { tag: 'textarea', value: p?.en, required: true, maxLength: 240 }),
    field('image', 'imageUrl', { type: 'url', value: p?.imageUrl, maxLength: 700 }),
    field('trial', 'trialUrl', { type: 'url', value: p?.trialUrl, maxLength: 700 })
  );
  const prices = element('div', undefined, 'shop-form-grid');
  prices.append(field('starsPrice', 'stars', { type: 'number', min: 1, max: 10000, value: p?.stars }),
    field('webPrice', 'usd', { type: 'number', min: 0.01, max: 10000, step: '0.01', value: p?.cents ? (p.cents / 100).toFixed(2) : '' }));
  form.append(prices);
  const label = element('label', t('state')), select = element('select');
  select.name = 'status';
  for (const key of ['draft', 'live', 'hidden']) {
    const option = element('option', t(key));
    option.value = key;
    select.append(option);
  }
  select.value = p?.status || 'draft';
  label.append(select);
  form.append(label);
  formButton(form, 'save', async data => {
    await api('shop-product-save', { ...data, editing: Boolean(p), revision: p?.revision,
      stars: data.stars ? Number(data.stars) : null, cents: data.usd ? Math.round(Number(data.usd) * 100) : null }, true);
    dialog.close();
    await render('owner');
    show('saved');
  });
  panel.append(form);
}
function promotionForm(products) {
  const panel = sheet('promoAdd'), form = element('form');
  const product = element('label', t('products')), choices = element('select');
  choices.name = 'product';
  choices.required = true;
  for (const p of products.filter(p => p.status === 'live' && p.stars > 1)) {
    const option = element('option', p.name + ' · ' + p.stars + ' Stars');
    option.value = p.id;
    choices.append(option);
  }
  if (!choices.options.length) { panel.append(element('p', msg('promo_invalid'))); return; }
  product.append(choices);
  form.append(product, field('promoPrice', 'stars', { type: 'number', min: 1, max: 9999, required: true }),
    field('promoDate', 'date', { type: 'date', required: true }), field('promoVideo', 'video', { type: 'url', maxLength: 700 }),
    field('promoNote', 'note', { tag: 'textarea', maxLength: 400 }));
  formButton(form, 'preview', async data => promoPreview(await api('shop-promo-save', { ...data, stars: Number(data.stars) }, true)));
  panel.append(form);
}
function promoPreview(p) {
  const panel = sheet('preview');
  panel.append(element('pre', p.preview, 'shop-pre'), badge(p.state));
  if (p.video) panel.append(element('p', p.video, 'shop-muted'));
  if (['queued', 'published'].includes(p.state) && p.expires > Date.now()) {
    panel.append(button('endPromo', async () => {
      if (!window.confirm(t('confirmEnd'))) return;
      await api('shop-promo-end', { id: p.id }, true);
      dialog.close();
      await render('owner');
    }));
  }
  if (['draft', 'failed'].includes(p.state) && p.expires > Date.now()) {
    panel.append(button('publish', async () => {
      await api('shop-promo-publish', { id: p.id }, true);
      dialog.close();
      await render('owner');
      show('queued');
    }, true));
  }
}
const dateFormat = time => new Intl.DateTimeFormat(lang, {
  timeZone: 'Asia/Phnom_Penh', dateStyle: 'medium', timeStyle: 'short',
}).format(time);
function ordersPage(body, rows) {
  body.append(element('h1', t('orders')), button('refresh', () => render('orders')));
  if (!rows.length) body.append(element('p', t('empty'), 'shop-note'));
  for (const row of rows) {
    const card = element('article', undefined, 'shop-row');
    const amount = row.method === 'stars' ? row.amount + ' Stars' : '$' + (row.amount / 100).toFixed(2) + ' KHQR';
    card.append(element('h3', row.name + ' · ' + row.id), element('p', row.company + ' · ' + amount, 'shop-muted'), badge(row.status));
    if (row.contact) card.append(element('p', row.contact, 'shop-muted'));
    if (session.owner) {
      const options = element('div', undefined, 'shop-actions');
      const action = (key, confirmText, verb) => button(key, async () => {
        if (!window.confirm(t(confirmText))) return;
        await api(verb, { id: row.id }, true);
        await render('orders');
      });
      if (row.status === 'paid') options.append(action('fulfill', 'confirmFulfill', 'shop-fulfill'));
      if (row.method === 'stars' && ['paid', 'review', 'delivered', 'refund_failed'].includes(row.status)) {
        options.append(action('refund', 'confirmRefund', 'shop-refund'));
      }
      card.append(options);
    }
    body.append(card);
  }
}
language.addEventListener('change', async () => {
  const next = language.value;
  if (!session) return;
  try {
    await api('language', { language: next });
    lang = next;
    document.documentElement.lang = lang;
    await render();
  } catch (error) { language.value = lang; show(error.message); }
});
tg?.ready();
tg?.expand();
if (!tg?.initData) {
  root.querySelectorAll('button').forEach(item => { item.disabled = true; });
  show('openBot');
} else {
  root.querySelectorAll('button').forEach(item => { item.disabled = true; });
  api('shop-session').then(async data => {
    session = data;
    lang = data.language;
    language.value = lang;
    document.documentElement.lang = lang;
    await render();
    const target = new URLSearchParams(location.search).get('product');
    const item = session.products.find(p => p.id === target);
    if (item) productDetail(item);
  }).catch(error => show(error.message));
}
