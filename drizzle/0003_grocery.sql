CREATE TABLE `grocery_checks` (
	`key` text PRIMARY KEY NOT NULL,
	`sig` text NOT NULL,
	`checked` integer NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `grocery_manual` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pantry_staples` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`needed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
