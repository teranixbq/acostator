// Enums
export type AnnotationOrder = "sequential" | "random";
export type ProjectStatus = "active" | "archived";
export type RowStatus = "pending" | "in_progress" | "completed" | "skipped";
export type Sentiment = "positive" | "negative" | "neutral" | "mixed";

// Entities
export interface User {
  id: string;
  github_id: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  file_name: string;
  file_size: number;
  total_rows: number;
  status: ProjectStatus;
  annotation_order: AnnotationOrder;
  annotation_queue: string | null; // JSON array of row_index
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // computed
  annotated_rows: number;
}

export interface DatasetRow {
  id: string;
  project_id: string;
  row_index: number;
  text: string;
  status: RowStatus;
  created_at: string;
  updated_at: string;
}

export interface Quadruple {
  id: string;
  row_id: string;
  project_id: string;
  // Aspect
  aspect_term: string;
  aspect_implicit: boolean;
  aspect_start: number | null;
  aspect_end: number | null;
  // Category
  category_id: string;
  // Opinion
  opinion_term: string;
  opinion_implicit: boolean;
  opinion_start: number | null;
  opinion_end: number | null;
  // Sentiment
  sentiment: Sentiment;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  project_id: string;
  name: string;
  usage_count: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Auth
export interface SessionPayload {
  user_id: string;
  github_id: string;
  username: string;
  avatar_url: string | null;
  iat: number;
  exp: number;
}
