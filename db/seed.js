import { nanoid } from 'nanoid';
import { db } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { config } from '../src/config.js';

const SOLUXA_BRANDING = {
  titleColor: '#62a70f',
  textColor: '#002d5d',
  bgColor: '#FFFFFF',
  accentColor: '#62a70f',
  font: "'Source Sans Pro', sans-serif",
  logoUrl: 'https://cdn.shopify.com/s/files/1/0609/6397/9463/files/logo-soluxa.svg?v=1778675983',
};

const SOLUXA_CONTACT = {
  email: 'info@soluxa.ch',
  phone: '',
  address: '',
  hours: '',
  url: 'https://soluxa.ch',
};

async function main() {
  // Admin par défaut
  const exists = db.prepare('SELECT id FROM admins WHERE email = ?').get(config.adminEmail);
  if (!exists) {
    const hash = await hashPassword(config.adminPassword);
    db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(config.adminEmail, hash);
    console.log(`[seed] Admin créé : ${config.adminEmail} / ${config.adminPassword}`);
  } else {
    console.log(`[seed] Admin déjà existant : ${config.adminEmail}`);
  }

  // 2 bots de démo si aucun bot
  const botCount = db.prepare('SELECT COUNT(*) AS n FROM bots').get().n;
  if (botCount === 0) {
    const make = (name, audience, welcome, scope, refusal) => {
      const id = nanoid(12);
      db.prepare(`
        INSERT INTO bots
          (id, name, audience, system_prompt, scope_topics, refusal_message,
           welcome_message, contact_info_json, branding_json,
           llm_provider, llm_model, lead_capture_enabled, allowed_origins, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        id, name, audience,
        `Tu es l'assistant ${name}. Tu es professionnel, concis et utile. Tu réponds en français.`,
        scope,
        refusal,
        welcome,
        JSON.stringify(SOLUXA_CONTACT),
        JSON.stringify(SOLUXA_BRANDING),
        'openai', 'gpt-4o-mini', audience === 'public' ? 1 : 0,
        '*'
      );
      console.log(`[seed] Bot créé : ${name} (id=${id})`);
    };
    make(
      'Soluxa Public', 'public',
      'Bonjour ! Je suis l\'assistant Soluxa. Comment puis-je vous aider aujourd\'hui ?',
      'Les produits, services, offres et coordonnées de Soluxa.',
      'Désolé, je ne suis pas en mesure de répondre à cette question. Je peux vous aider sur les sujets liés à Soluxa.'
    );
    make(
      'Soluxa Interne', 'internal',
      'Bonjour ! Je suis l\'assistant interne Soluxa. Que cherchez-vous ?',
      'Procédures internes, RH, documentation technique et organisationnelle de Soluxa.',
      'Cette question sort de mon périmètre. Réfère-toi à la documentation interne ou à un collaborateur compétent.'
    );
  } else {
    console.log(`[seed] ${botCount} bot(s) déjà présent(s), pas de création.`);
  }

  console.log('[seed] Terminé.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
