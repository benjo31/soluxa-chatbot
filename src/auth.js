import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { db } from './db.js';

const SESSION_TTL_DAYS = 14;

export async function verifyAdmin(email, password) {
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin) return null;
  const ok = await bcrypt.compare(password, admin.password_hash);
  return ok ? admin : null;
}

export function createSession(adminId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)').run(token, adminId, expires);
  return { token, expiresAt: expires };
}

export function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function getAdminFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT a.id, a.email FROM sessions s
    JOIN admins a ON a.id = s.admin_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  return row || null;
}

export function requireAdmin(req, res, next) {
  const token = req.cookies?.sx_session;
  const admin = getAdminFromToken(token);
  if (!admin) return res.status(401).json({ error: 'unauthorized' });
  req.admin = admin;
  next();
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}
