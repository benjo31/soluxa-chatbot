import express from 'express';
import { nanoid } from 'nanoid';
import { sb } from '../db.js';
import { getBot, chatStream, persistMessages } from '../chat.js';
import { detectLeadIntent, createLead, sendNotification } from '../leads.js';
import { startStream, speak, stopStream, getHeyGenConfig } from '../heygen.js';
import { decryptSecret, encryptSecret } from '../crypto.js';

export const publicRouter = express.Router();

// === Streaming sessions cache (in-memory) ===
// Maps: botId -> { sessionId, apiKey, expiresAt }
const streamingSessions = new Map();

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

// ================ HEYGEN LIVE AVATAR ENDPOINTS ================

/**
 * Start a HeyGen streaming session for a bot
 * POST /api/public/bots/:id/heygen/start
 */
publicRouter.post('/bots/:id/heygen/start', async (req, res) => {
  const bot = await getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  applyCors(req, res, bot);

  const heygen = getHeyGenConfig(bot);
  if (!heygen.enabled) {
    return res.status(400).json({ error: 'heygen_not_enabled' });
  }

  // Décrypter la clé API HeyGen
  const apiKey = decryptSecret(heygen.apiKeyEncrypted);
  if (!apiKey) {
    return res.status(400).json({ error: 'heygen_api_key_missing' });
  }

  try {
    const session = await startStream(apiKey, heygen.avatarId, heygen.voiceId);
    const sessionId = session.data?.session_id;

    // Cache la session pour 30 minutes
    streamingSessions.set(bot.id, {
      sessionId,
      apiKey,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    res.json({
      sessionId,
      url: session.data?.url, // WebSocket URL for the client
      token: session.data?.token,
    });
  } catch (e) {
    console.error('[heygen/start] error:', e);
    res.status(500).json({ error: 'heygen_start_failed', detail: e.message });
  }
});

/**
 * Send a message to the avatar for it to speak
 * POST /api/public/bots/:id/heygen/talk
 * Body: { conversationId, message }
 * 
 * This endpoint:
 * 1. Gets the LLM response (same as /chat)
 * 2. Sends it to HeyGen for the avatar to speak
 * 3. Returns SSE with both text and avatar status
 */
publicRouter.post('/bots/:id/heygen/talk', async (req, res) => {
  const bot = await getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  applyCors(req, res, bot);

  const heygen = getHeyGenConfig(bot);
  if (!heygen.enabled) {
    return res.status(400).json({ error: 'heygen_not_enabled' });
  }

  const { conversationId, message } = req.body || {};
  if (!conversationId || !message) return res.status(400).json({ error: 'missing_fields' });

  // Vérifier la session HeyGen
  const session = streamingSessions.get(bot.id);
  if (!session || Date.now() > session.expiresAt) {
    return res.status(400).json({ error: 'heygen_session_expired', action: 'restart' });
  }

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
    // Step 1: Get LLM response text (streaming)
    res.write(`data: ${JSON.stringify({ event: 'llm_start' })}\n\n`);

    for await (const chunk of chatStream({ bot, conversationId, userMessage: message })) {
      full += chunk;
      res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ event: 'llm_done' })}\n\n`);

    // Step 2: Send to HeyGen avatar to speak
    if (full.trim()) {
      res.write(`data: ${JSON.stringify({ event: 'avatar_start' })}\n\n`);
      try {
        await speak(session.apiKey, session.sessionId, full);
        res.write(`data: ${JSON.stringify({ event: 'avatar_done' })}\n\n`);
      } catch (e) {
        console.error('[heygen/talk] speak error:', e);
        res.write(`data: ${JSON.stringify({ event: 'avatar_error', error: e.message })}\n\n`);
      }
    }
  } catch (e) {
    console.error('[heygen/talk] error', e);
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

/**
 * Stop HeyGen streaming session
 */
publicRouter.post('/bots/:id/heygen/stop', async (req, res) => {
  const session = streamingSessions.get(req.params.botId);
  if (session) {
    await stopStream(session.apiKey, session.sessionId).catch(() => {});
    streamingSessions.delete(req.params.botId);
  }
  res.json({ ok: true });
});
