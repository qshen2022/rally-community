CREATE TABLE `players` (
	`session` text NOT NULL,
	`user` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`joined` text NOT NULL,
	`manual` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`session`, `user`),
	FOREIGN KEY (`session`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`date` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`court` text NOT NULL,
	`booked` text NOT NULL,
	`capacity` integer DEFAULT 4 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`cancelled` integer DEFAULT 0 NOT NULL,
	`demo` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
