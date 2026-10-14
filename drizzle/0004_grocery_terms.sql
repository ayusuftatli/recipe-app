CREATE TABLE `grocery_terms` (
	`name_key` text PRIMARY KEY NOT NULL,
	`canonical` text NOT NULL,
	`aisle` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
