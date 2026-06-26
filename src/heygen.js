/**
 * HeyGen Live Avatar integration for Soluxa Chatbot
 * 
 * Uses LiveAvatar API (v3) for streaming avatar conversations.
 * Two modes available:
 *   - LITE: We provide the LLM, HeyGen handles avatar + TTS
 *   - FULL: HeyGen handles everything (not used here)
 *
 * We use LITE mode via the streaming talk endpoint.
 */

const HEYGEN_API_BASE = 'https://api.heygen.com';

/**
 * Start a streaming avatar session
 * Returns: { session_id, url, token }
 */
export async function startStream(apiKey, avatarId, voiceId) {
  const res = await fetch(`${HEYGEN_API_BASE}/v1/streaming/create`, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      avatar: { avatar_id: avatarId },
      voice: { voice_id: voiceId },
      version: 'v2',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HeyGen startStream failed: ${text}`);
  }
  return res.json();
}

/**
 * Send text to the streaming avatar and let it respond
 * Returns the response (audio/video URL or status)
 */
export async function speak(apiKey, sessionId, text) {
  const res = await fetch(`${HEYGEN_API_BASE}/v1/streaming/talk`, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      text,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HeyGen speak failed: ${text}`);
  }
  return res.json();
}

/**
 * Stop the streaming session
 */
export async function stopStream(apiKey, sessionId) {
  const res = await fetch(`${HEYGEN_API_BASE}/v1/streaming/stop`, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn('[heygen] stopStream error:', text);
  }
}

/**
 * Get streaming status
 */
export async function getStatus(apiKey, sessionId) {
  const res = await fetch(`${HEYGEN_API_BASE}/v1/streaming/status?session_id=${sessionId}`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error(`HeyGen getStatus failed`);
  return res.json();
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
