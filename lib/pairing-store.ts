import { env } from 'cloudflare:workers';

const PAIRING_TTL_MS = 5 * 60 * 1000;

type AppBindings = Cloudflare.Env & {
  DB?: D1Database;
  SPOTIFY_CLIENT_ID?: string;
};

export type PairingRecord = {
  session_id: string;
  client_id: string;
  code_challenge: string;
  oauth_state: string;
  authorization_code: string | null;
  authorization_error: string | null;
  expires_at: number;
  consumed_at: number | null;
};

export const PAIRING_ID_PATTERN = /^[A-Za-z0-9_-]{24}$/;
export const PAIRING_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function bindings() {
  return env as AppBindings;
}

export function configuredSpotifyClientId() {
  return bindings().SPOTIFY_CLIENT_ID?.trim() || null;
}

function database() {
  const db = bindings().DB;
  if (!db) throw new Error('Pairing database is not configured.');
  return db;
}

function randomBase64Url(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPairing(clientId: string, codeChallenge: string) {
  const db = database();
  const now = Date.now();
  const sessionId = randomBase64Url(18);
  const secret = randomBase64Url(32);
  const secretHash = await sha256Hex(secret);
  const oauthState = `qr_${randomBase64Url(24)}`;
  const expiresAt = now + PAIRING_TTL_MS;

  await db.batch([
    db.prepare('DELETE FROM pairing_sessions WHERE expires_at < ?').bind(now),
    db
      .prepare(
        `INSERT INTO pairing_sessions
          (session_id, secret_hash, oauth_state, client_id, code_challenge, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(sessionId, secretHash, oauthState, clientId, codeChallenge, now, expiresAt),
  ]);

  return { sessionId, secret, expiresAt };
}

export async function readPairing(sessionId: string, secret: string) {
  const secretHash = await sha256Hex(secret);
  return database()
    .prepare(
      `SELECT session_id, client_id, code_challenge, oauth_state, authorization_code,
              authorization_error, expires_at, consumed_at
       FROM pairing_sessions
       WHERE session_id = ? AND secret_hash = ?`,
    )
    .bind(sessionId, secretHash)
    .first<PairingRecord>();
}

export async function storeAuthorizationResult(state: string, code: string | null, error: string | null) {
  const now = Date.now();
  const result = await database()
    .prepare(
      `UPDATE pairing_sessions
       SET authorization_code = ?, authorization_error = ?
       WHERE oauth_state = ? AND expires_at >= ? AND consumed_at IS NULL`,
    )
    .bind(code, error, state, now)
    .run();
  return Number(result.meta.changes || 0) > 0;
}

export async function completePairing(sessionId: string, secret: string) {
  const secretHash = await sha256Hex(secret);
  const result = await database()
    .prepare(
      `UPDATE pairing_sessions
       SET authorization_code = NULL, consumed_at = ?
       WHERE session_id = ? AND secret_hash = ? AND consumed_at IS NULL`,
    )
    .bind(Date.now(), sessionId, secretHash)
    .run();
  return Number(result.meta.changes || 0) > 0;
}
