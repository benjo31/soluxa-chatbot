/**
 * Diagnostic endpoints for debugging LiveAvatar connection
 */
import express from 'express';
import { createSessionToken } from '../heygen.js';
import { config } from '../config.js';

export const diagRouter = express.Router();

diagRouter.get('/diag/liveavatar', async (req, res) => {
  const results = {
    hasApiKey: !!config.liveavatarApiKey,
    hasAvatarId: !!config.liveavatarAvatarId,
    avatarId: config.liveavatarAvatarId,
    apiKeyPreview: config.liveavatarApiKey ? config.liveavatarApiKey.slice(0, 8) + '...' : null,
  };

  if (config.liveavatarApiKey) {
    try {
      const tokenData = await createSessionToken(
        config.liveavatarApiKey,
        config.liveavatarAvatarId || '65f9e3c9-d48b-4118-b73a-4ae2e3cbb8f0',
        'LITE'
      );
      results.success = true;
      results.sessionId = tokenData.session_id;
      results.tokenPreview = tokenData.session_token.slice(0, 20) + '...';
    } catch (e) {
      results.success = false;
      results.error = e.message;
      results.errorName = e.name;
    }
  }

  res.json(results);
});
