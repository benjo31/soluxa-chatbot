import express from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { sb } from '../db.js';
import { verifyAdmin, createSession, destroySession, requireAdmin } from '../auth.js';
import { decryptSecret, encryptSecret } from '../crypto.js';
import { extractContent } from '../ingest/index.js';
import { testKey } from '../llm/index.js';
import { config } from '../config.js';
import { chatStream } from '../chat.js';
import { createSessionToken, listAvatars, listPublicAvatars, listVoices, testApiKey, getHeyGenConfig, setHeyGenConfig } from '../heygen.js';

export const adminRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const SOLUXA_BRANDING = {
  titleColor: '#62a70f',
  textColor: '#002d5d',
  bgColor: '#FFFFFF',
  accentColor: '#62a70f',
  font: "'Source Sans Pro', sans-serif",
  logoUrl: 'https://cdn.shopify.com/s/files/1/0609/6397/9463/files/logo-soluxa.svg?v=1778675983',
};

// ---------- AUTH ----------
adminRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const admin = await verifyAdmin(email, password);
  if (!admin) return res.status(401).json({ error: 'invalid_credentials' });
  const session = await createSession(admin.id);
  res.cookie('sx_session', session.token, {
    httpOnly: true, sameSite: 'lax',
    maxAge: 14 * 86400 * 1000,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });
  res.json({ ok: true, email: admin.email });
});

adminRouter.post('/logout', async (req, res) => {
  const t = req.cookies?.sx_session;
  if (t) await destroySession(t);
  res.clearCookie('sx_session');
  res.json({ ok: true });
});

adminRouter.get('/me', requireAdmin, (req, res) => {
  res.json({ email: req.admin.email });
});

// ---------- BOTS ----------
adminRouter.use(requireAdmin);

function serializeBot(b) {
  if (!b) return null;
  const { llm_api_key_encrypted, ...rest } = b;
  return {
    ...rest,
    branding_json: b.branding_json ? JSON.parse(b.branding_json) : SOLUXA_BRANDING,
    contact_info_json: b.contact_info_json ? JSON.parse(b.contact_info_json) : {},
  };
}

adminRouter.get('/bots', async (req, res) => {
  const { data, error } = await sb.from('bots').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(serializeBot));
});

adminRouter.post('/bots', async (req, res) => {
  const { name, audience } = req.body || {};
  if (!name || !['public', 'internal'].includes(audience)) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  const id = nanoid(12);
  const { data, error } = await sb.from('bots').insert({
    id, name, audience,
    system_prompt: `Tu es l'assistant ${name}. Tu es professionnel, concis et utile. Tu réponds en français.`,
    scope_topics: 'Les sujets liés à l\'entreprise.',
    refusal_message: 'Désolé, je ne peux pas répondre à cette question.',
    welcome_message: 'Bonjour ! Comment puis-je vous aider ?',
    contact_info_json: JSON.stringify({ email: '', phone: '', address: '', hours: '', url: '' }),
    branding_json: JSON.stringify(SOLUXA_BRANDING),
    llm_provider: 'openai',
    llm_model: 'gpt-4o-mini',
    lead_capture_enabled: audience === 'public' ? 1 : 0,
    allowed_origins: '*',
    updated_at: new Date().toISOString(),
  }).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(serializeBot(data));
});

adminRouter.get('/bots/:id', async (req, res) => {
  const { data, error } = await sb.from('bots').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json(serializeBot(data));
});

adminRouter.put('/bots/:id', async (req, res) => {
  try {
    const { data: existing, error: findErr } = await sb.from('bots').select('id, llm_api_key_encrypted').eq('id', req.params.id).maybeSingle();
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const allowed = [
      'name', 'audience', 'system_prompt', 'scope_topics', 'refusal_message',
      'welcome_message', 'llm_provider', 'llm_model', 'lead_capture_enabled', 'allowed_origins',
    ];
    const updates = {};
    for (const k of allowed) {
      if (k in req.body) {
        updates[k] = typeof req.body[k] === 'boolean' ? (req.body[k] ? 1 : 0) : req.body[k];
      }
    }
    if ('contact_info' in req.body) {
      updates.contact_info_json = JSON.stringify(req.body.contact_info);
    }
    if ('branding' in req.body) {
      updates.branding_json = JSON.stringify(req.body.branding);
    }
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length > 1) { // more than just updated_at
      const { error: updErr } = await sb.from('bots').update(updates).eq('id', req.params.id);
      if (updErr) return res.status(500).json({ error: updErr.message });
    }
    const { data: updated } = await sb.from('bots').select('*').eq('id', req.params.id).maybeSingle();
    res.json(serializeBot(updated));
  } catch (e) {
    console.error('[admin] PUT /bots/:id unhandled error:', e);
    res.status(500).json({ error: 'internal_error', detail: e?.message || e });
  }
});

