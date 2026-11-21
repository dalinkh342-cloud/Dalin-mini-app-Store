import { randomBytes, randomUUID } from 'node:crypto';
import { DAY, formattedDate, localDateEnd, positiveInteger } from './config.js';
import { canChooseTrialHr, handleTrialHr, hrChoiceButtons, preparingTrial } from './trial-approval.js';
import { approveLuyvio, handleLuyvioCustomer, showLuyvioLead } from './luyvio-trial.js';

const PRODUCTS = {
  staffday: { name: 'StaffDay', prefix: 'SD', details: 'កត់វត្តមានតាមទីតាំង ស្នើសុំឈប់សម្រាក និងទាញរបាយការណ៍ HR។', en: 'Record attendance by location, request leave and download HR reports.' },
  inventra: { name: 'Inventra', prefix: 'IN', details: 'គ្រប់គ្រងទំនិញចូលចេញ ស្តុក ទ្រព្យសម្បត្តិ និង QR។', en: 'Manage stock movements, inventory and assets with QR codes.' },
  luyvio: { name: 'Luyvio', prefix: 'LU', details: 'បង្កើតវិក្កយបត្រ សម្រង់តម្លៃ និងឯកសារ PDF។', en: 'Create invoices and quotes and export them as PDFs.' },
  fleetday: { name: 'FleetDay', prefix: 'FD', details: 'កក់ឡាន និងបន្ទប់ប្រជុំរបស់ក្រុមហ៊ុន ហើយអនុម័តភ្លាមៗក្នុងក្រុម Telegram។', en: 'Book company cars and meeting rooms, approved right in your Telegram group.' },
};

const STAGES = {
  new: 'ទទួលសំណើថ្មី', review: 'កំពុងពិនិត្យ', ready: 'ត្រៀមបើក Trial',
  trial: 'Trial កំពុងដំណើរការ', active: 'Active', paused: 'Paused', closed: 'បានបិទ',
};

const callback = (text, callback_data) => ({ text, callback_data });
const link = (text, url) => ({ text, url });
const normalizeName = name => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const label = lead => lead.id + ' · ' + lead.company;
const privateChat = chat => chat.type === 'private';
const hasProduct = key => Object.hasOwn(PRODUCTS, key);
const staffdayButtons = lead => ['trial', 'active'].includes(lead.stage);

