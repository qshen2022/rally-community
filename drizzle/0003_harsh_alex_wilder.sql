CREATE TABLE `name_claims` (
	`key` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `name_claims_user_unique` ON `name_claims` (`user`);--> statement-breakpoint
ALTER TABLE `players` ADD `name_key` text;