import { env } from "cloudflare:test";
import { beforeAll } from "vitest";

// Each statement from 0000_first_omega_sentinel.sql, split on --> statement-breakpoint.
// D1's exec() only accepts a single statement at a time, so we run each separately.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS \`users\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`github_id\` text NOT NULL,
    \`username\` text NOT NULL,
    \`email\` text,
    \`avatar_url\` text,
    \`created_at\` text DEFAULT (datetime('now')) NOT NULL,
    \`updated_at\` text DEFAULT (datetime('now')) NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS `users_github_id_unique` ON `users` (`github_id`)",
  `CREATE TABLE IF NOT EXISTS \`projects\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL,
    \`name\` text NOT NULL,
    \`description\` text,
    \`file_name\` text NOT NULL,
    \`file_size\` integer NOT NULL,
    \`total_rows\` integer NOT NULL,
    \`status\` text DEFAULT 'active' NOT NULL,
    \`annotation_order\` text DEFAULT 'sequential' NOT NULL,
    \`annotation_queue\` text,
    \`deleted_at\` text,
    \`created_at\` text DEFAULT (datetime('now')) NOT NULL,
    \`updated_at\` text DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS \`categories\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`project_id\` text NOT NULL,
    \`name\` text NOT NULL,
    \`usage_count\` integer DEFAULT 0 NOT NULL,
    \`deleted_at\` text,
    \`created_at\` text DEFAULT (datetime('now')) NOT NULL,
    \`updated_at\` text DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS \`dataset_rows\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`project_id\` text NOT NULL,
    \`row_index\` integer NOT NULL,
    \`text\` text NOT NULL,
    \`status\` text DEFAULT 'pending' NOT NULL,
    \`created_at\` text DEFAULT (datetime('now')) NOT NULL,
    \`updated_at\` text DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS `dataset_rows_project_row_idx` ON `dataset_rows` (`project_id`,`row_index`)",
  `CREATE TABLE IF NOT EXISTS \`quadruples\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`row_id\` text NOT NULL,
    \`project_id\` text NOT NULL,
    \`aspect_term\` text NOT NULL,
    \`aspect_implicit\` integer DEFAULT false NOT NULL,
    \`aspect_start\` integer,
    \`aspect_end\` integer,
    \`category_id\` text NOT NULL,
    \`opinion_term\` text NOT NULL,
    \`opinion_implicit\` integer DEFAULT false NOT NULL,
    \`opinion_start\` integer,
    \`opinion_end\` integer,
    \`sentiment\` text NOT NULL,
    \`created_at\` text DEFAULT (datetime('now')) NOT NULL,
    \`updated_at\` text DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (\`row_id\`) REFERENCES \`dataset_rows\`(\`id\`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  // 0001_add_text_column_and_annotations.sql
  "ALTER TABLE `projects` ADD `text_column` text NOT NULL DEFAULT ''",
  `CREATE TABLE IF NOT EXISTS \`annotations\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`project_id\` text NOT NULL,
    \`row_index\` integer NOT NULL,
    \`aspect\` text NOT NULL,
    \`category\` text NOT NULL,
    \`opinion\` text NOT NULL,
    \`sentiment\` text NOT NULL,
    \`status\` text NOT NULL DEFAULT 'completed',
    \`created_at\` text DEFAULT (datetime('now')) NOT NULL,
    \`updated_at\` text DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS `annotations_project_row_aspect_idx` ON `annotations` (`project_id`,`row_index`,`aspect`)",
];

beforeAll(async () => {
  for (const sql of STATEMENTS) {
    await env.DB.prepare(sql).run();
  }
});
