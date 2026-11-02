CREATE TABLE `player_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expiry` ON `player_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_player` ON `player_sessions` (`player_id`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_key` text,
	`password_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_username_key_unique` ON `players` (`username_key`);--> statement-breakpoint
ALTER TABLE `games` ADD `player_id` text REFERENCES players(id);--> statement-breakpoint
ALTER TABLE `games` ADD `player_name` text DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_games_player_created` ON `games` (`player_id`,`created_at`);