adminRouter.delete('/bots/:id', async (req, res) => {
  const { error } = await sb.from('bots').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ---------- LLM TEST ----------
adminRouter.post('/bots/:id/test-llm', async (req, res) => {
  const { data: b, error } = await sb.from('bots').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!b) return res.status(404).json({ error: 'not_found' });
  const apiKey = req.body?.llm_api_key || config.llmApiKey || decryptSecret(b.llm_api_key_encrypted);
  if (!apiKey) return res.status(400).json({ error: 'no_api_key' });
  const provider = req.body?.llm_provider || b.llm_provider || 'openai';
  const model = req.body?.llm_model || b.llm_model;
  try {
    const ok = await testKey(provider, { apiKey, model });
    res.json({ ok });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || 'failed' });
  }
});

// ---------- HEYGEN AVATAR ----------
adminRouter.post('/bots/:id/heygen/key', async (req, res) => {
  const { data: b, error: findErr } = await sb.from('bots').select('id, branding_json').eq('id', req.params.id).maybeSingle();
  if (findErr || !b) return res.status(404).json({ error: 'not_found' });
  
  const { apiKey } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: 'api_key_required' });

  // Store encrypted API key in branding_json
  const branding = b.branding_json ? JSON.parse(b.branding_json) : {};
  branding.heygen = branding.heygen || {};
  branding.heygen.apiKeyEncrypted = encryptSecret(apiKey);
  
  const { error } = await sb.from('bots').update({ branding_json: JSON.stringify(branding), updated_at: new Date().toISOString() }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  
  res.json({ ok: true });
});

