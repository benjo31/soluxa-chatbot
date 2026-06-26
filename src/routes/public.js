import express from 'express';
import { nanoid } from 'nanoid';
import { sb } from '../db.js';
import { getBot, chatStream, persistMessages } from '../chat.js';
import { detectLeadIntent, createLead, sendNotification } from '../leads.js';
import { createSessionToken, getHeyGenConfig } from '../heygen.js';
import { decryptSecret } from '../crypto.js';

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
  const heygen = getHeyGenConfig(bot);
  res.json({
    id: bot.id,
    name: bot.name,
    welcome: bot.welcome_message || '',
    branding: bot.branding_json ? JSON.parse(bot.branding_json) : null,
    contact: bot.contact_info_json ? JSON.parse(bot.contact_info_json) : null,
    leadCaptureEnabled: !!bot.lead_capture_enabled,
    heygenEnabled: !!heygen.enabled,
    heygenAvatarPreview: heygen.avatarPreviewImage || null,
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

  // Notification pour les bots publics
  if (bot.audience === 'public') {
    sendNotification({
      botName: bot.name,
      type: 'conversation',
      details: { visitorId },
    }).catch((e) => console.error('[public] notif error:', e?.message || e));
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
    botName: bot.name,
  });
  res.json({ ok: true, id: leadId });
});

// ================ LIVEAVATAR ENDPOINTS ================

/**
 * Create a LiveAvatar streaming session token for a bot
 * POST /api/public/bots/:id/heygen/start
 * 
 * Returns a session_token that the client SDK uses to connect via WebRTC.
 */
publicRouter.post('/bots/:id/heygen/start', async (req, res) => {
  const bot = await getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  applyCors(req, res, bot);

  const heygen = getHeyGenConfig(bot);
  if (!heygen.enabled) {
    return res.status(400).json({ error: 'heygen_not_enabled' });
  }

  // Décrypter la clé API LiveAvatar
  const apiKey = heygen.apiKeyEncrypted ? decryptSecret(heygen.apiKeyEncrypted) : null;
  if (!apiKey) {
    // Fallback : clé par défaut depuis les variables d'env
    if (config.liveavatarApiKey) {
      const avatarId = heygen.avatarId || config.liveavatarAvatarId || '65f9e3c9-d48b-4118-b73a-4ae2e3cbb8f0';
      const tokenData = await createSessionToken(config.liveavatarApiKey, avatarId, heygen.mode || 'LITE');
      return res.json({ token: tokenData.session_token, sessionId: tokenData.session_id });
    }
    return res.status(400).json({ error: 'heygen_api_key_missing' });
  }

  try {
    const mode = heygen.mode || 'LITE';
    const tokenData = await createSessionToken(apiKey, heygen.avatarId, mode);
    res.json({
      token: tokenData.session_token,
      sessionId: tokenData.session_id,
    });
  } catch (e) {
    console.error('[heygen/start] error:', e);
    res.status(500).json({ error: 'heygen_start_failed', detail: e.message });
  }
});

/**
 * Chat via l'avatar (mode HeyGen)
 * POST /api/public/bots/:id/heygen/chat
 * Body: { conversationId, message }
 * 
 * This endpoint:
 * 1. Gets LLM response (synchrone, pas SSE)
 * 2. Persists messages
 * 3. Returns { reply: "..." } for the client to send to the avatar SDK
 */
publicRouter.post('/bots/:id/heygen/chat', async (req, res) => {
  const bot = await getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  applyCors(req, res, bot);

  const heygen = getHeyGenConfig(bot);
  if (!heygen.enabled) {
    return res.status(400).json({ error: 'heygen_not_enabled' });
  }

  const { conversationId, message } = req.body || {};
  if (!conversationId || !message) return res.status(400).json({ error: 'missing_fields' });

  const { data: conv, error: convErr } = await sb
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('bot_id', bot.id)
    .maybeSingle();
  if (convErr || !conv) return res.status(404).json({ error: 'conversation_not_found' });

  let full = '';
  try {
    for await (const chunk of chatStream({ bot, conversationId, userMessage: message })) {
      full += chunk;
    }
  } catch (e) {
    console.error('[heygen/chat] error', e);
    return res.status(500).json({ error: 'llm_error', reply: 'Erreur lors de la génération de la réponse.' });
  }

  await persistMessages(conversationId, message, full);

  // Détection lead (optionnel — le client texte gère déjà les leads)
  let suggestLead = null;
  if (bot.lead_capture_enabled) {
    const intent = detectLeadIntent(message, full);
    if (intent.suggestForm) {
      suggestLead = { email: intent.email, phone: intent.phone };
    }
  }

  res.json({ reply: full, suggestLead });
});

/**
 * Stop HeyGen streaming session
 * (Le client SDK gère la fermeture côté client, ceci est un endpoint de sécurité)
 */
publicRouter.post('/bots/:id/heygen/stop', async (req, res) => {
  res.json({ ok: true });
});
