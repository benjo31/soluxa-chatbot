import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const config = {
  root,
  port: parseInt(process.env.PORT || '3001', 10),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`,
  // Supabase
  supabaseUrl: required('SUPABASE_URL'),
  supabaseKey: required('SUPABASE_SERVICE_KEY'),

  // Local data dir (for uploads only now)
  databasePath: path.resolve(root, process.env.DATABASE_PATH || './data/soluxa.db'),
  uploadsPath: path.resolve(root, process.env.UPLOADS_PATH || './data/uploads'),
  masterKey: process.env.MASTER_KEY || null,
  sessionSecret: process.env.SESSION_SECRET || null,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@soluxa.ch',
  adminPassword: process.env.ADMIN_PASSWORD || 'changeme',
  enableOcr: process.env.ENABLE_OCR === '1',
  maxKnowledgeChars: 80000,
  conversationWindow: 12,

  // LLM — variable d'environnement (Render) plutôt que stockée par bot
  llmApiKey: process.env.LLM_API_KEY || null,

  // Resend — notification email des leads
  resendApiKey: process.env.RESEND_API_KEY || null,

  // LiveAvatar — API key par défaut (fallback)
  liveavatarApiKey: process.env.LIVEAVATAR_API_KEY || null,
  liveavatarAvatarId: process.env.LIVEAVATAR_AVATAR_ID || null,
};
