import express from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { verifyAdmin, createSession, destroySession, requireAdmin } from '../auth.js';
import { encryptSecret, decryptSecret } from '../crypto.js';
import { extractContent } from '../ingest/index.js';
import { testKey } from '../llm/index.js';
import { config } from '../config.js';

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
  const { token } = createSession(admin.id);
  res.cookie('sx_session', token, {
    httpOnly: true, sameSite: 'lax',
    maxAge: 14 * 86400 * 1000,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });
  res.json({ ok: true, email: admin.email });
});

adminRouter.post('/logout', (req, res) => {
  const t = req.cookies?.sx_session;
  if (t) destroySession(t);
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
    has_api_key: !!llm_api_key_encrypted,
  };
}

adminRouter.get('/bots', (req, res) => {
  const rows = db.prepare('SELECT * FROM bots ORDER BY created_at DESC').all();
  res.json(rows.map(serializeBot));
});

adminRouter.post('/bots', (req, res) => {
  const { name, audience } = req.body || {};
  if (!name || !['public', 'internal'].includes(audience)) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  const id = nanoid(12);
  db.prepare(`
    INSERT INTO bots (id, name, audience, system_prompt, scope_topics, refusal_message,
                      welcome_message, contact_info_json, branding_json,
                      llm_provider, llm_model, lead_capture_enabled, allowed_origins, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id, name, audience,
    `Tu es l'assistant ${name}. Tu es professionnel, concis et utile. Tu réponds en français.`,
    'Les sujets liés à l\'entreprise.',
    'Désolé, je ne peux pas répondre à cette question.',
    'Bonjour ! Comment puis-je vous aider ?',
    JSON.stringify({ email: '', phone: '', address: '', hours: '', url: '' }),
    JSON.stringify(SOLUXA_BRANDING),
    'openai', 'gpt-4o-mini', audience === 'public' ? 1 : 0,
    '*'
  );
  res.json(serializeBot(db.prepare('SELECT * FROM bots WHERE id = ?').get(id)));
});

adminRouter.get('/bots/:id', (req, res) => {
  const b = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  res.json(serializeBot(b));
});

adminRouter.put('/bots/:id', (req, res) => {
  const b = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });

  const allowed = [
    'name', 'audience', 'system_prompt', 'scope_topics', 'refusal_message',
    'welcome_message', 'llm_provider', 'llm_model', 'lead_capture_enabled', 'allowed_origins',
  ];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (k in req.body) {
      fields.push(`${k} = ?`);
      values.push(typeof req.body[k] === 'boolean' ? (req.body[k] ? 1 : 0) : req.body[k]);
    }
  }
  if ('contact_info' in req.body) {
    fields.push('contact_info_json = ?');
    values.push(JSON.stringify(req.body.contact_info));
  }
  if ('branding' in req.body) {
    fields.push('branding_json = ?');
    values.push(JSON.stringify(req.body.branding));
  }
  if ('llm_api_key' in req.body && req.body.llm_api_key) {
    fields.push('llm_api_key_encrypted = ?');
    values.push(encryptSecret(req.body.llm_api_key));
  }
  fields.push("updated_at = datetime('now')");
  if (fields.length) {
    values.push(req.params.id);
    db.prepare(`UPDATE bots SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  res.json(serializeBot(db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id)));
});

adminRouter.delete('/bots/:id', (req, res) => {
  db.prepare('DELETE FROM bots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- LLM TEST ----------
adminRouter.post('/bots/:id/test-llm', async (req, res) => {
  const b = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  const apiKey = req.body?.llm_api_key || decryptSecret(b.llm_api_key_encrypted);
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

// ---------- DOCUMENTS ----------
adminRouter.get('/bots/:id/documents', (req, res) => {
  const rows = db
    .prepare('SELECT id, filename, mime, size_bytes, char_count, created_at FROM documents WHERE bot_id = ? ORDER BY id DESC')
    .all(req.params.id);
  const total = rows.reduce((s, r) => s + (r.char_count || 0), 0);
  res.json({ documents: rows, total_chars: total, limit_chars: config.maxKnowledgeChars });
});

adminRouter.post('/bots/:id/documents', upload.single('file'), async (req, res) => {
  const b = db.prepare('SELECT id FROM bots WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  try {
    const text = await extractContent({
      buffer: req.file.buffer, mime: req.file.mimetype, filename: req.file.originalname,
    });
    const r = db.prepare(`
      INSERT INTO documents (bot_id, filename, mime, size_bytes, extracted_text, char_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(b.id, req.file.originalname, req.file.mimetype, req.file.size, text, text.length);
    res.json({ id: r.lastInsertRowid, char_count: text.length, filename: req.file.originalname });
  } catch (e) {
    console.error('[admin/documents] extract error', e);
    res.status(400).json({ error: 'extract_failed', detail: e?.message });
  }
});

adminRouter.delete('/bots/:id/documents/:docId', (req, res) => {
  db.prepare('DELETE FROM documents WHERE id = ? AND bot_id = ?').run(req.params.docId, req.params.id);
  res.json({ ok: true });
});

// ---------- LEADS ----------
adminRouter.get('/bots/:id/leads', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM leads WHERE bot_id = ? ORDER BY created_at DESC')
    .all(req.params.id);
  res.json(rows);
});

adminRouter.put('/bots/:id/leads/:leadId', (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'contacted', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }
  db.prepare('UPDATE leads SET status = ? WHERE id = ? AND bot_id = ?')
    .run(status, req.params.leadId, req.params.id);
  res.json({ ok: true });
});

adminRouter.get('/bots/:id/leads.csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM leads WHERE bot_id = ? ORDER BY created_at DESC').all(req.params.id);
  const header = 'id,created_at,status,name,email,phone,message\n';
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const body = rows.map((r) =>
    [r.id, r.created_at, r.status, r.name, r.email, r.phone, r.message].map(esc).join(',')
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${req.params.id}.csv"`);
  res.send(header + body);
});

// ---------- CONVERSATIONS ----------
adminRouter.get('/bots/:id/conversations', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.visitor_id, c.started_at, c.last_message_at,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS msg_count
    FROM conversations c
    WHERE c.bot_id = ?
    ORDER BY COALESCE(c.last_message_at, c.started_at) DESC
    LIMIT 100
  `).all(req.params.id);
  res.json(rows);
});

// ---------- ADMIN CHAT TEST (sans persistance) ----------
adminRouter.post('/bots/:id/test-chat', async (req, res) => {
  const b = db.prepare('SELECT * FROM bots WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message_required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    for await (const chunk of chatStream({ bot: b, conversationId: 'test-' + nanoid(8), userMessage: message })) {
      res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
    }
  } catch (e) {
    console.error('[admin/test-chat] error', e);
    res.write(`data: ${JSON.stringify({ delta: 'Erreur serveur.' })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
  res.end();
});

adminRouter.get('/bots/:id/conversations/:convId/messages', (req, res) => {
  const rows = db.prepare(`
    SELECT m.role, m.content, m.created_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.bot_id = ? AND c.id = ? AND m.role IN ('user','assistant')
    ORDER BY m.id
  `).all(req.params.id, req.params.convId);
  res.json(rows);
});
