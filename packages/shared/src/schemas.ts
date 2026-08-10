import { z } from "zod";

// --- Auth ---

export const GithubCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

// --- Project ---

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  annotation_order: z.enum(["sequential", "random"]).default("sequential"),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  annotation_order: z.enum(["sequential", "random"]).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const ProjectParamsSchema = z.object({
  projectId: z.string().min(1),
});

// --- DatasetRow ---

export const RowParamsSchema = z.object({
  projectId: z.string().min(1),
  rowId: z.string().min(1),
});

export const UpdateRowStatusSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "skipped"]),
});

// --- Quadruple ---

export const CreateQuadrupleSchema = z.object({
  aspect_term: z.string().min(1),
  aspect_implicit: z.boolean().default(false),
  aspect_start: z.number().int().nonnegative().nullable().optional(),
  aspect_end: z.number().int().nonnegative().nullable().optional(),
  category_id: z.string().min(1),
  opinion_term: z.string().min(1),
  opinion_implicit: z.boolean().default(false),
  opinion_start: z.number().int().nonnegative().nullable().optional(),
  opinion_end: z.number().int().nonnegative().nullable().optional(),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]),
});

export const QuadrupleParamsSchema = z.object({
  projectId: z.string().min(1),
  rowId: z.string().min(1),
  quadrupleId: z.string().min(1),
});

// --- Category ---

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(255),
});

export const CategoryParamsSchema = z.object({
  projectId: z.string().min(1),
  categoryId: z.string().min(1),
});

// --- Upload ---

export const UploadInitSchema = z.object({
  file_name: z.string().min(1),
  file_size: z.number().positive(),
});

export const UploadCompleteSchema = z.object({ upload_id: z.string().uuid() });

// --- Pagination ---

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Inferred types
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
export type CreateQuadrupleInput = z.infer<typeof CreateQuadrupleSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type UploadInitInput = z.infer<typeof UploadInitSchema>;
export type UploadCompleteInput = z.infer<typeof UploadCompleteSchema>;
