import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Ensure local uploads dir exists
fs.mkdirSync(config.uploadsPath, { recursive: true });

// Supabase client (service_role = bypass RLS for backend)
export const sb = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

// Keep a backward-compatible db object so minimal code changes needed
// We still create the SQLite db for local dev fallback but the real data lives in Supabase
export const db = null;

// Helper: run a query directly via Supabase client
export async function query(table) {
  return sb.from(table).select();
}

export async function get(table, idField, id) {
  const { data, error } = await sb.from(table).select().eq(idField, id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAll(table, orderBy) {
  let q = sb.from(table).select();
  if (orderBy) q = q.order(orderBy, { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function insert(table, row) {
  const { data, error } = await sb.from(table).insert(row).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function update(table, idField, id, updates) {
  const { data, error } = await sb.from(table).update(updates).eq(idField, id).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function remove(table, idField, id) {
  const { error } = await sb.from(table).delete().eq(idField, id);
  if (error) throw error;
}

export async function queryWhere(table, conditions, orderBy) {
  let q = sb.from(table).select();
  for (const [field, value] of Object.entries(conditions)) {
    q = q.eq(field, value);
  }
  if (orderBy) q = q.order(orderBy, { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
