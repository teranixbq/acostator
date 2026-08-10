import { api } from "@/lib/api.ts";
import type { AnnotationOrder, Project } from "@acostator/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface ProjectResponse {
  data: Project;
}

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Annotation order update state
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api
      .get<ProjectResponse>(`/projects/${projectId}`)
      .then((res) => setProject(res.data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load project")
      )
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleAnnotationOrderChange = async (order: AnnotationOrder) => {
    if (!project || orderSaving) return;

    setOrderSaving(true);
    setOrderFeedback(null);

    try {
      const res = await api.patch<ProjectResponse>(`/projects/${project.id}`, {
        annotation_order: order,
      });
      setProject(res.data);
      setOrderFeedback({ type: "success", message: "Annotation order updated." });
    } catch (err) {
      setOrderFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update annotation order",
      });
    } finally {
      setOrderSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-gray-500">Loading project...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-red-500">{error ?? "Project not found"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">
          ← Projects
        </Link>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold">{project.name}</h1>
        {project.description && <p className="mt-1 text-sm text-gray-500">{project.description}</p>}
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total rows</p>
          <p className="mt-1 text-2xl font-semibold">{project.total_rows}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Annotated</p>
          <p className="mt-1 text-2xl font-semibold">{project.annotated_rows}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Progress</p>
          <p className="mt-1 text-2xl font-semibold">
            {project.total_rows > 0
              ? `${Math.round((project.annotated_rows / project.total_rows) * 100)}%`
              : "—"}
          </p>
        </div>
      </div>

      {/* Settings */}
      <section aria-labelledby="settings-heading">
        <h2 id="settings-heading" className="mb-4 text-base font-semibold">
          Settings
        </h2>
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          {/* Annotation order setting */}
          <div className="px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Annotation order</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Controls the order in which dataset rows are presented during annotation.
                </p>
              </div>
              <fieldset disabled={orderSaving} className="flex-shrink-0">
                <legend className="sr-only">Annotation order</legend>
                <div className="flex gap-2">
                  {(["sequential", "random"] as const).map((order) => (
                    <label
                      key={order}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        project.annotation_order === order
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <input
                        type="radio"
                        name="annotation_order"
                        value={order}
                        checked={project.annotation_order === order}
                        onChange={() => handleAnnotationOrderChange(order)}
                        className="sr-only"
                      />
                      <span className="capitalize">{order}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            {orderFeedback && (
              <p
                className={`mt-2 text-sm ${
                  orderFeedback.type === "success" ? "text-green-600" : "text-red-600"
                }`}
              >
                {orderFeedback.message}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
