ALTER TABLE `projects` ADD `text_column` text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`aspect` text NOT NULL,
	`category` text NOT NULL,
	`opinion` text NOT NULL,
	`sentiment` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `annotations_project_row_aspect_idx` ON `annotations` (`project_id`,`row_index`,`aspect`);
