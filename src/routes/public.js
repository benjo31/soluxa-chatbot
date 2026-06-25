import express from 'express';
import { nanoid } from 'nanoid';
import { sb } from '../db.js';
import { getBot, chatStream, persistMessages } from '../chat.js';
import { detectLeadIntent, createLead } from '../leads.js';

export const publicRouter = express.Router();

// CORS dynamique selon allowed_origins du bot
function applyCors(req, res, bot) {
  const origin = req.headers.origin;
  const allowed = (bot.allowed_origins || '').split(',').map((s) => s.trim()).filter(Boolean);
  const allowAll = allowed.includes('*') || allowed.length === 0;
  if (origin && (allowAll || allowed.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
}

publicRouter.options('/bots/:id/*', async (req, res) => {
  const bot = await getBot(req.params.id);
  if (bot) applyCors(req, res, bot);
  res.sendStatus(204);
});

// Config publique
publicRouter.get('/bots/:id/config', async (req, res) => {
  const bot = await getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  applyCors(req, res, bot);
  res.json({
    id: bot.id,
    name: bot.name,
    welcome: bot.welcome_message || '',
    branding: bot.branding_json ? JSON.parse(bot.branding_json) : null,
    contact: bot.contact_info_json ? JSON.parse(bot.contact_info_json) : null,
    leadCaptureEnabled: !!bot.lead_capture_enabled,
  });
});

// Crée une conversation
publicRouter.post('/bots/:id/conversation', async (req, res) => {
  const bot = await getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  applyCors(req, res, bot);
  const id = nanoid(16);
  const visitorId = req.body?.visitorId || nanoid(20);
  const { error } = await sb.from('conversations').insert({ id, bot_id: bot.id, visitor_id: visitorId });
  if (error) {
    console.error('[public/conversation] error', error);
    return res.status(500).json({ error: 'failed' });
  }
  res.json({ conversationId: id, visitorId });
});

// Chat SSE
publicRouter.post('/bots/:id/chat', async (req, res) => {
  const bot = await getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  applyCors(req, res, bot);

  const { conversationId, message } = req.body || {};
  if (!conversationId || !message) return res.status(400).json({ error: 'missing_fields' });

  const { data: conv, error: convErr } = await sb
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('bot_id', bot.id)
    .maybeSingle();
  if (convErr || !conv) return res.status(404).json({ error: 'conversation_not_found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let full = '';
  try {
    for await (const chunk of chatStream({ bot, conversationId, userMessage: message })) {
      full += chunk;
      res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
    }
  } catch (e) {
    console.error('[public/chat] error', e);
    res.write(`data: ${JSON.stringify({ delta: 'Erreur serveur.' })}\n\n`);
  }

  await persistMessages(conversationId, message, full);

  // Détection lead
  if (bot.lead_capture_enabled) {
    const intent = detectLeadIntent(message, full);
    if (intent.suggestForm) {
      res.write(`data: ${JSON.stringify({ event: 'suggest_lead', email: intent.email, phone: intent.phone })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
  res.end();
});

// Récupération des messages d'une conversation
publicRouter.get('/bots/:id/conversations/:convId/messages', async (req, res) => {
  const bot = await getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  applyCors(req, res, bot);

  const { convId } = req.params;

  // Vérifier que la conversation appartient bien à ce bot
  const { data: conv, error: convErr } = await sb
    .from('conversations')
    .select('id')
    .eq('id', convId)
    .eq('bot_id', bot.id)
    .maybeSingle();
  if (convErr || !conv) return res.status(404).json({ error: 'conversation_not_found' });

  const { data: messages, error: msgErr } = await sb
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', convId)
    .order('id', { ascending: true });

  if (msgErr) {
    console.error('[public/messages] error', msgErr);
    return res.status(500).json({ error: 'failed' });
  }

  res.json({ messages: messages || [] });
});

// Création de lead
publicRouter.post('/bots/:id/lead', async (req, res) => {
  const bot = await getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  applyCors(req, res, bot);

  const { conversationId, name, email, phone, message } = req.body || {};
  if (!email && !phone) return res.status(400).json({ error: 'email_or_phone_required' });

  const leadId = await createLead({
    botId: bot.id, conversationId,
    name, email, phone, message,
  });
  res.json({ ok: true, id: leadId });
});
