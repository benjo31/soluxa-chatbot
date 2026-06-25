import { sb } from './db.js';
import { config } from './config.js';

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

export async function createLead({ botId, conversationId, name, email, phone, message, botName }) {
  const { data, error } = await sb.from('leads').insert({
    bot_id: botId,
    conversation_id: conversationId || null,
    name: name || null,
    email: email || null,
    phone: phone || null,
    message: message || null,
  }).select().maybeSingle();
  if (error) throw error;

  // Envoyer notification email (non bloquant)
  notifyEmail({ botName, name, email, phone, message }).catch((e) => {
    console.error('[leads] notifyEmail error:', e?.message || e);
  });

  return data.id;
}

async function notifyEmail({ botName, name, email, phone, message }) {
  const apiKey = config.resendApiKey;
  if (!apiKey) return;

  // Avec onboarding@resend.dev, on ne peut envoyer qu'à benjamin.loth@hotmail.com
  const to = 'benjamin.loth@hotmail.com';
  const bot = botName || 'un chatbot';
  const contactName = name || 'Anonyme';
  const contactEmail = email || 'non renseigné';
  const contactPhone = phone || 'non renseigné';
  const msg = message || 'pas de message';

  const html = `
    <h2>Nouveau contact depuis ${bot}</h2>
    <table style="border-collapse:collapse;width:100%;max-width:500px">
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Nom</td><td style="padding:8px;border:1px solid #ddd">${contactName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #ddd">${contactEmail}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Téléphone</td><td style="padding:8px;border:1px solid #ddd">${contactPhone}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Message</td><td style="padding:8px;border:1px solid #ddd">${msg}</td></tr>
    </table>
    <p style="color:#888;font-size:12px">Envoyé automatiquement par Soluxa Chatbots</p>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Soluxa Chatbots <onboarding@resend.dev>',
      to,
      subject: `📩 Nouveau lead - ${bot}`,
      html,
    }),
  });
}
