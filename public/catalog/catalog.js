const copy = {
  km: {
    language: 'ភាសា',
    title: 'កម្មវិធីរបស់យើង',
    intro: 'ជ្រើសកម្មវិធីសម្រាប់អាជីវកម្មរបស់អ្នក',
    staffday: 'វត្តមាន និងការឈប់សម្រាក',
    inventra: 'គ្រប់គ្រងស្តុក និងទ្រព្យសម្បត្តិ',
    luyvio: 'វិក្កយបត្រ និងសម្រង់តម្លៃ',
    mine: 'សំណើរបស់ខ្ញុំ',
    contact: 'ទាក់ទងក្រុមលក់',
    openBot: 'សូមបើកកាតាឡុកពីប៊ូតុង «មើលផលិតផល» ក្នុង Telegram Bot។',
    expired: 'សូមបិទកាតាឡុក រួចបើកម្ដងទៀតពី Telegram Bot។',
    sending: 'កំពុងបើកក្នុង Chat…',
    failed: 'មានបញ្ហាភ្ជាប់។ សូមសាកម្ដងទៀត។',
    sent: 'សូមមើលសារក្នុង Telegram Chat។',
  },
  en: {
    language: 'Language',
    title: 'Product catalog',
    intro: 'Choose an app for your business',
    staffday: 'Attendance & Leave',
    inventra: 'Stock & Asset Management',
    luyvio: 'Invoices & Quotes',
    mine: 'My requests',
    contact: 'Contact sales',
    openBot: 'Open the catalog from the View products button in the Telegram bot.',
    expired: 'Close the catalog and reopen it from the Telegram bot.',
    sending: 'Opening in chat…',
    failed: 'Connection failed. Please try again.',
    sent: 'Check your Telegram chat.',
  },
};

const telegram = window.Telegram?.WebApp;
const initData = telegram?.initData;
const picker = document.querySelector('#language');
const status = document.querySelector('#status');
const labels = document.querySelectorAll('[data-copy]');
const buttons = document.querySelectorAll('[data-action]');
const requestIds = new Map();
let language = 'km';
let statusKey = '';

function showStatus(key) {
  statusKey = key;
  status.hidden = !key;
  status.textContent = key ? copy[language][key] : '';
}

function renderLanguage(next) {
  language = next === 'en' ? 'en' : 'km';
  document.documentElement.lang = language;
  picker.value = language;
  document.querySelector('#language-label').textContent = copy[language].language;
  for (const label of labels) label.textContent = copy[language][label.dataset.copy];
  showStatus(statusKey);
}

function setBusy(busy) {
  picker.disabled = busy;
  for (const button of buttons) button.disabled = busy;
}

async function post(action, fields = {}) {
  const response = await fetch('api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, action, ...fields }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'expired' : 'failed');
  return response.json();
}

picker.addEventListener('change', async () => {
  const next = picker.value;
  if (!initData) return renderLanguage(next);
  setBusy(true);
  try {
    const saved = await post('language', { language: next });
    renderLanguage(saved.language);
    showStatus('');
  } catch (error) {
    picker.value = language;
    showStatus(error.message === 'expired' ? 'expired' : 'failed');
  } finally {
    setBusy(false);
  }
});

for (const button of buttons) {
  button.addEventListener('click', async () => {
    if (!initData) {
      showStatus('openBot');
      status.scrollIntoView({ block: 'nearest' });
      return;
    }
    const action = button.dataset.action;
    const requestId = requestIds.get(action) || crypto.randomUUID();
    requestIds.set(action, requestId);
    setBusy(true);
    showStatus('sending');
    try {
      await post(action, { requestId });
      requestIds.delete(action);
      showStatus('sent');
      telegram.close();
    } catch (error) {
      showStatus(error.message === 'expired' ? 'expired' : 'failed');
      status.scrollIntoView({ block: 'nearest' });
    } finally {
      setBusy(false);
    }
  });
}

telegram?.ready();
telegram?.expand();
if (initData) {
  setBusy(true);
  post('session')
    .then(profile => renderLanguage(profile.language))
    .catch(error => showStatus(error.message === 'expired' ? 'expired' : 'failed'))
    .finally(() => setBusy(false));
} else {
  showStatus('openBot');
}
