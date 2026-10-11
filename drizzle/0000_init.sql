CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`nutrients_per_100g` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `foods_source_source_id_unique` ON `foods` (`source`,`source_id`);--> statement-breakpoint
CREATE TABLE `recipe_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`title` text NOT NULL,
	`servings` real,
	`yield_g` real,
	`ingredients` text NOT NULL,
	`steps` text NOT NULL,
	`notes` text,
	`source_url` text,
	`change_note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_versions_recipe_idx` ON `recipe_versions` (`recipe_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_versions_recipe_id_version_number_unique` ON `recipe_versions` (`recipe_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`current_version_id` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`photo_path` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
