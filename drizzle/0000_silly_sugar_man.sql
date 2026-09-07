CREATE TABLE `pairing_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`secret_hash` text NOT NULL,
	`oauth_state` text NOT NULL,
	`client_id` text NOT NULL,
	`code_challenge` text NOT NULL,
	`authorization_code` text,
	`authorization_error` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_sessions_oauth_state_unique` ON `pairing_sessions` (`oauth_state`);--> statement-breakpoint
CREATE INDEX `idx_pairing_sessions_expires_at` ON `pairing_sessions` (`expires_at`);