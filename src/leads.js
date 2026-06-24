import { sb } from './db.js';

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const INTENT_RE = /(rappel|recontact|recontacter|contact|devis|rendez[-\\s]?vous|offre|prendre rendez|qu'on me rappelle|qu'on me contacte|m'appel)/i;

export function detectLeadIntent(userText, assistantText) {
  const t = `${userText}\n${assistantText}`;
  const hasIntent = INTENT_RE.test(t);
  const email = (userText.match(EMAIL_RE) || [])[0] || null;
  const phone = (userText.match(PHONE_RE) || [])[0] || null;
  return { suggestForm: hasIntent || !!email || !!phone, email, phone };
}

export async function createLead({ botId, conversationId, name, email, phone, message }) {
  const { data, error } = await sb.from('leads').insert({
    bot_id: botId,
    conversation_id: conversationId || null,
    name: name || null,
    email: email || null,
    phone: phone || null,
    message: message || null,
  }).select().maybeSingle();
  if (error) throw error;
  return data.id;
}
