import { nanoid } from 'nanoid';
import { sb } from '../src/db.js';
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
  const { data: existing } = await sb.from('admins').select('id').eq('email', config.adminEmail).maybeSingle();
  if (!existing) {
    const hash = await hashPassword(config.adminPassword);
    const { error } = await sb.from('admins').insert({ email: config.adminEmail, password_hash: hash });
    if (error) throw error;
    console.log(`[seed] Admin créé : ${config.adminEmail} / ${config.adminPassword}`);
  } else {
    console.log(`[seed] Admin déjà existant : ${config.adminEmail}`);
  }

  // 2 bots de démo si aucun bot
  const { count: botCount } = await sb.from('bots').select('id', { count: 'exact', head: true }).single();
  if (!botCount || botCount === 0) {
    async function make(name, audience, welcome, scope, refusal) {
      const id = nanoid(12);
      const { error } = await sb.from('bots').insert({
        id, name, audience,
        system_prompt: `Tu es l'assistant ${name}. Tu es professionnel, concis et utile. Tu réponds en français.`,
        scope_topics: scope,
        refusal_message: refusal,
        welcome_message: welcome,
        contact_info_json: JSON.stringify(SOLUXA_CONTACT),
        branding_json: JSON.stringify(SOLUXA_BRANDING),
        llm_provider: 'openai',
        llm_model: 'gpt-4o-mini',
        lead_capture_enabled: audience === 'public' ? 1 : 0,
        allowed_origins: '*',
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      console.log(`[seed] Bot créé : ${name} (id=${id})`);
    }
    await make(
      'Soluxa Public', 'public',
      'Bonjour ! Je suis l\'assistant Soluxa. Comment puis-je vous aider aujourd\'hui ?',
      'Les produits, services, offres et coordonnées de Soluxa.',
      'Désolé, je ne suis pas en mesure de répondre à cette question. Je peux vous aider sur les sujets liés à Soluxa.'
    );
    await make(
      'Soluxa Interne', 'internal',
      'Bonjour ! Je suis l\'assistant interne Soluxa. Que cherchez-vous ?',
      'Procédures internes, RH, documentation technique et organisationnelle de Soluxa.',
      'Cette question sort de mon périmètre. Réfère-toi à la documentation interne ou à un collaborateur compétent.'
    );
  } else {
    console.log(`[seed] ${count} bot(s) déjà présent(s), pas de création.`);
  }

  console.log('[seed] Terminé.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
