import { sb } from './db.js';
import { config } from './config.js';
import { decryptSecret } from './crypto.js';
import { streamChat } from './llm/index.js';

async function buildKnowledge(botId) {
  const { data: docs, error } = await sb
    .from('documents')
    .select('filename, extracted_text')
    .eq('bot_id', botId)
    .order('id', { ascending: true });
  if (error) throw error;
  if (!docs || docs.length === 0) return '';
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
  // buildKnowledge is now async — will be called in chatStream
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
    '(les documents seront chargés dynamiquement)',
  ].filter(Boolean).join('\n');
}

export async function getBot(id) {
  const { data, error } = await sb.from('bots').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function* chatStream({ bot, conversationId, userMessage }) {
  const knowledge = await buildKnowledge(bot.id);
  const sys = buildSystemPrompt(bot) + '\n\n' + (knowledge ? `BASE DE CONNAISSANCE :\n${knowledge}` : '');

  // History
  const { data: rawHistory, error } = await sb
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('id', { ascending: false })
    .limit(config.conversationWindow);
  if (error) throw error;

  const history = (rawHistory || []).reverse();
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

export async function persistMessages(conversationId, userMessage, assistantMessage) {
  const { error: e1 } = await sb
    .from('messages')
    .insert({ conversation_id: conversationId, role: 'user', content: userMessage });
  if (e1) throw e1;
  
  const { error: e2 } = await sb
    .from('messages')
    .insert({ conversation_id: conversationId, role: 'assistant', content: assistantMessage });
  if (e2) throw e2;

  const { error: e3 } = await sb
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (e3) throw e3;
}
