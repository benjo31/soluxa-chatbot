/**
 * HeyGen Live Avatar integration for Soluxa Chatbot
 * 
 * Uses the LiveAvatar Web SDK for client-side WebRTC.
 * Backend only needs to:
 * 1. Get a session token from HeyGen's API (POST /v1/streaming/token)
 * 2. Return it to the client
 * 3. Clean up if needed
 */

const HEYGEN_API_BASE = 'https://api.heygen.com';

/**
 * Get a streaming token from HeyGen.
 * This token is passed to the client SDK which handles the rest.
 * Returns: { token, sessionId }
 */
export async function getStreamToken(apiKey) {
  const res = await fetch(`${HEYGEN_API_BASE}/v1/streaming/token`, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HeyGen token request failed: ${text}`);
  }
  const data = await res.json();
  return data.data; // { token, session_id }
}

/**
 * Test if a HeyGen API key is valid
 */
export async function testApiKey(apiKey) {
  try {
    const res = await fetch(`${HEYGEN_API_BASE}/v1/streaming/token`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * List available avatars for a HeyGen account
 */
export async function listAvatars(apiKey) {
  const res = await fetch(`${HEYGEN_API_BASE}/v3/avatars`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error(`HeyGen listAvatars failed`);
  const { data } = await res.json();
  return data;
}

/**
 * List available voices for a HeyGen account
 */
export async function listVoices(apiKey) {
  const res = await fetch(`${HEYGEN_API_BASE}/v3/voices`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error(`HeyGen listVoices failed`);
  const { data } = await res.json();
  return data;
}

/**
 * Get the HeyGen configuration from a bot's branding_json
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
