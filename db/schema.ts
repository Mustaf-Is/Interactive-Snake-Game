import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  usernameKey: text('username_key').unique(),
  passwordHash: text('password_hash'),
  createdAt: integer('created_at').notNull(),
});
export const playerSessions = sqliteTable('player_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  playerId: text('player_id').notNull().references(() => players.id),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('idx_sessions_expiry').on(table.expiresAt), index('idx_sessions_player').on(table.playerId)]);
export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  playerId: text('player_id').references(() => players.id),
  playerName: text('player_name').notNull().default('LEGACY'),
  seed: integer('seed').notNull(),
  difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }).notNull(),
  status: text('status', { enum: ['started', 'completed'] }).notNull(),
  score: integer('score').notNull().default(0),
  length: integer('length').notNull().default(4),
  food: integer('food').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
}, table => [
  index('idx_games_created_at').on(table.createdAt),
  index('idx_games_status_score_created_at').on(table.status, table.score, table.createdAt),
  index('idx_games_player_created').on(table.playerId, table.createdAt),
]);

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull(),
}, table => [index('idx_rate_limits_window').on(table.windowStart)]);
