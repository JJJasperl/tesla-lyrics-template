import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const pairingSessions = sqliteTable(
  'pairing_sessions',
  {
    sessionId: text('session_id').primaryKey(),
    secretHash: text('secret_hash').notNull(),
    oauthState: text('oauth_state').notNull().unique(),
    clientId: text('client_id').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    authorizationCode: text('authorization_code'),
    authorizationError: text('authorization_error'),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    consumedAt: integer('consumed_at'),
  },
  (table) => [index('idx_pairing_sessions_expires_at').on(table.expiresAt)],
);
