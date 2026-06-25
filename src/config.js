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
  masterKey: (() => {
    const v = required('MASTER_KEY');
    // Validate: must be 64 hex chars (32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(v)) {
      console.error('[config] MASTER_KEY is not a valid 64-char hex string.');
      console.error('[config] Generate a proper key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      process.exit(1);
    }
    return v;
  })(),
  sessionSecret: required('SESSION_SECRET'),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@soluxa.ch',
  adminPassword: process.env.ADMIN_PASSWORD || 'changeme',
  enableOcr: process.env.ENABLE_OCR === '1',
  maxKnowledgeChars: 80000,
  conversationWindow: 12,
};
