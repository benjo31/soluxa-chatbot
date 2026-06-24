import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { sb } from './db.js';

const SESSION_TTL_DAYS = 14;

export async function verifyAdmin(email, password) {
  const { data: admin, error } = await sb
    .from('admins')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  if (!admin) return null;
  const ok = await bcrypt.compare(password, admin.password_hash);
  return ok ? admin : null;
}

export async function createSession(adminId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000).toISOString();
  const { data, error } = await sb
    .from('sessions')
    .insert({ token, admin_id: adminId, expires_at: expiresAt })
    .select()
    .maybeSingle();
  if (error) throw error;
  return { token, expiresAt };
}

export async function destroySession(token) {
  const { error } = await sb.from('sessions').delete().eq('token', token);
  if (error) throw error;
}

export async function getAdminFromToken(token) {
  if (!token) return null;
  const { data: row, error } = await sb
    .from('sessions')
    .select('admin_id, admins!inner(id, email)')
    .eq('token', token)
    .gte('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) return null;
  if (!row) return null;
  return { id: row.admin_id, email: (row.admins || {}).email };
}

export function requireAdmin(req, res, next) {
  const token = req.cookies?.sx_session;
  getAdminFromToken(token).then(admin => {
    if (!admin) return res.status(401).json({ error: 'unauthorized' });
    req.admin = admin;
    next();
  }).catch(() => res.status(401).json({ error: 'unauthorized' }));
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}
