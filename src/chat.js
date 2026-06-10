import { db } from './db.js';
import { config } from './config.js';
import { decryptSecret } from './crypto.js';
import { streamChat } from './llm/index.js';

function buildKnowledge(botId) {
  const docs = db
    .prepare('SELECT filename, extracted_text FROM documents WHERE bot_id = ? ORDER BY id')
    .all(botId);
  if (docs.length === 0) return '';
  let out = '';
  for (const d of docs) {
    const piece = `\n\n--- DOCUMENT: ${d.filename} ---\n${d.extracted_text || ''}`;
    if (out.length + piece.length > config.maxKnowledgeChars) {
      out += piece.slice(0, config.maxKnowledgeChars - out.length);
      out += '\n\n[...] (base de connaissance tronquée par souci de taille)';
      break;
    }
    out += piece;
  }
  return out;
}

export function buildSystemPrompt(bot) {
  const contact = bot.contact_info_json ? JSON.parse(bot.contact_info_json) : {};
  const knowledge = buildKnowledge(bot.id);

  const contactLines = Object.entries(contact)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || '(non renseignées)';

  const persona = bot.system_prompt || `Tu es l'assistant ${bot.name}. Tu es professionnel, concis, utile et tu réponds en français.`;
  const scope = bot.scope_topics?.trim() || 'tous les sujets liés à l\'entreprise.';
  const refusal = bot.refusal_message?.trim() || 'Désolé, je ne suis pas en mesure de répondre à cette question.';

  return [
    persona,
    '',
    'PÉRIMÈTRE AUTORISÉ :',
    `Tu ne réponds qu'aux questions concernant : ${scope}`,
    `Si la question sort de ce périmètre, ou demande des informations non présentes dans la base de connaissance, réponds EXACTEMENT : "${refusal}"`,
    'Ne réponds jamais à des questions générales (météo, actualité, code, etc.) qui ne sont pas liées au périmètre.',
    '',
    'CONTACT DE L\'ENTREPRISE (à proposer si l\'utilisateur cherche à prendre contact) :',
    contactLines,
    '',
    bot.lead_capture_enabled
      ? 'SI l\'utilisateur exprime le besoin d\'être recontacté, demande son nom, email et brièvement sa demande. Indique-lui qu\'un formulaire va lui être proposé.'
      : '',
    '',
    'BASE DE CONNAISSANCE :',
    knowledge || '(aucun document fourni)',
  ].filter(Boolean).join('\n');
}

export function getBot(id) {
  return db.prepare('SELECT * FROM bots WHERE id = ?').get(id);
}

export async function* chatStream({ bot, conversationId, userMessage }) {
  const sys = buildSystemPrompt(bot);

  // Historique récent
  const history = db
    .prepare(`
      SELECT role, content FROM messages
      WHERE conversation_id = ? AND role IN ('user','assistant')
      ORDER BY id DESC LIMIT ?
    `)
    .all(conversationId, config.conversationWindow)
    .reverse();

  history.push({ role: 'user', content: userMessage });

  const apiKey = decryptSecret(bot.llm_api_key_encrypted);
  if (!apiKey) {
    yield 'La configuration du chatbot est incomplète (clé API manquante). Merci de contacter l\'administrateur.';
    return;
  }

  let full = '';
  try {
    for await (const delta of streamChat(bot.llm_provider || 'openai', {
      apiKey,
      model: bot.llm_model,
      system: sys,
      messages: history,
    })) {
      full += delta;
      yield delta;
    }
  } catch (e) {
    console.error('[chat] LLM error', e);
    const fallback = "Une erreur est survenue. Merci de réessayer dans un instant.";
    full = fallback;
    yield fallback;
  }
  return full;
}

export function persistMessages(conversationId, userMessage, assistantMessage) {
  const ins = db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    ins.run(conversationId, 'user', userMessage);
    ins.run(conversationId, 'assistant', assistantMessage);
    db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conversationId);
  });
  tx();
}
