/**
 * HeyGen LiveAvatar integration for Soluxa Chatbot
 * 
 * Uses the LiveAvatar API (api.liveavatar.com) to generate
 * session tokens that the client-side SDK uses for WebRTC streaming.
 * 
 * API docs: https://docs.liveavatar.com/api-reference/sessions/create-session-token
 */

const LIVEAVATAR_API_BASE = 'https://api.liveavatar.com';

/**
 * Create a session token from the LiveAvatar API.
 * This token is passed to the client SDK (LiveAvatarSession)
 * which handles WebRTC + WebSocket streaming.
 * 
 * POST /v1/sessions/token
 * Returns: { session_id, session_token }
 */
export async function createSessionToken(apiKey, avatarId, mode = 'LITE') {
  const res = await fetch(`${LIVEAVATAR_API_BASE}/v1/sessions/token`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      avatar_id: avatarId,
      mode,
      is_sandbox: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiveAvatar token request failed: ${text}`);
  }
  const json = await res.json();
  if (json.code !== 1000) {
    throw new Error(`LiveAvatar API error: ${json.message || 'unknown'}`);
  }
  return json.data; // { session_id, session_token }
}

/**
 * Test if a LiveAvatar API key is valid
 */
export async function testApiKey(apiKey) {
  try {
    const res = await fetch(`${LIVEAVATAR_API_BASE}/v1/avatars/public`, {
      headers: { 'X-API-KEY': apiKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * List available avatars for the LiveAvatar account
 */
export async function listAvatars(apiKey) {
  const res = await fetch(`${LIVEAVATAR_API_BASE}/v1/avatars`, {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error(`LiveAvatar listAvatars failed`);
  const json = await res.json();
  return json.data?.results || [];
}

/**
 * List public avatars available on LiveAvatar
 */
export async function listPublicAvatars(apiKey) {
  const res = await fetch(`${LIVEAVATAR_API_BASE}/v1/avatars/public?page_size=100`, {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error(`LiveAvatar listPublicAvatars failed`);
  const json = await res.json();
  return json.data?.results || [];
}

/**
 * List available voices for a LiveAvatar account
 */
export async function listVoices(apiKey) {
  const res = await fetch(`${LIVEAVATAR_API_BASE}/v1/voices`, {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error(`LiveAvatar listVoices failed`);
  const json = await res.json();
  return json.data?.results || [];
}

/**
 * Get the HeyGen/LiveAvatar configuration from a bot's branding_json
 */
export function getHeyGenConfig(bot) {
  const branding = bot.branding_json ? JSON.parse(bot.branding_json) : {};
  return branding.heygen || {};
}

/**
 * Save HeyGen config to a bot's branding_json
 */
export function setHeyGenConfig(bot, heygenConfig) {
  const branding = bot.branding_json ? JSON.parse(bot.branding_json) : {};
  branding.heygen = heygenConfig;
  return JSON.stringify(branding);
}
