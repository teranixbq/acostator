import { api } from "@/lib/api.ts";
import { clearProjectData } from "@/lib/indexeddb.ts";
import { UploadCSVModal } from "@/components/UploadCSVModal.tsx";
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

  // Delete dataset state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Replace dataset state
  const [showReplaceModal, setShowReplaceModal] = useState(false);

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

  const handleDeleteDataset = async () => {
    if (!project || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await api.delete<ProjectResponse>(`/projects/${project.id}/dataset`);
      await clearProjectData(project.id);
      setProject(res.data);
      setShowDeleteConfirm(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete dataset");
    } finally {
      setDeleting(false);
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

          {/* Replace Dataset */}
          <div className="px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Replace dataset</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Upload a new CSV to replace the current dataset. All existing annotations will be
                  cleared.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReplaceModal(true)}
                className="flex-shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Replace dataset
              </button>
            </div>
          </div>

          {/* Delete Dataset */}
          <div className="px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Delete dataset</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Remove the CSV and all annotations from this project.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setShowDeleteConfirm(true);
                }}
                disabled={!project.file_name}
                className="flex-shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete dataset
              </button>
            </div>

            {/* Inline confirmation */}
            {showDeleteConfirm && (
              <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="text-sm text-red-800">
                  This will delete your CSV and all annotations. This cannot be undone.
                </p>
                {deleteError && (
                  <p className="mt-1 text-sm text-red-600">{deleteError}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDeleteDataset()}
                    disabled={deleting}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Replace dataset modal */}
      {showReplaceModal && (
        <UploadCSVModal
          projectId={project.id}
          onClose={() => setShowReplaceModal(false)}
          onUploaded={async () => {
            await clearProjectData(project.id);
            const res = await api.get<ProjectResponse>(`/projects/${project.id}`);
            setProject(res.data);
            setShowReplaceModal(false);
          }}
        />
      )}
    </div>
  );
}
