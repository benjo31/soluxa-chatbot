/**
 * Crypto utilities for encrypting/decrypting sensitive data (API keys).
 * 
 * Uses AES-256-GCM with the configured MASTER_KEY.
 * All operations are wrapped in try/catch and return null on failure.
 * This module NEVER throws — making it impossible for this code to crash the process.
 */
import crypto from 'node:crypto';
import { config } from './config.js';

const ALGO = 'aes-256-gcm';

/**
 * Safely get the encryption key. Returns null if key is invalid.
 */
function getKey() {
  try {
    const v = config.masterKey;
    if (!v) return null;
    const key = Buffer.from(v, 'hex');
    if (key.length !== 32) return null;
    return key;
  } catch {
    return null;
  }
}

/**
 * Encrypt a plaintext string.
 * Returns null on any error — never throws.
 * @param {string|null|undefined} plaintext
 * @returns {string|null}
 */
export function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  try {
    const key = getKey();
    if (!key) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
  } catch (e) {
    console.error('[crypto] encryptSecret error:', e?.message);
    return null;
  }
}

/**
 * Decrypt an encrypted payload string.
 * Returns null on any error — never throws.
 * @param {string|null|undefined} payload
 * @returns {string|null}
 */
export function decryptSecret(payload) {
  if (!payload) return null;
  try {
    const key = getKey();
    if (!key) return null;
    const parts = payload.split('.');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, encB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('[crypto] decryptSecret error:', e?.message);
    return null;
  }
}
