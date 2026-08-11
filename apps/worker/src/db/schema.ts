import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// --- users ---

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  github_id: text("github_id").notNull().unique(),
  username: text("username").notNull(),
  email: text("email"),
  avatar_url: text("avatar_url"),
  created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
  updated_at: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// --- projects ---

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  file_name: text("file_name").notNull(),
  file_size: integer("file_size").notNull(),
  total_rows: integer("total_rows").notNull(),
  text_column: text("text_column").notNull().default(""),
  status: text("status", { enum: ["active", "archived"] })
    .notNull()
    .default("active"),
  annotation_order: text("annotation_order", { enum: ["sequential", "random"] })
    .notNull()
    .default("sequential"),
  annotation_queue: text("annotation_queue"), // JSON array of row_index
  deleted_at: text("deleted_at"),
  created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
  updated_at: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// --- dataset_rows ---

export const datasetRows = sqliteTable(
  "dataset_rows",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    row_index: integer("row_index").notNull(),
    text: text("text").notNull(),
    status: text("status", {
      enum: ["pending", "in_progress", "completed", "skipped"],
    })
      .notNull()
      .default("pending"),
    created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
    updated_at: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    project_row_idx: uniqueIndex("dataset_rows_project_row_idx").on(
      table.project_id,
      table.row_index
    ),
  })
);

// --- categories ---

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  name: text("name").notNull(),
  usage_count: integer("usage_count").notNull().default(0),
  deleted_at: text("deleted_at"),
  created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
  updated_at: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// --- quadruples ---

export const quadruples = sqliteTable("quadruples", {
  id: text("id").primaryKey(),
  row_id: text("row_id")
    .notNull()
    .references(() => datasetRows.id),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  // Aspect
  aspect_term: text("aspect_term").notNull(),
  aspect_implicit: integer("aspect_implicit", { mode: "boolean" }).notNull().default(false),
  aspect_start: integer("aspect_start"),
  aspect_end: integer("aspect_end"),
  // Category
  category_id: text("category_id")
    .notNull()
    .references(() => categories.id),
  // Opinion
  opinion_term: text("opinion_term").notNull(),
  opinion_implicit: integer("opinion_implicit", { mode: "boolean" }).notNull().default(false),
  opinion_start: integer("opinion_start"),
  opinion_end: integer("opinion_end"),
  // Sentiment
  sentiment: text("sentiment", {
    enum: ["positive", "negative", "neutral", "mixed"],
  }).notNull(),
  created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
  updated_at: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// --- annotations ---
// Flat quadruple records keyed by project + row_index.
// No FK to dataset_rows — rows live in R2 CSV, not D1.

export const annotations = sqliteTable(
  "annotations",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    row_index: integer("row_index").notNull(),
    aspect: text("aspect").notNull(),
    category: text("category").notNull(),
    opinion: text("opinion").notNull(),
    sentiment: text("sentiment", {
      enum: ["positive", "negative", "neutral", "mixed"],
    }).notNull(),
    status: text("status", { enum: ["draft", "completed"] })
      .notNull()
      .default("completed"),
    created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
    updated_at: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    project_row_aspect_idx: uniqueIndex("annotations_project_row_aspect_idx").on(
      table.project_id,
      table.row_index,
      table.aspect
    ),
  })
);
