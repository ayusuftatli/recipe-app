CREATE TABLE `plan_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`recipe_id` text NOT NULL,
	`servings` real,
	`position` integer NOT NULL,
	`shopped` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_entries_date_idx` ON `plan_entries` (`date`);