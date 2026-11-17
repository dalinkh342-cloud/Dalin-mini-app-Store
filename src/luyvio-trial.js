import { randomBytes, randomUUID } from 'node:crypto';
import { DAY, formattedDate } from './config.js';

const button = (text, callback_data) => ({ text, callback_data });
const pending = lead => lead?.product === 'luyvio' && lead.stage === 'new' && !lead.adminConfirmed;
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const choices = (id, tr) => [[button(tr('ខ្ញុំជា Admin', 'I am the admin'), 'lu-self:' + id),
  button(tr('Admin ជាមនុស្សផ្សេង', 'Another admin'), 'lu-other:' + id)]];

export function showLuyvioLead(lead, { say, config, tr }) {
  const status = lead.stage === 'closed' ? tr('បានបិទសំណើ', 'Request closed') :
    lead.stage === 'trial' && lead.trialEnd <= Date.now() ? tr('Trial ផុតកំណត់', 'Trial expired') :
    lead.stage === 'trial' ? tr('Trial កំពុងដំណើរការ', 'Trial started') :
    lead.luyvioRequestId ? tr('កំពុងបើក Trial', 'Preparing trial') :
    lead.adminConfirmed ? tr('រង់ចាំអនុម័ត', 'Awaiting approval') : tr('រង់ចាំ Admin បញ្ជាក់', 'Awaiting admin confirmation');
  const rows = pending(lead) ? choices(lead.id, tr) : [];
  if (lead.companyCode) rows.push([{ text: tr('បើក Luyvio', 'Open Luyvio'), url: config.luyvioUrl }]);
  if (lead.stage !== 'closed') rows.push([
    button(tr('ស្នើបន្តប្រើ', 'Request renewal'), 'renew:' + lead.id),
    button(tr('សុំជំនួយ', 'Support'), 'help:' + lead.id),
  ]);
  return say('Luyvio · ' + lead.id + ' · ' + lead.company + '\n' + status +
    (lead.trialEnd ? '\n' + tr('Trial ផុតកំណត់ ', 'Trial expires ') + formattedDate(lead.trialEnd) : ''), rows);
}

