const panel = document.querySelector('#web-content');
const status = document.querySelector('#web-status');
const key = 'dalin-shop-khqr';
let timer, generation = 0, orderCredential;
function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function tell(text = '') { status.textContent = text; status.hidden = !text; }
function button(text, click, primary = false) {
  const b = el('button', text, primary ? 'primary' : '');
  b.type = 'button';
  b.onclick = click;
  return b;
}
async function get(path, fields) {
  const response = await fetch(path, fields ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields), signal: AbortSignal.timeout(12_000),
  } : { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}
async function products() {
  ++generation;
  clearTimeout(timer);
  tell('');
  const data = await get('products');
  panel.replaceChildren();
  if (data.sandbox) panel.append(el('p', 'KHQR សាកល្បង · សូមប្រើគណនី sandbox', 'shop-note'));
  if (!data.products.length) panel.append(el('p', 'មិនទាន់មានផលិតផលសម្រាប់ការទូទាត់តាម KHQR ទេ។', 'shop-note'));
  if (orderCredential) panel.append(button('មើលការបញ្ជាទិញថ្មីបំផុត', () => checkOrder()));
  for (const item of data.products) {
    const card = el('article', undefined, 'shop-row');
    card.append(el('h2', item.name), el('p', item.km), el('p', '$' + item.amount + ' / ខែ', 'shop-money'),
      button('ទូទាត់តាម KHQR', () => checkout(item), true));
    panel.append(card);
  }
}
function field(text, type, name, length) {
  const label = el('label', text);
  const input = el('input');
  input.type = type;
  input.name = name;
  input.required = true;
  input.maxLength = length;
  label.append(input);
  return label;
}
function checkout(item) {
  const form = el('form', undefined, 'shop-bill');
  form.append(el('h2', item.name), el('p', '$' + item.amount + ' / ខែ', 'shop-money'),
    field('ឈ្មោះក្រុមហ៊ុន', 'text', 'company', 80),
    field('អ៊ីមែលសម្រាប់ក្រុមលក់ទាក់ទង', 'email', 'contact', 230));
  const send = el('button', 'បង្កើត KHQR', 'primary');
  send.type = 'submit';
  form.append(send, button('ត្រឡប់', back));
  const requestId = crypto.randomUUID();
  form.onsubmit = async event => {
    event.preventDefault();
    if (send.disabled) return;
    send.disabled = true;
    tell('កំពុងបង្កើត KHQR…');
    try {
      const info = Object.fromEntries(new FormData(form));
      const order = await get('orders', { ...info, product: item.id, amount: item.amount, requestId });
      orderCredential = { id: order.id, token: order.token };
      try { sessionStorage.setItem(key, JSON.stringify(orderCredential)); } catch {}
      showOrder(order);
    } catch { tell('មិនអាចបង្កើត KHQR បាន។ សូមពិនិត្យព័ត៌មាន រួចសាកម្តងទៀត។'); }
    finally { send.disabled = false; }
  };
  panel.replaceChildren(form);
}
function back() { products().catch(() => tell('មិនអាចបើកទំព័របាន។ សូមសាកម្តងទៀត។')); }
async function checkOrder() {
  if (!orderCredential) return;
  clearTimeout(timer);
  const version = ++generation;
  try {
    const order = await get('status', orderCredential);
    if (version === generation) showOrder(order);
  } catch {
    if (version === generation) {
      tell('មិនអាចពិនិត្យស្ថានភាពបាន។ កំពុងព្យាយាមម្តងទៀត…');
      timer = setTimeout(checkOrder, 15_000);
    }
  }
}
const states = {
  paid: 'បានទទួលប្រាក់។ ក្រុមលក់នឹងទាក់ទងអ្នកដើម្បីបើកសិទ្ធិ។',
  delivered: 'បានបើកសិទ្ធិប្រើប្រាស់រួច។',
  expired: 'ការបញ្ជាទិញនេះផុតកំណត់។',
  review: 'ការទូទាត់កំពុងរង់ចាំក្រុមលក់ផ្ទៀងផ្ទាត់។',
  pending: 'រង់ចាំធនាគារបញ្ជាក់ការទូទាត់។',
};
function showOrder(order) {
  tell('');
  const body = el('section', undefined, 'shop-bill');
  body.append(el('h2', order.name), el('p', order.id + ' · $' + order.amount, 'shop-money'),
    el('p', states[order.status] || order.status, ['paid', 'delivered'].includes(order.status) ? 'shop-promo' : 'shop-muted'));
  if (order.image) {
    const image = el('img', undefined, 'shop-qr');
    image.src = order.image;
    image.alt = 'KHQR · ' + order.id;
    body.append(image);
    if (order.deeplink) {
      const link = el('a', 'បើក ABA Mobile', 'shop-link');
      link.href = order.deeplink;
      body.append(link);
    }
    body.append(el('p', 'ស្កេន KHQR រួចទុកទំព័រនេះបើក ដើម្បីមើលលទ្ធផល។', 'shop-muted'));
  } else if (order.status === 'pending') {
    body.append(el('p', 'KHQR មិនអាចបង្ហាញបាន ឬបានផុតកំណត់។ សូមរង់ចាំលទ្ធផលពីធនាគារ។', 'shop-muted'));
  }
  body.append(button('ពិនិត្យស្ថានភាព', checkOrder), button('ត្រឡប់ទៅហាង', back));
  panel.replaceChildren(body);
  clearTimeout(timer);
  if (order.status === 'pending') timer = setTimeout(checkOrder, 10_000);
}
try { orderCredential = JSON.parse(sessionStorage.getItem(key)); } catch {}
if (orderCredential) checkOrder();
else back();