export function createBot(store, config, clock = Date.now) {
  function queueTelegram(id, method, body, now, condition = undefined, pendingOrder = undefined) {
    store.queue('telegram', id, { method, body, condition, pendingOrder }, now);
  }

  function dueMessage(id, chat, text, due, condition) {
    queueTelegram(id, 'sendMessage', { chat_id: chat, text }, due, condition);
  }

  const catalogUrl = config.catalogOrigin && config.catalogOrigin + '/catalog/';
  const languageFor = user => store.get('preferences', user)?.language || 'km';

  function makeSay(chatId, jobPrefix, now) {
    let messages = 0;
    return (text, keyboard = [], photo) => {
      const jobId = jobPrefix + ':' + messages++;
      const reply_markup = keyboard.length ? { inline_keyboard: keyboard } : undefined;
      const body = { chat_id: chatId, text, reply_markup, link_preview_options: { is_disabled: true } };
      if (photo) {
        store.queue('telegram', jobId, {
          method: 'sendPhoto', body: { chat_id: chatId, photo, caption: text, reply_markup }, fallback: body,
        }, now);
      } else {
        queueTelegram(jobId, 'sendMessage', body, now);
      }
    };
  }

  function saveLead(lead, fields, by, now) {
    return store.save('leads', { ...lead, ...fields, updated: now, updatedBy: by }, now);
  }

  function saveTask(fields, now) {
    return store.save('tasks', { status: 'open', created: now, updated: now, ...fields }, now);
  }

  function openTask(kind, lead, detail, now, orderId = undefined) {
    const existing = store.all('tasks').find(task => task.status === 'open' && task.kind === kind &&
      task.leadId === lead?.id && task.orderId === orderId && task.detail === detail);
    if (existing) return existing;
    return saveTask({
      id: store.serial('tasks', 'TK'), kind, leadId: lead?.id, orderId, detail,
      product: lead?.product, assigned: lead?.assigned, buyer: lead?.buyer,
    }, now);
  }

  function scheduleTrial(lead) {
    const condition = { id: lead.id, stage: 'trial', trialEnd: lead.trialEnd };
    const tag = lead.id + ':' + lead.trialEnd;
    const firstCheck = lead.trialStart + 2 * DAY;
    if (firstCheck > lead.updated) {
      dueMessage('day3:' + lead.id, config.salesChat,
        'តាមដានថ្ងៃទី ៣ · ' + label(lead) + '\nផ្ទៀងផ្ទាត់ថា HR ចូល និងសាកកត់វត្តមានបាន។',
        firstCheck, { id: lead.id, stage: 'trial', beforeTrialEnd: true });
    }
    dueMessage('pre-expire:' + tag, lead.buyer, 'Trial StaffDay របស់ ' + lead.company +
      ' នឹងផុតកំណត់នៅ ' + formattedDate(lead.trialEnd) +
      '\nចុច /my ចូលទៅស្នើបន្តប្រើ ឬចុច /support ដើម្បីសុំជំនួយ។',
    Math.max(lead.updated, lead.trialEnd - 2 * DAY), { ...condition, beforeTrialEnd: true });
    dueMessage('expire:' + tag, config.salesChat, 'Trial ដល់ថ្ងៃផុត · ' + label(lead) +
      '\nផ្ទៀងផ្ទាត់សិទ្ធិក្នុង StaffDay ហើយកត់ /active /extend ឬ /pause។', lead.trialEnd, condition);
    dueMessage('expiry-customer:' + tag, lead.buyer,
      'រយៈពេលសាកល្បង StaffDay របស់ ' + lead.company +
      ' បានដល់ថ្ងៃផុតកំណត់។ ចុច /my ដើម្បីស្នើបន្ត ឬ /support ដើម្បីទាក់ទងក្រុមការងារ។',
    lead.trialEnd, condition);
  }

  function processCustomer({ user, profile, input, data, say, now }) {
    const draft = store.get('drafts', user);
    const setDraft = fields => store.save('drafts', { id: user, ...fields }, now);
    const selectedLanguage = catalogUrl && /^language:(km|en)$/.exec(data || '')?.[1];
    if (selectedLanguage) store.setLanguage(user, selectedLanguage);
    const english = languageFor(user) === 'en';
    const tr = (km, en) => english ? en : km;
    const contact = tr('ទាក់ទងក្រុមលក់', 'Contact sales');
    const myRequests = tr('សំណើរបស់ខ្ញុំ', 'My requests');
    const requestTrial = tr('ស្នើសាកល្បង', 'Request a trial');
    const cancel = [callback(tr('បោះបង់', 'Cancel'), 'menu')];
    const menu = () => {
      const text = tr('សូមជ្រើសកម្មវិធីសម្រាប់អាជីវកម្មរបស់អ្នក។', 'Choose an app for your business.');
      if (catalogUrl) {
        return say(text, [
          [{ text: tr('មើលផលិតផល', 'View products'), web_app: { url: catalogUrl } }],
          [callback(tr('ប្ដូរភាសា', 'Language'), 'choose-language'), callback(contact, 'ask:general')],
        ], catalogUrl + 'welcome.jpg?v=4apps');
      }
      return say(tr('សួស្តី! សូមជ្រើសកម្មវិធីសម្រាប់ការងារប្រចាំថ្ងៃរបស់អ្នក។', text), [
        [callback('StaffDay', 'product:staffday'), callback('Inventra', 'product:inventra')],
        [callback('Luyvio', 'product:luyvio'), callback('FleetDay', 'product:fleetday')],
        [callback(myRequests, 'mine'), callback(contact, 'ask:general')],
      ]);
    };
    const product = (key, source) => {
      if (!hasProduct(key)) return menu();
      const entry = PRODUCTS[key];
      setDraft({ product: key, source, step: 'browse' });
      const buttons = [];
      if (key === 'staffday') {
        if (config.demoUrl || config.reportDemoUrl) buttons.push([callback(tr('មើល Demo', 'View demo'), 'demo')]);
        buttons.push([callback(requestTrial, 'starttrial')]);
      }
      if (key === 'luyvio' && config.luyvioTrialApi) buttons.push([callback(requestTrial, 'lu-start')]);
      if (key === 'fleetday' && config.fleetdayUrl) buttons.push([callback(tr('សាកល្បងឥតគិតថ្លៃ', 'Start free trial'), 'fd-trial')]);
      buttons.push([callback(contact, 'ask:' + key), callback(tr('ត្រឡប់', 'Back'), 'menu')]);
      let trial = key === 'staffday' ? '\n' + tr('សាកល្បង ' + config.trialDays + ' ថ្ងៃ។', config.trialDays + '-day trial.') +
        (config.priceLabel ? '\n' + config.priceLabel : '') : '';
      if (key === 'fleetday' && config.fleetdayUrl) {
        const days = config.fleetdayTrialDays || 14;
        trial = '\n' + tr('សាកល្បងឥតគិតថ្លៃ ' + days + ' ថ្ងៃ — បង្កើតក្រុមហ៊ុនដោយខ្លួនឯងក្នុង FleetDay។', days + '-day free trial — set up your company yourself in FleetDay.');
      }
      return say(entry.name + '\n' + tr(entry.details, entry.en) + trial, buttons);
    };
    const showLead = lead => {
      if (lead.product === 'luyvio') return showLuyvioLead(lead, { say, config, tr });
      const end = lead.stage === 'trial' && lead.trialEnd < now ? ' · ដល់ថ្ងៃផុតកំណត់' : '';
      const stage = preparingTrial(lead) ? 'កំពុងបើក Trial' :
        lead.trialHrConfirmed && lead.stage === 'ready' ? 'រង់ចាំអនុម័ត Trial' : STAGES[lead.stage];
      const message = label(lead) + '\n' + stage + end +
        (lead.companyCode ? '\nCompany Code: ' + lead.companyCode : '') +
        (lead.stage === 'trial' ? '\nTrial ផុតកំណត់: ' + formattedDate(lead.trialEnd) : '') +
        (lead.stage === 'active' ? '\nបន្តមុន: ' + formattedDate(lead.paidUntil) : '');
      const buttons = [];
      if (config.trialApi && canChooseTrialHr(lead)) buttons.push(...hrChoiceButtons(lead.id));
      if (staffdayButtons(lead)) buttons.push([link('បើក StaffDay', config.staffdayUrl)]);
      if (lead.companyCode && lead.stage !== 'closed') buttons.push([callback('ស្នើបន្តប្រើ', 'renew:' + lead.id)]);
      if (lead.stage !== 'closed') buttons.push([callback('សុំជំនួយ', 'help:' + lead.id)]);
      return say(message, buttons);
    };

    if (handleTrialHr({store, config, saveLead, queueTelegram, user, profile, data, input, say, now})) return;
    if (handleLuyvioCustomer({ store, config, saveLead, queueTelegram, user, profile, data, input, say, now, tr })) return;
    if (/^\/start(?:\s|$)/.test(input)) {
      store.forget('drafts', user);
      const payload = input.split(/\s+/, 2)[1] || '';
      const match = /^(staffday|inventra|luyvio|fleetday)(?:_([a-z0-9_-]{1,45}))?$/.exec(payload);
      return match ? product(match[1], match[2] || 'direct') : menu();
    }
    if (data === 'menu' || input === '/cancel') {
      store.forget('drafts', user);
      return menu();
    }
    if (catalogUrl && (data === 'choose-language' || input === '/language')) {
      return say(tr('ជ្រើសភាសា', 'Choose a language'),
        [[callback('ខ្មែរ', 'language:km'), callback('English', 'language:en')]]);
    }
    if (selectedLanguage) return menu();
    if (data?.startsWith('product:')) return product(data.split(':')[1], 'catalog');
    if (data === 'fd-trial') {
      if (!config.fleetdayUrl) return product('fleetday', 'direct');
      const who = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'User';
      dueMessage('fd-trial:' + user, config.salesChat, 'FleetDay · មានអ្នកចាប់ផ្តើមសាកល្បង\n' + who +
        (profile?.username ? ' (@' + profile.username + ')' : '') + ' · ID ' + user +
        '\nប្រភព: ' + ((draft?.product === 'fleetday' && draft.source) || 'direct') +
        '\nតាមដានក្នុង FleetDay → Owner', now);
      return say(tr('ចុចប៊ូតុងខាងក្រោម ដើម្បីបើក FleetDay ហើយបង្កើតក្រុមហ៊ុនរបស់អ្នក។ ការសាកល្បងចាប់ផ្តើមភ្លាមៗ។',
        'Tap the button below to open FleetDay and create your company. Your trial starts straight away.'), [
        [link(tr('បើក FleetDay', 'Open FleetDay'), config.fleetdayUrl)],
        [callback(contact, 'ask:fleetday'), callback(tr('ត្រឡប់', 'Back'), 'menu')],
      ]);
    }
    if (data === 'demo') {
      const rows = [];
      if (config.demoUrl) rows.push([link('វីដេអូ Check In / Check Out', config.demoUrl)]);
      if (config.reportDemoUrl) rows.push([link('វីដេអូរបាយការណ៍ HR', config.reportDemoUrl)]);
      rows.push([callback('ស្នើសាកល្បង', 'starttrial')]);
      return say('វីដេអូណែនាំ StaffDay', rows);
    }
    if (data === 'starttrial') {
      setDraft({ step: 'company', product: 'staffday', source: (draft?.product === 'staffday' && draft.source) || 'direct', nonce: randomUUID().slice(0, 12) });
      return say(tr('សូមវាយឈ្មោះក្រុមហ៊ុនរបស់អ្នក។', 'Enter your company name.'), [cancel]);
    }
    if (data?.startsWith('confirm:')) {
      if (!draft || draft.nonce !== data.split(':')[1]) return say('សំណើនេះបានផ្លាស់ប្ដូរ។ សូមចុច /start។');
      if (draft.step === 'confirmed') return showLead(store.get('leads', draft.leadId));
      if (draft.step !== 'confirm') return say('សូមបំពេញព័ត៌មានមុនបញ្ជូន។');
      const duplicate = store.all('leads').find(lead => lead.buyer === user && lead.product === 'staffday' &&
        lead.stage !== 'closed' && normalizeName(lead.company) === normalizeName(draft.company));
      const lead = duplicate || saveLead({
        id: store.serial('staffday', 'SD'), product: 'staffday', company: draft.company,
        buyer: user, count: draft.count, source: draft.source, stage: 'new', created: now,
      }, {}, user, now);
      setDraft({ step: 'confirmed', nonce: draft.nonce, leadId: lead.id });
      if (config.trialApi) {
        if (!canChooseTrialHr(lead)) return showLead(lead);
        return say('បានទទួលសំណើ ' + lead.id + '។ តើអ្នកជាអ្នកគ្រប់គ្រង StaffDay (HR) សម្រាប់ក្រុមហ៊ុននេះឬ?', hrChoiceButtons(lead.id));
      }
      if (!duplicate) {
        queueTelegram('new:' + lead.id, 'sendMessage', {
          chat_id: config.salesChat,
          text: 'សំណើ StaffDay ថ្មី\n' + label(lead) + '\nបុគ្គលិក: ' + lead.count + '\nប្រភព: ' + lead.source,
          reply_markup: { inline_keyboard: [[callback('ទទួលការងារ', 'claim:' + lead.id)]] },
        }, now);
      }
      return say('បានទទួលសំណើ ' + lead.id + '។ ក្រុមការងារនឹងទាក់ទងតាម Telegram។',
        [[callback('មើលសំណើ', 'lead:' + lead.id)]]);
    }
    if (data === 'mine' || input === '/my') {
      const rows = store.all('leads').filter(lead => lead.buyer === user).slice(-20).reverse()
        .map(lead => [callback(label(lead).slice(0, 60), 'lead:' + lead.id)]);
      return say(rows.length ? myRequests : tr('អ្នកមិនទាន់មានសំណើ។', 'You have no requests yet.'), rows);
    }
    if (/^(lead|renew|help):/.test(data || '')) {
      const [action, id] = data.split(':');
      const lead = store.get('leads', id);
      if (!lead || lead.buyer !== user) return say('រកមិនឃើញសំណើនេះ។');
      if (action === 'lead') return showLead(lead);
      if (lead.stage === 'closed') return say('សំណើនេះបានបិទ។');
      if (action === 'renew') {
        if (!lead.companyCode) return say('សំណើនេះកំពុងរង់ចាំបើក Trial។');
        const task = openTask('renewal', lead, 'Customer requested renewal', now);
        dueMessage('task:' + task.id, config.salesChat, 'សំណើបន្តប្រើ · ' + label(lead) + ' · ' + task.id, now);
        return say('បានទទួលសំណើបន្តប្រើ ' + task.id + '។');
      }
      setDraft({ step: 'question', kind: 'support', leadId: id, product: lead.product });
      return say('សូមពិពណ៌នាបញ្ហាដែលអ្នកត្រូវការជំនួយ។');
    }
    if (input === '/support' || input === '/paysupport' || data?.startsWith('ask:')) {
      const selected = data?.split(':')[1];
      setDraft({ step: 'question', kind: input === '/paysupport' ? 'payment_support' : 'question',
        product: hasProduct(selected) ? selected : undefined });
      return say(input === '/paysupport' ?
        tr('សូមវាយលេខ Order និងពិពណ៌នាបញ្ហាទូទាត់ ឬសំណើសងប្រាក់។', 'Enter the order number and describe your payment issue or refund request.') :
        tr('សូមវាយសំណួរដែលអ្នកចង់សួរក្រុមលក់។', 'Type your question for the sales team.'), [cancel]);
    }
    if (!input || input.startsWith('/')) return menu();
    if (draft?.step === 'company') {
      if (input.length < 2 || input.length > 90 || /[\u0000-\u001f\u007f]/u.test(input)) {
        return say(tr('សូមបញ្ចូលឈ្មោះក្រុមហ៊ុនមួយបន្ទាត់ ពី ២ ដល់ ៩០ តួអក្សរ។', 'Enter a company name of 2 to 90 characters on one line.'));
      }
      setDraft({ ...draft, company: input, step: 'count' });
      return say(tr('តើមានបុគ្គលិកប៉ុន្មាននាក់ដែលនឹងប្រើ StaffDay?', 'How many employees will use StaffDay?'));
    }
    if (draft?.step === 'count') {
      const digits = input.replace(/[០-៩]/g, ch => String(ch.charCodeAt(0) - 0x17e0));
      const count = positiveInteger(digits, 1, 10000);
      if (!count) return say(tr('សូមវាយចំនួនបុគ្គលិកពី 1 ដល់ 10,000។', 'Enter a number from 1 to 10,000.'));
      setDraft({ ...draft, count, step: 'confirm' });
      return say(tr('ពិនិត្យសំណើ StaffDay\nក្រុមហ៊ុន: ', 'Review your StaffDay request\nCompany: ') + draft.company +
        tr('\nបុគ្គលិក: ', '\nEmployees: ') + count, [
        [callback(tr('បញ្ជាក់សំណើ', 'Confirm request'), 'confirm:' + draft.nonce), callback(tr('កែព័ត៌មាន', 'Edit details'), 'starttrial')],
        cancel,
      ]);
    }
    if (draft?.step === 'question') {
      if (input.length > 1600) return say(tr('សូមរក្សាសារឱ្យខ្លីជាង 1,600 តួអក្សរ។', 'Use 1,600 characters or fewer.'));
      const lead = draft.leadId ? store.get('leads', draft.leadId) : undefined;
      const ticket = saveTask({
        id: store.serial('tasks', 'TK'), kind: draft.kind, leadId: lead?.id,
        product: draft.product, buyer: user, detail: input, assigned: lead?.assigned,
      }, now);
      store.forget('drafts', user);
      dueMessage('task:' + ticket.id, config.salesChat, ticket.id + ' · ' + ticket.kind +
        (ticket.product ? ' · ' + PRODUCTS[ticket.product].name : '') + '\n' + input +
        '\nឆ្លើយតប: /reply ' + ticket.id + ' សាររបស់អ្នក', now);
      return say(tr('បានទទួលសាររបស់អ្នក។ លេខតាមដាន ' + ticket.id + '។', 'Message received. Reference: ' + ticket.id));
    }
    return menu();
  }

  function weekly(now) {
    const offset = 7 * 3_600_000;
    const local = new Date(now + offset);
    const until = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset;
    const from = until - 7 * DAY;
    const leads = store.all('leads');
    const inPeriod = value => value >= from && value < until;
    const expired = leads.filter(lead => inPeriod(lead.trialEnd));
    const converted = expired.filter(lead => lead.firstActive && lead.firstActive < until);
    return [
      'លទ្ធផល Dalin Mini Apps · ៧ ថ្ងៃពេញមុនថ្ងៃនេះ (ម៉ោងកម្ពុជា)',
      'សំណើថ្មី៖ ' + leads.filter(lead => inPeriod(lead.created)).length,
      'បើក Trial៖ ' + leads.filter(lead => inPeriod(lead.trialStart)).length,
      'StaffDay HR ចូលប្រើ៖ ' + leads.filter(lead => inPeriod(lead.hrFirstUse)).length,
      'Trial ដល់ថ្ងៃផុត៖ ' + expired.length,
      'បានបន្តពី Trial ខាងលើ៖ ' + converted.length,
      'អត្រាបន្ត៖ ' + (expired.length ? Math.round(converted.length / expired.length * 100) + '%' : '—'),
    ].join('\n');
  }

  function processSales({ user, input, data, say, now }) {
    const owner = config.owners.has(user);
    const allowed = owner || config.sellers.has(user);
    if (!allowed) return;
    if (approveLuyvio({ store, config, saveLead, user, data, say, now })) return;
    const approval = /^approve-trial:(SD-\d+)$/.exec(data || '');
    if (approval) {
      if (!owner) return say('សកម្មភាពនេះសម្រាប់ Owner។');
      if (!config.trialApi) return say('សូមភ្ជាប់ប្រព័ន្ធ StaffDay មុនបើក Trial។');
      const lead = store.get('leads', approval[1]);
      if (!lead?.trialHrConfirmed) return say('សំណើនេះកំពុងរង់ចាំ HR។');
      if (lead.stage === 'trial') return say('Trial បានបើករួច · ' + label(lead));
      if (preparingTrial(lead)) return say('បានអនុម័តរួច កំពុងបើក Trial · ' + label(lead));
      if (lead.stage !== 'ready') return say('សំណើនេះមិនស្ថិតក្នុងដំណាក់កាលអនុម័តទៀតទេ។');
      const staffdayRequestId = randomBytes(16).toString('hex');
      saveLead(lead, {staffdayRequestId, approvedBy:user, assigned:lead.assigned || user}, user, now);
      store.queue('staffday', 'staffday:trial:' + lead.id, {leadId:lead.id, staffdayRequestId, trialDays:config.trialDays}, now);
      return say('បានអនុម័ត · ' + label(lead) + '។ Bot កំពុងបង្កើតក្រុមហ៊ុន និងផ្តល់សិទ្ធិ HR។');
    }
    const [command, rawId, ...args] = input.split(/\s+/);
    const id = (data?.startsWith('claim:') ? data.split(':')[1] : rawId || '').toUpperCase();
    const action = data?.startsWith('claim:') ? '/claim' : command?.split('@')[0];
    const lead = id ? store.get('leads', id) : null;
    const order = ['/refund', '/voidinvoice'].includes(action) ? store.get('orders', id) : null;
    const ownerActions = new Set(['/trial', '/active', '/extend', '/pause', '/invoice', '/voidinvoice', '/refund', '/retry']);
    if (ownerActions.has(action) && !owner) return say('សកម្មភាពនេះសម្រាប់ Owner។');
    const replyToBuyer = (key, text, buyer = lead.buyer) => dueMessage(key, buyer, text, now);

    if (action === '/saleshelp') return say([
      ...(config.trialApi ? ['ចុច «អនុម័ត Trial» នៅលើសំណើដែល HR បានបញ្ជាក់។'] : []),
      '/claim SD-0001 · ទទួលសំណើ',
      '/verify SD-0001 HR_TELEGRAM_ID LOCATIONS SHIFT · កត់ការផ្ទៀងផ្ទាត់',
      '/trial SD-0001 COMPANY_CODE · កត់ថា Owner បានបើក Trial ក្នុង StaffDay',
      '/used SD-0001 · កត់ថា HR បានសាកប្រើ',
      '/invoice SD-0001 · ផ្ញើ Telegram Stars invoice ពេលបើក Stars',
      '/voidinvoice ORD-0001 · បិទ invoice ដែលមិនទាន់ទូទាត់',
      '/active SD-0001 YYYY-MM-DD · កត់សិទ្ធិ Active និងថ្ងៃប្រើដល់',
      '/extend SD-0001 DAYS · កត់ការពន្យារ',
      '/pause SD-0001 · កត់ថាបានផ្អាកក្នុង StaffDay',
      '/close SD-0001 · បិទសំណើដែលគ្មាន Trial កំពុងដំណើរការ',
      '/reply TK-0001 MESSAGE · ឆ្លើយទៅអតិថិជន',
      '/resolve TK-0001 · បិទសំណើតាមដាន',
      '/refund ORD-0001 · សង Telegram Stars',
      '/salesreport · លទ្ធផលលក់ ៧ ថ្ងៃ',
      '/failed និង /retry JOB_ID · តាមដានការផ្ញើ ឬ Notion sync',
    ].join('\n'));
    if (action === '/salesreport') return say(weekly(now));
    if (action === '/failed') {
      const failures = store.failedJobs();
      return say(failures.length ? failures.map(j => j.id + ' · ' + j.error).join('\n').slice(0, 3700) : 'គ្មានការងារបរាជ័យ។');
    }
    if (action === '/retry') return say(store.retry(rawId || '', now) ? 'បានដាក់ឱ្យសាកម្ដងទៀត។' : 'រកមិនឃើញការងារបរាជ័យ។');
    if (action === '/reply' || action === '/resolve') {
      const task = store.get('tasks', id);
      if (!task || task.status !== 'open') return say('រកមិនឃើញសំណើតាមដានដែលកំពុងបើក។');
      if (action === '/resolve') {
        saveTask({ ...task, status: 'resolved', updated: now, assigned: task.assigned || user }, now);
        return say('បានបិទ ' + task.id);
      }
      const text = args.join(' ');
      if (!task.buyer || !text || text.length > 3500) return say('ប្រើ /reply TK-0001 សាររបស់អ្នក');
      store.save('tasks', { ...task, assigned: user, updated: now }, now);
      replyToBuyer('reply:' + task.id + ':' + randomUUID().slice(0, 12), 'Dalin Mini Apps · ' + task.id + '\n' + text, task.buyer);
      return say('បានដាក់សារឆ្លើយតបក្នុងជួរផ្ញើ។');
    }
    if (action === '/voidinvoice') {
      if (!order || order.status !== 'pending') return say('អាចបិទតែ Invoice ដែលមិនទាន់បង់។');
      if (order.precheckId && now - order.precheckedAt < 10 * 60_000) {
        return say('Invoice កំពុងដំណើរការទូទាត់។ សូមពិនិត្យម្ដងទៀតក្រោយ ១០ នាទី។');
      }
      store.save('orders', { ...order, status: 'void', updated: now }, now);
      return say('បានបិទ Invoice ' + order.id);
    }
    if (action === '/refund') {
      if (!order?.charge || !['paid', 'delivered', 'payment_review', 'refund_pending'].includes(order.status)) return say('ការបញ្ជាទិញនេះមិនទាន់អាចសងប្រាក់បាន។');
      if (order.status === 'refund_pending') return say('កំពុងដំណើរការសងប្រាក់។ ប្រើ /failed ដើម្បីពិនិត្យ។');
      store.save('orders', { ...order, status: 'refund_pending', updated: now }, now);
      store.queue('refund', 'refund:' + order.id, { id: order.id }, now);
      return say('បានដាក់សំណើសងប្រាក់ ' + order.id);
    }
    if (!['/claim', '/verify', '/trial', '/used', '/extend', '/pause', '/close', '/invoice', '/active'].includes(action)) return;
    if (lead?.product === 'luyvio') {
      return say('Luyvio · ' + lead.id + '\nការបើក Trial ប្រើប៊ូតុងអនុម័ត។ ការបន្តប្រើ និងផ្អាកប្រើគ្រប់គ្រងនៅ Luyvio → Owner → Companies។');
    }
    if (!lead) return say('រកមិនឃើញលេខសំណើ StaffDay។');
    if (preparingTrial(lead)) return say('សំណើនេះបានអនុម័តរួច ហើយកំពុងភ្ជាប់ទៅ StaffDay។ ប្រើ /failed ដើម្បីពិនិត្យកំហុស។');
    if (lead.pendingTrialEnd && ['/extend', '/pause', '/active'].includes(action)) {
      return say('ការពន្យារ Trial កំពុងដំណើរការ។ ប្រើ /failed ដើម្បីពិនិត្យកំហុស។');
    }
    if (action === '/claim') {
      if (!['new', 'review'].includes(lead.stage) || (lead.assigned && lead.assigned !== user)) {
        return say('សំណើនេះមានអ្នកទទួល ឬបានឆ្លងដំណាក់កាលពិនិត្យ។');
      }
      saveLead(lead, { stage: 'review', assigned: user }, user, now);
      return say('បានទទួល ' + label(lead) + '\nបន្ទាប់: /verify ' + lead.id + ' HR_TELEGRAM_ID LOCATIONS SHIFT');
    }
    if (action === '/verify') {
      if (lead.trialHrConfirmed && config.trialApi) return say('Bot បានបញ្ជាក់គណនី HR រួច។ សូមប្រើប៊ូតុងអនុម័ត Trial។');
      if (!['new', 'review', 'ready'].includes(lead.stage) || (!owner && lead.assigned && lead.assigned !== user)) {
        return say('សំណើនេះមិនស្ថិតក្នុងការពិនិត្យរបស់អ្នក។');
      }
      const [hrId, loc, ...shiftWords] = args;
      const locations = positiveInteger(loc, 1, 10000);
      const shift = shiftWords.join(' ');
      if (!positiveInteger(hrId, 1, Number.MAX_SAFE_INTEGER) || !locations || !shift || shift.length > 120) {
        return say('ប្រើ /verify ' + lead.id + ' HR_TELEGRAM_ID LOCATIONS SHIFT');
      }
      saveLead(lead, { stage: 'ready', hrId, locations, shift, assigned: lead.assigned || user }, user, now);
      return say('បានកត់ការផ្ទៀងផ្ទាត់ HR សម្រាប់ ' + label(lead) + '\nOwner បង្កើតក្រុមហ៊ុនក្នុង StaffDay រួចប្រើ /trial ' + lead.id + ' COMPANY_CODE');
    }
    if (action === '/trial') {
      if (lead.trialHrConfirmed && config.trialApi) return say('សូមប្រើប៊ូតុង «អនុម័ត Trial» ក្នុងក្រុមលក់។');
      const companyCode = args[0]?.toUpperCase();
      if (lead.stage === 'trial' && lead.companyCode === companyCode) return say('Trial កត់រួច · ' + label(lead));
      if (lead.stage !== 'ready' || !lead.hrId) return say('ផ្ទៀងផ្ទាត់ HR មុន ដោយប្រើ /verify។');
      if (!/^[A-Z0-9_-]{2,48}$/.test(companyCode || '')) return say('ប្រើ /trial ' + lead.id + ' COMPANY_CODE');
      const sameCompany = store.all('leads').find(item => item.companyCode?.toUpperCase() === companyCode);
      if (sameCompany) return say('Company Code នេះស្ថិតលើ ' + sameCompany.id + ' រួចហើយ។');
      const updated = saveLead(lead, { stage: 'trial', companyCode, trialStart: now,
        trialEnd: now + config.trialDays * DAY }, user, now);
      scheduleTrial(updated);
      replyToBuyer('trial-open:' + lead.id, 'StaffDay រួចរាល់ · ' + lead.company +
        '\nផុតកំណត់: ' + formattedDate(updated.trialEnd) + '\nបើក StaffDay: ' + config.staffdayUrl +
        '\nបើ HR ជាមនុស្សផ្សេង សូមផ្ញើតំណឱ្យ HR ហើយឱ្យគាត់ចុច Start។');
      return say('បានកត់ Trial · ' + label(updated) + ' · ' + companyCode + '\n' + formattedDate(updated.trialEnd));
    }
    if (action === '/used') {
      if (!lead.trialStart) return say('មិនទាន់មាន Trial សម្រាប់សំណើនេះ។');
      if (!lead.hrFirstUse) saveLead(lead, { hrFirstUse: now }, user, now);
      return say('បានកត់ថា HR សាកប្រើរួច · ' + lead.id);
    }
    if (action === '/extend') {
      const days = positiveInteger(args[0], 1, 90);
      if (lead.stage !== 'trial' || !days) return say('ប្រើ /extend ' + lead.id + ' DAYS លើ Trial។');
      const trialEnd = Math.max(now, lead.trialEnd) + days * DAY;
      if (lead.staffdayRequestId) {
        if (!config.trialApi) return say('សូមភ្ជាប់ប្រព័ន្ធ StaffDay មុនពន្យារ Trial។');
        saveLead(lead, {pendingTrialEnd:trialEnd, extensionBy:user}, user, now);
        store.queue('staffday', 'staffday:extend:' + lead.id + ':' + trialEnd,
          {leadId:lead.id, staffdayRequestId:lead.staffdayRequestId, trialEnd}, now);
        return say('បានដាក់សំណើពន្យារ Trial ក្នុងជួរ · ' + lead.id);
      }
      const updated = saveLead(lead, { trialEnd }, user, now);
      scheduleTrial(updated);
      replyToBuyer('extended:' + lead.id + ':' + trialEnd,
        'Trial StaffDay ត្រូវបានពន្យារដល់ ' + formattedDate(trialEnd) + ' · ' + lead.company);
      return say('បានកត់ការពន្យារ · ' + formattedDate(trialEnd));
    }
    if (action === '/pause') {
      if (lead.stage === 'paused') return say(lead.id + ' បានកត់ Paused រួច។');
      if (!staffdayButtons(lead)) return say('សំណើនេះមិនមានសិទ្ធិកំពុងបើក។');
      saveLead(lead, { stage: 'paused' }, user, now);
      replyToBuyer('paused:' + lead.id + ':' + now,
        'StaffDay ត្រូវបានកត់ថាផ្អាក · ' + lead.company + '\nចុច /my ដើម្បីស្នើបន្ត ឬ /support ដើម្បីសុំជំនួយ។');
      return say('បានកត់ Paused · ' + lead.id);
    }
    if (action === '/close') {
      if ((!owner && lead.assigned && lead.assigned !== user) || staffdayButtons(lead)) {
        return say('ត្រូវដោះស្រាយសិទ្ធិដែលកំពុងបើក និងឱ្យអ្នកទទួលសំណើ ឬ Owner កត់បិទ។');
      }
      if (store.all('orders').some(row => row.leadId === lead.id &&
          ['pending', 'paid', 'payment_review', 'refund_pending'].includes(row.status))) {
        return say('ត្រូវដោះស្រាយ Invoice ឬការទូទាត់ដែលកំពុងដំណើរការមុនបិទសំណើ។');
      }
      if (lead.stage !== 'closed') saveLead(lead, { stage: 'closed' }, user, now);
      return say('បានបិទ ' + lead.id);
    }
    if (!lead.companyCode || lead.stage === 'closed') return say('ត្រូវមាន Company Code ដែលកំពុងតាមដាន។');
    if (action === '/invoice') {
      if (!config.stars) return say('មុខងារ Telegram Stars មិនទាន់បើក។');
      const current = store.all('orders').find(row => row.leadId === lead.id &&
        ['pending', 'paid', 'payment_review', 'refund_pending'].includes(row.status));
      if (current) return say('មានការបញ្ជាទិញដែលកំពុងដំណើរការ ' + current.id + '។ ពិនិត្យ /failed ប្រសិនបើផ្ញើមិនបាន។');
      const order = store.save('orders', { id: store.serial('orders', 'ORD'), leadId: lead.id,
        companyCode: lead.companyCode, buyer: lead.buyer, amount: config.starsAmount,
        status: 'pending', created: now, updated: now, payload: randomUUID() }, now);
      queueTelegram('invoice:' + order.id, 'sendInvoice', {
        chat_id: order.buyer, title: 'StaffDay · 1 month',
        description: 'ការប្រើ StaffDay ១ ខែ · ' + order.companyCode,
        payload: order.payload, currency: 'XTR', provider_token: '', start_parameter: 'staffday',
        prices: [{ label: 'StaffDay · 1 month', amount: order.amount }],
      }, now, undefined, order.id);
      return say('បានដាក់ Invoice ' + order.id + ' ក្នុងជួរផ្ញើ។');
    }
    if (action === '/active') {
      const paidUntil = localDateEnd(args[0]);
      if (!paidUntil || paidUntil <= now) return say('ប្រើ /active ' + lead.id + ' YYYY-MM-DD ជាថ្ងៃប្រើដល់នៅកម្ពុជា។');
      if (lead.stage === 'active' && lead.paidUntil === paidUntil) return say('បានកត់ Active រួច · ' + lead.id);
      if (lead.stage === 'active' && lead.paidUntil > paidUntil) return say('ថ្ងៃថ្មីត្រូវនៅក្រោយថ្ងៃដែលបានកត់មុន។');
      const order = store.all('orders').find(row => row.leadId === lead.id && row.status === 'paid');
      if (config.stars && !order) return say('រកមិនឃើញការទូទាត់ Stars សម្រាប់អ្នកទទួលសិទ្ធិនេះ។');
      const updated = saveLead(lead, { stage: 'active', paidUntil, firstActive: lead.firstActive || now }, user, now);
      if (order) store.save('orders', { ...order, status: 'delivered', updated: now }, now);
      for (const task of store.all('tasks').filter(row => row.leadId === lead.id &&
        row.kind === 'renewal' && row.status === 'open')) {
        store.save('tasks', { ...task, status: 'resolved', assigned: task.assigned || user, updated: now }, now);
      }
      replyToBuyer('active:' + lead.id + ':' + paidUntil, 'StaffDay Active · ' + updated.company +
        '\nប្រើដល់: ' + formattedDate(paidUntil) + '\n' + config.staffdayUrl);
      dueMessage('paid-expire:' + lead.id + ':' + paidUntil, config.salesChat,
        'ដល់ថ្ងៃបន្ត StaffDay · ' + label(updated), paidUntil, { id: lead.id, stage: 'active', paidUntil });
      return say('បានកត់ Active · ' + label(updated));
    }
  }

  function successfulPayment(user, payment, now) {
    const orders = store.all('orders');
    const previouslyRecorded = orders.find(row => row.charge === payment.telegram_payment_charge_id);
    if (previouslyRecorded) return;
    const order = orders.find(row => row.payload === payment.invoice_payload);
    const matches = order && order.buyer === user && payment.currency === 'XTR' &&
      order.amount === payment.total_amount && payment.telegram_payment_charge_id;
    if (matches && order.status === 'void') {
      store.save('orders', { ...order, status: 'payment_review', charge: payment.telegram_payment_charge_id,
        updated: now }, now);
      dueMessage('late-payment:' + order.id, config.salesChat,
        'Invoice បានបិទ ប៉ុន្តែទទួលបានការទូទាត់ · ' + order.id + '\nពិនិត្យ និងប្រើ /refund ' + order.id, now);
      return;
    }
    if (!matches || order.status !== 'pending') {
      const lead = order ? store.get('leads', order.leadId) : undefined;
      const task = openTask('payment_reconciliation', lead,
        'Unexpected payment. Charge: ' + (payment.telegram_payment_charge_id || 'unknown') +
        ' · XTR: ' + payment.total_amount, now, order?.id);
      dueMessage('task:' + task.id, config.salesChat, 'ពិនិត្យការទូទាត់មិនត្រូវគ្នា · ' + task.id, now);
      return;
    }
    store.save('orders', { ...order, status: 'paid', charge: payment.telegram_payment_charge_id, updated: now }, now);
    const lead = store.get('leads', order.leadId);
    dueMessage('paid-sales:' + order.id, config.salesChat,
      'បានបង់ប្រាក់ · ' + order.id + ' · ' + label(lead) + '\nOwner បើកសិទ្ធិក្នុង StaffDay រួចប្រើ /active ' + lead.id + ' YYYY-MM-DD', now);
    dueMessage('paid-user:' + order.id, user,
      'បានទទួលការទូទាត់ ' + order.id + '។ Owner នឹងផ្ទៀងផ្ទាត់ការបើកសិទ្ធិ។ ចុច /paysupport សម្រាប់ជំនួយ។', now);
  }

  return {
    recordLuyvioTrial(lead, result) {
      const now = clock();
      const updated = saveLead(lead, {
        stage: 'trial', companyCode: result.companyCode, workspaceId: result.workspaceId,
        trialStart: result.trialStart, trialEnd: result.trialEnd,
      }, lead.approvedBy, now);
      for (const buyer of new Set([updated.buyer, updated.adminId])) {
        const english = languageFor(buyer) === 'en';
        queueTelegram('lu-open:' + lead.id + ':' + buyer, 'sendMessage', {
          chat_id: buyer,
          text: 'Luyvio · ' + lead.company + '\n' +
            (english ? 'Trial expires ' : 'Trial ផុតកំណត់ ') + formattedDate(updated.trialEnd),
          reply_markup: { inline_keyboard: [[link(english ? 'Open Luyvio' : 'បើក Luyvio', config.luyvioUrl)]] },
        }, now);
      }
      dueMessage('lu-ready:' + lead.id, config.salesChat,
        'Luyvio រួចរាល់ · ' + label(updated) + '\nAdmin ID: ' + lead.adminId +
        '\nTrial ផុតកំណត់ ' + formattedDate(updated.trialEnd), now);
    },
    catalogAction({ profile, action, language, requestId }) {
      const user = String(profile.id);
      if (action === 'session') return { language: languageFor(user) };
      if (action === 'language') {
        store.setLanguage(user, language);
        return { language };
      }
      const jobPrefix = 'catalog:' + user + ':' + action + ':' + requestId;
      const data = action === 'contact' ? 'ask:general' : action === 'mine' ? 'mine' : 'product:' + action;
      store.transaction(() => {
        if (store.hasJob(jobPrefix + ':0')) return;
        const now = clock();
        processCustomer({ user, profile, input: '', data, say: makeSay(user, jobPrefix, now), now });
      });
      return { ok: true };
    },
    precheckout(query) {
      const now = clock();
      const user = String(query.from.id);
      const order = store.all('orders').find(row => row.payload === query.invoice_payload);
      const lead = order && store.get('leads', order.leadId);
      const dataMatches = config.stars && lead && lead.stage !== 'closed' && order.status === 'pending' &&
        order.buyer === user && query.currency === 'XTR' && query.total_amount === order.amount;
      const reserved = dataMatches && order.precheckId && order.precheckId !== query.id &&
        now - order.precheckedAt < 10 * 60_000;
      const ok = Boolean(dataMatches && !reserved);
      if (ok && order.precheckId !== query.id) {
        store.save('orders', { ...order, precheckId: query.id, precheckedAt: now, updated: now }, now);
      }
      const answer = { pre_checkout_query_id: query.id, ok };
      if (!ok) answer.error_message = 'ការបញ្ជាទិញនេះមិនអាចទូទាត់បាន។ សូមទាក់ទង /paysupport។';
      return answer;
    },
    handle(update) {
      const event = update.callback_query || update.message;
      const chat = event?.chat || event?.message?.chat;
      if (!chat || !event.from?.id) return;
      const user = String(event.from.id);
      const chatId = String(chat.id);
      const data = update.callback_query?.data;
      const input = (event.text || '').trim();
      const now = clock();
      const say = makeSay(chatId, 'update:' + update.update_id, now);
      if (input === '/whoami' && privateChat(chat)) return say('Telegram User ID: ' + user);
      if (/^\/chatid(?:@\w+)?$/.test(input) && !privateChat(chat) &&
          (config.owners.has(user) || config.sellers.has(user))) return say('Telegram Chat ID: ' + chatId);
      if (event.successful_payment && privateChat(chat)) return successfulPayment(user, event.successful_payment, now);
      if (event.refunded_payment && privateChat(chat)) {
        const order = store.all('orders').find(row => row.charge === event.refunded_payment.telegram_payment_charge_id);
        if (order?.buyer === user) return this.recordRefund(order);
        return;
      }
      if (chatId === config.salesChat && !privateChat(chat)) return processSales({ user, input, data, say, now });
      if (privateChat(chat)) return processCustomer({ user, profile:event.from, input, data, say, now });
    },
    recordStaffDayTrial(lead, result) {
      const now = clock();
      const updated = saveLead(lead, {
        stage: 'trial', companyCode: result.companyCode, trialStart: result.trialStart, trialEnd: result.trialEnd,
      }, lead.approvedBy, now);
      scheduleTrial(updated);
      const text = 'StaffDay រួចរាល់ · ' + label(updated) + '\nផុតកំណត់: ' + formattedDate(updated.trialEnd);
      const reply_markup = {inline_keyboard: [[link('បើក StaffDay', config.staffdayUrl)]]};
      queueTelegram('trial-open:' + lead.id, 'sendMessage', {chat_id:lead.buyer, text, reply_markup}, now);
      if (lead.buyer !== lead.hrId) {
        queueTelegram('trial-hr-open:' + lead.id, 'sendMessage', {chat_id:lead.hrId, text, reply_markup}, now);
      }
      dueMessage('trial-ready:' + lead.id, config.salesChat,
        'បានបើក Trial និងផ្តល់សិទ្ធិ HR · ' + label(updated) + '\nផុតកំណត់: ' + formattedDate(updated.trialEnd), now);
    },
    recordStaffDayExtension(lead, result) {
      const now = clock();
      const updated = saveLead(lead, {trialEnd:result.trialEnd, pendingTrialEnd:undefined, extensionBy:undefined},
        lead.extensionBy, now);
      scheduleTrial(updated);
      const text = 'Trial StaffDay របស់ ' + lead.company + ' ត្រូវបានពន្យារដល់ ' + formattedDate(updated.trialEnd);
      dueMessage('extended:' + lead.id + ':' + updated.trialEnd, lead.buyer, text, now);
      if (lead.buyer !== lead.hrId) dueMessage('extended-hr:' + lead.id + ':' + updated.trialEnd, lead.hrId, text, now);
      dueMessage('extended-sales:' + lead.id + ':' + updated.trialEnd, config.salesChat, text, now);
    },
    recordRefund(order) {
      if (order.status === 'refunded') return;
      const now = clock();
      store.save('orders', { ...order, status: 'refunded', updated: now }, now);
      const lead = store.get('leads', order.leadId);
      const task = openTask('refund_access_review', lead, 'Review StaffDay access after refund', now, order.id);
      dueMessage('task:' + task.id, config.salesChat, 'បានសង Stars · ' + order.id +
        '\nOwner ពិនិត្យសិទ្ធិ StaffDay · ' + task.id, now);
    },
  };
}
