import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
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
]);