adminRouter.post('/bots/:id/heygen/avatars', async (req, res) => {
  const { data: b, error: findErr } = await sb.from('bots').select('id, branding_json').eq('id', req.params.id).maybeSingle();
  if (findErr || !b) return res.status(404).json({ error: 'not_found' });
  
  // Use provided key or try stored key
  let apiKey = req.body?.apiKey;
  if (!apiKey) {
    const branding = b.branding_json ? JSON.parse(b.branding_json) : {};
    const encrypted = branding.heygen?.apiKeyEncrypted;
    if (encrypted) apiKey = decryptSecret(encrypted);
  }
  if (!apiKey) return res.status(400).json({ error: 'api_key_required' });
  
  try {
    // Use public avatars from LiveAvatar (the most common case)
    const publicAvatars = await listPublicAvatars(apiKey);
    // Also try user avatars
    let userAvatars = [];
    try {
      userAvatars = await listAvatars(apiKey);
    } catch (_) { /* no user avatars, that's fine */ }
    
    // Return flat array, merging both, with user avatars first
    const merged = [
      ...userAvatars.map(a => ({ ...a, isUserAvatar: true })),
      ...publicAvatars.map(a => ({ ...a, isUserAvatar: false })),
    ];
    res.json(merged);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.post('/bots/:id/heygen/voices', async (req, res) => {
  const { data: b, error: findErr } = await sb.from('bots').select('id, branding_json').eq('id', req.params.id).maybeSingle();
  if (findErr || !b) return res.status(404).json({ error: 'not_found' });
  
  let apiKey = req.body?.apiKey;
  if (!apiKey) {
    const branding = b.branding_json ? JSON.parse(b.branding_json) : {};
    const encrypted = branding.heygen?.apiKeyEncrypted;
    if (encrypted) apiKey = decryptSecret(encrypted);
  }
  if (!apiKey) return res.status(400).json({ error: 'api_key_required' });
  
  try {
    const voices = await listVoices(apiKey);
    res.json(voices);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- DOCUMENTS ----------
adminRouter.get('/bots/:id/documents', async (req, res) => {
  const { data: rows, error } = await sb
    .from('documents')
    .select('id, filename, mime, size_bytes, char_count, created_at')
    .eq('bot_id', req.params.id)
    .order('id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const total = (rows || []).reduce((s, r) => s + (r.char_count || 0), 0);
  res.json({ documents: rows || [], total_chars: total, limit_chars: config.maxKnowledgeChars });
});

adminRouter.post('/bots/:id/documents', upload.single('file'), async (req, res) => {
  const { data: b, error: findErr } = await sb.from('bots').select('id').eq('id', req.params.id).maybeSingle();
  if (findErr || !b) return res.status(404).json({ error: 'not_found' });
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  try {
    const text = await extractContent({
      buffer: req.file.buffer, mime: req.file.mimetype, filename: req.file.originalname,
    });
    const { data, error } = await sb.from('documents').insert({
      bot_id: b.id,
      filename: req.file.originalname,
      mime: req.file.mimetype,
      size_bytes: req.file.size,
      extracted_text: text,
      char_count: text.length,
    }).select().maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data.id, char_count: text.length, filename: req.file.originalname });
  } catch (e) {
    console.error('[admin/documents] extract error', e);
    res.status(400).json({ error: 'extract_failed', detail: e?.message });
  }
});

adminRouter.delete('/bots/:id/documents/:docId', async (req, res) => {
  const { error } = await sb.from('documents').delete().eq('id', req.params.docId).eq('bot_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ---------- LEADS ----------
adminRouter.get('/bots/:id/leads', async (req, res) => {
  const { data, error } = await sb
    .from('leads')
    .select('*')
    .eq('bot_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

adminRouter.post('/bots/:id/leads', async (req, res) => {
  const { data: b, error: findErr } = await sb.from('bots').select('id').eq('id', req.params.id).maybeSingle();
  if (findErr || !b) return res.status(404).json({ error: 'not_found' });
  const { conversationId, name, email, phone, message } = req.body || {};
  if (!email && !phone) return res.status(400).json({ error: 'email_or_phone_required' });
  const { data, error } = await sb.from('leads').insert({
    bot_id: b.id,
    conversation_id: conversationId || null,
    name: name || null,
    email: email || null,
    phone: phone || null,
    message: message || null,
  }).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, id: data.id });
});

adminRouter.put('/bots/:id/leads/:leadId', async (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'contacted', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }
  const { error } = await sb.from('leads').update({ status }).eq('id', req.params.leadId).eq('bot_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

adminRouter.get('/bots/:id/leads.csv', async (req, res) => {
  const { data: rows, error } = await sb
    .from('leads')
    .select('*')
    .eq('bot_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const header = 'id,created_at,status,name,email,phone,message\n';
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const body = (rows || []).map((r) =>
    [r.id, r.created_at, r.status, r.name, r.email, r.phone, r.message].map(esc).join(',')
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${req.params.id}.csv"`);
  res.send(header + body);
});

// ---------- CONVERSATIONS ----------
adminRouter.get('/bots/:id/conversations', async (req, res) => {
  const { data: convs, error } = await sb
    .from('conversations')
    .select('id, visitor_id, started_at, last_message_at')
    .eq('bot_id', req.params.id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });

  // Get message counts for each conversation
  const rows = [];
  for (const c of convs || []) {
    const { count } = await sb
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', c.id);
    rows.push({ ...c, msg_count: count });
  }
  res.json(rows);
});

// ---------- ADMIN CHAT TEST (avec persistance) ----------
adminRouter.post('/bots/:id/test-chat', async (req, res) => {
  const { data: b, error } = await sb.from('bots').select('*').eq('id', req.params.id).maybeSingle();
  if (error || !b) return res.status(404).json({ error: 'not_found' });
  const { message, conversationId: existingId } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message_required' });

  const conversationId = existingId || ('test-' + nanoid(8));
  if (!existingId) {
    await sb.from('conversations').upsert({
      id: conversationId, bot_id: b.id, visitor_id: 'admin-test',
    }, { onConflict: 'id', ignoreDuplicates: true });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let full = '';

  try {
    for await (const chunk of chatStream({ bot: b, conversationId, userMessage: message })) {
      full += chunk;
      res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
    }
  } catch (e) {
    console.error('[admin/test-chat] exception:', e?.stack || e?.message || e);
    const errMsg = 'Erreur : ' + (e?.message || 'erreur inconnue, vérifie les logs serveur');
    res.write(`data: ${JSON.stringify({ delta: errMsg })}\n\n`);
  }

  if (full) {
    const { persistMessages } = await import('../chat.js');
    persistMessages(conversationId, message, full);
  }

  res.write(`data: ${JSON.stringify({ event: 'done', conversationId })}\n\n`);
  res.end();
});

adminRouter.get('/bots/:id/conversations/:convId/messages', async (req, res) => {
  const { data: rows, error } = await sb
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', req.params.convId)
    .in('role', ['user', 'assistant'])
    .order('id', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(rows || []);
});
