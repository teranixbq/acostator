const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/** Fetch CSV text for a project from R2 (returns raw text, not JSON). */
async function fetchCSV(projectId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/projects/${projectId}/csv`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to fetch CSV: ${res.status}`);
  }
  return res.text();
}

export interface Annotation {
  id: string;
  project_id: string;
  row_index: number;
  aspect: string;
  category: string;
  opinion: string;
  sentiment: string;
  status: "draft" | "completed";
  created_at: string;
  updated_at: string;
}

export interface AnnotationsResponse {
  data: Annotation[];
}

export interface PostAnnotationBody {
  row_index: number;
  aspect: string;
  category: string;
  opinion: string;
  sentiment: string;
  status?: "draft" | "completed";
}

export interface PutAnnotationBody {
  aspect?: string;
  category?: string;
  opinion?: string;
  sentiment?: string;
  status?: "draft" | "completed";
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  /** GET /projects/:id/csv — returns raw CSV text */
  getCSV: (projectId: string) => fetchCSV(projectId),

  /** GET /projects/:id/annotations — all annotations for a project */
  getAnnotations: (projectId: string) =>
    request<AnnotationsResponse>(`/projects/${projectId}/annotations`),

  /** GET /projects/:id/annotations?row_index=N — annotations for a specific row */
  getAnnotationsByRow: (projectId: string, rowIndex: number) =>
    request<AnnotationsResponse>(`/projects/${projectId}/annotations?row_index=${rowIndex}`),

  /** POST /projects/:id/annotations */
  postAnnotation: (projectId: string, body: PostAnnotationBody) =>
    request<{ data: Annotation }>(`/projects/${projectId}/annotations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** PUT /projects/:id/annotations/:annotationId */
  putAnnotation: (projectId: string, annotationId: string, body: PutAnnotationBody) =>
    request<{ data: Annotation }>(`/projects/${projectId}/annotations/${annotationId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  /** DELETE /projects/:id/annotations/:annotationId */
  deleteAnnotation: (projectId: string, annotationId: string) =>
    request<{ success: true }>(`/projects/${projectId}/annotations/${annotationId}`, {
      method: "DELETE",
    }),
};
