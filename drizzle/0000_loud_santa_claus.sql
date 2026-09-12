CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`seed` integer NOT NULL,
	`difficulty` text NOT NULL,
	`status` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`length` integer DEFAULT 4 NOT NULL,
	`food` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_games_created_at` ON `games` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_games_status_score_created_at` ON `games` (`status`,`score`,`created_at`);