export function handleLuyvioCustomer({ store, config, saveLead, queueTelegram, user, profile, input, data, say, now, tr }) {
  const invite = /^\/start\s+luadmin_([\w-]{32})$/.exec(input);
  const choice = /^(lu-self|lu-other):(LU-\d+)$/.exec(data || '');
  const confirm = /^lu-confirm:([\w-]+)$/.exec(data || '');
  const draft = store.get('drafts', user);
  const typingCompany = draft?.step === 'lu-company' && input && !input.startsWith('/');
  if (data !== 'lu-start' && !invite && !choice && !confirm && !typingCompany) return false;
  if (!config.luyvioTrialApi) {
    say(tr('សូមទាក់ទងក្រុមលក់ ដើម្បីស្នើ Trial Luyvio។', 'Contact sales to request a Luyvio trial.'));
    return true;
  }
  const cancel = [[button(tr('បោះបង់', 'Cancel'), 'menu')]];
  if (data === 'lu-start') {
    store.save('drafts', { id: user, step: 'lu-company', product: 'luyvio',
      source: draft?.product === 'luyvio' ? draft.source : 'direct', nonce: randomUUID().slice(0, 12) }, now);
    say(tr('សូមវាយឈ្មោះក្រុមហ៊ុនសម្រាប់ Luyvio។', 'Enter your company name for Luyvio.'), cancel);
    return true;
  }
  if (typingCompany) {
    if (input.length < 2 || input.length > 90 || /[\u0000-\u001f\u007f]/.test(input)) {
      say(tr('សូមវាយឈ្មោះក្រុមហ៊ុនមួយបន្ទាត់ ពី ២ ដល់ ៩០ តួអក្សរ។', 'Enter a company name of 2 to 90 characters on one line.'));
      return true;
    }
    store.save('drafts', { ...draft, company: input, step: 'lu-confirm' }, now);
    say('Luyvio · ' + input + '\n' + tr('សាកល្បង ', 'Trial for ') + config.trialDays + tr(' ថ្ងៃ', ' days'),
      [[button(tr('បញ្ជាក់សំណើ', 'Confirm request'), 'lu-confirm:' + draft.nonce),
        button(tr('កែព័ត៌មាន', 'Edit details'), 'lu-start')], ...cancel]);
    return true;
  }
  if (confirm) {
    if (draft?.nonce !== confirm[1] || !['lu-confirm', 'lu-confirmed'].includes(draft.step)) {
      say(tr('សំណើនេះបានផ្លាស់ប្ដូរ។ សូមចុច /start។', 'This request changed. Send /start.'));
      return true;
    }
    const duplicate = store.all('leads').find(lead => lead.product === 'luyvio' &&
      lead.buyer === user && lead.stage !== 'closed' && normalize(lead.company) === normalize(draft.company));
    const lead = duplicate || saveLead({
      id: store.serial('luyvio', 'LU'), product: 'luyvio', company: draft.company,
      buyer: user, source: draft.source, stage: 'new', created: now,
    }, {}, user, now);
    store.save('drafts', { ...draft, step: 'lu-confirmed', leadId: lead.id }, now);
    showLuyvioLead(lead, { say, config, tr });
    return true;
  }
  const token = invite?.[1];
  const invitation = token && store.get('trial_invites', token);
  const lead = store.get('leads', choice?.[2] || invitation?.leadId || '');
  const allowed = pending(lead) && (choice ? lead.buyer === user :
    invitation?.expires > now && lead.adminInvite === token && lead.buyer !== user);
  if (!allowed) {
    say(tr('តំណនេះផុតកំណត់ ឬសំណើបានផ្លាស់ប្ដូរ។ សូមទាក់ទងអ្នកស្នើ។', 'The invitation expired or the request changed. Contact the requester.'));
    return true;
  }
  if (lead.adminInvite) store.forget('trial_invites', lead.adminInvite);
  if (choice?.[1] === 'lu-other') {
    const adminInvite = randomBytes(24).toString('base64url');
    store.setTrialInvite(adminInvite, { leadId: lead.id, expires: now + DAY }, now);
    saveLead(lead, { adminInvite }, user, now);
    say(tr('ផ្ញើតំណនេះទៅ Admin របស់អ្នក ហើយឱ្យគាត់ចុច Start ក្នុងរយៈពេល ២៤ ម៉ោង។',
      'Send this link to your admin and ask them to press Start within 24 hours.') +
      '\nhttps://t.me/' + config.botUsername + '?start=luadmin_' + adminInvite);
    return true;
  }
  const adminName = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100) || 'Administrator';
  saveLead(lead, { stage: 'ready', adminId: user, adminName, adminConfirmed: true,
    adminInvite: undefined }, user, now);
  queueTelegram('lu-approval:' + lead.id, 'sendMessage', {
    chat_id: config.salesChat,
    text: 'Luyvio · ' + lead.id + ' · ' + lead.company + '\nAdmin: ' + adminName + '\nTelegram ID: ' + user,
    reply_markup: { inline_keyboard: [[button('អនុម័ត Trial Luyvio', 'approve-lu:' + lead.id)]] },
  }, now);
  say(tr('បានបញ្ជាក់ Admin រួច។ រង់ចាំអ្នកលក់អនុម័ត។', 'Admin confirmed. Awaiting seller approval.'));
  if (lead.buyer !== user) queueTelegram('lu-admin-confirmed:' + lead.id, 'sendMessage', {
    chat_id: lead.buyer, text: 'Luyvio · ' + lead.id + '\n' +
      tr('Admin បានបញ្ជាក់គណនីរួច។ រង់ចាំអនុម័ត។', 'Admin confirmed their account. Awaiting approval.'),
  }, now);
  return true;
}

export function approveLuyvio({ store, config, saveLead, user, data, say, now }) {
  const match = /^approve-lu:(LU-\d+)$/.exec(data || '');
  if (!match) return false;
  if (!config.owners.has(user)) {
    say('សកម្មភាពនេះសម្រាប់ Owner។');
    return true;
  }
  const lead = store.get('leads', match[1]);
  if (!config.luyvioTrialApi || lead?.product !== 'luyvio' || !lead.adminConfirmed) {
    say('សូមពិនិត្យការភ្ជាប់ Luyvio និងការបញ្ជាក់ Admin។');
    return true;
  }
  if (lead.luyvioRequestId || lead.stage !== 'ready') {
    say('សំណើនេះបានដំណើរការរួច ឬបានផ្លាស់ប្ដូរ។');
    return true;
  }
  const requestId = randomBytes(16).toString('hex');
  saveLead(lead, { luyvioRequestId: requestId, approvedBy: user, assigned: lead.assigned || user }, user, now);
  store.queue('luyvio', 'luyvio:trial:' + lead.id, { leadId: lead.id, requestId, trialDays: config.trialDays }, now);
  say('បានអនុម័ត ' + lead.id + '។ កំពុងបង្កើតក្រុមហ៊ុន Luyvio។');
  return true;
}
