import { api } from "@/lib/api.ts";
import type { Project } from "@acostator/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface ProjectsResponse {
  data: Project[];
  page: number;
  limit: number;
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ProjectsResponse>("/projects")
      .then((res) => setProjects(res.data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load projects")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-gray-500">Loading projects...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <button
          type="button"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          onClick={() => {
            /* TODO: open create project modal */
          }}
        >
          New project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-sm text-gray-500">No projects yet. Create one to get started.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map((project) => (
            <li
              key={project.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="font-medium">{project.name}</h2>
                  {project.description && (
                    <p className="text-sm text-gray-500">{project.description}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {project.annotated_rows} / {project.total_rows} rows annotated
                  </p>
                </div>
                <Link
                  to={`/projects/${project.id}/annotate`}
                  className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Annotate
                </Link>
              </div>

              {/* Progress bar */}
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gray-900 transition-all"
                  style={{
                    width: `${project.total_rows > 0 ? (project.annotated_rows / project.total_rows) * 100 : 0}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
