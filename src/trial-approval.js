import { randomBytes } from 'node:crypto';
import { DAY, positiveInteger } from './config.js';

const waitingStages = ['new', 'review', 'ready'];

export function canChooseTrialHr(lead) {
  return lead?.product === 'staffday' && waitingStages.includes(lead.stage) && !lead.trialHrConfirmed;
}

export function hrChoiceButtons(leadId) {
  return [[{text: 'ខ្ញុំជា HR', callback_data: 'hr-self:' + leadId},
    {text: 'HR ជាមនុស្សផ្សេង', callback_data: 'hr-other:' + leadId}]];
}

export function preparingTrial(lead) {
  return lead.stage === 'ready' && Boolean(lead.staffdayRequestId);
}

function telegramName(profile) {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return name.slice(0, 100).replace(/[\uD800-\uDBFF]$/, '').trim() || 'HR Admin';
}

export function handleTrialHr({ store, config, saveLead, queueTelegram, user, profile, data, input, say, now }) {
  const inviteMatch = /^\/start\s+hr_([A-Za-z0-9_-]{32})$/.exec(input);
  const choice = /^(hr-self|hr-other):(SD-\d+)$/.exec(data || '');
  if (!inviteMatch && !choice) return false;
  if (!config.trialApi) {
    say('សូមទាក់ទងក្រុមលក់ ដើម្បីបំពេញព័ត៌មាន HR។');
    return true;
  }
  const token = inviteMatch?.[1];
  const invite = token && store.get('trial_invites', token);
  const lead = (invite?.leadId || choice?.[2]) && store.get('leads', invite?.leadId || choice[2]);
  const allowed = canChooseTrialHr(lead) && (choice ? lead.buyer === user :
    lead.hrInvite === token && invite.expires > now && lead.buyer !== user);
  if (!allowed) {
    say(choice ? 'សំណើនេះបានផ្លាស់ប្ដូរ។ សូមមើលសំណើតាម /my។' :
      'តំណ HR នេះផុតកំណត់ បានប្រើរួច ឬស្ថិតនៅក្នុងគណនីអ្នកស្នើ។ សូមទាក់ទងអ្នកស្នើ។');
    return true;
  }
  if (lead.hrInvite) store.forget('trial_invites', lead.hrInvite);
  if (choice?.[1] === 'hr-other') {
    const newToken = randomBytes(24).toString('base64url');
    store.setTrialInvite(newToken, {leadId:lead.id, expires:now + DAY}, now);
    saveLead(lead, {hrInvite:newToken}, user, now);
    const url = new URL('https://t.me/' + config.botUsername);
    url.searchParams.set('start', 'hr_' + newToken);
    say('សូមផ្ញើតំណនេះឱ្យ HR របស់ ' + lead.company +
      '។ ឱ្យគាត់បើកតំណ ហើយចុច Start ក្នុងរយៈពេល ២៤ ម៉ោង។\n' + url.href);
    return true;
  }
  const hrId = String(positiveInteger(user, 1, Number.MAX_SAFE_INTEGER) || '');
  if (!hrId) throw new Error('Invalid Telegram identity for the StaffDay trial');
  const hrName = telegramName(profile);
  const hrUsername = /^[\w]{5,32}$/.test(profile.username || '') ? ' (@' + profile.username + ')' : '';
  saveLead(lead, {stage:'ready', hrId, hrName, trialHrConfirmed:true, hrInvite:undefined}, user, now);
  queueTelegram('approve-trial:' + lead.id, 'sendMessage', {
    chat_id: config.salesChat,
    text: 'សំណើ StaffDay រង់ចាំអនុម័ត\n' + lead.id + ' · ' + lead.company +
      '\nបុគ្គលិក: ' + lead.count + '\nHR: ' + hrName + hrUsername + '\nTelegram ID: ' + hrId,
    reply_markup: {inline_keyboard: [[{text:'អនុម័ត Trial', callback_data:'approve-trial:' + lead.id}]]},
  }, now);
  say('បានកត់ Telegram ID សម្រាប់ HR របស់ ' + lead.company + '។ សំណើ ' + lead.id + ' រង់ចាំអនុម័ត។');
  if (lead.buyer !== user) {
    queueTelegram('hr-confirmed:' + lead.id, 'sendMessage', {
      chat_id: lead.buyer, text: 'HR បានបញ្ជាក់គណនីសម្រាប់ ' + lead.id + '។ សំណើកំពុងរង់ចាំអនុម័ត។',
    }, now);
  }
  return true;
}
