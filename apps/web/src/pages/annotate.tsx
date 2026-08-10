import { QuadrupleForm } from "@/components/QuadrupleForm.tsx";
import { api } from "@/lib/api.ts";
import type { DatasetRow, Quadruple } from "@acostator/shared";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

interface RowWithQuadruples extends DatasetRow {
  quadruples: Quadruple[];
}

interface NextRowResponse {
  data: DatasetRow | null;
}

interface RowResponse {
  data: RowWithQuadruples;
}

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "Positive",
  negative: "Negative",
  neutral: "Neutral",
  mixed: "Mixed",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-green-100 text-green-800",
  negative: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-700",
  mixed: "bg-yellow-100 text-yellow-800",
};

export function AnnotatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [row, setRow] = useState<RowWithQuadruples | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadNextRow = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    api
      .get<NextRowResponse>(`/projects/${projectId}/rows/next`)
      .then(async (res) => {
        if (!res.data) {
          setRow(null);
          return;
        }
        // Fetch full row with quadruples
        const full = await api.get<RowResponse>(`/projects/${projectId}/rows/${res.data.id}`);
        setRow(full.data);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load row"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    loadNextRow();
  }, [loadNextRow]);

  function handleQuadrupleAdded(quadruple: Quadruple) {
    setRow((prev) => (prev ? { ...prev, quadruples: [...prev.quadruples, quadruple] } : prev));
  }

  async function handleDeleteQuadruple(quadrupleId: string) {
    if (!projectId || !row) return;
    setDeletingId(quadrupleId);
    try {
      await api.delete(`/projects/${projectId}/rows/${row.id}/quadruples/${quadrupleId}`);
      setRow((prev) =>
        prev ? { ...prev, quadruples: prev.quadruples.filter((q) => q.id !== quadrupleId) } : prev
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete quadruple");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-gray-500">Loading...</span>
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

  if (!row) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">All rows have been annotated.</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Back to projects
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Projects
        </button>
        <span className="text-xs text-gray-400">Row #{row.row_index + 1}</span>
      </div>

      {/* Row text (read-only display above the form) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Row text</p>
        <p className="text-sm leading-relaxed text-gray-900">{row.text}</p>
      </div>

      {/* Existing quadruples */}
      {row.quadruples.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Quadruples ({row.quadruples.length})
          </p>
          <ul className="space-y-2">
            {row.quadruples.map((q) => (
              <li
                key={q.id}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>
                        <span className="font-medium text-blue-700">Aspect:</span>{" "}
                        {q.aspect_implicit ? (
                          <em className="text-gray-400">implicit</em>
                        ) : (
                          <span className="font-medium text-gray-800">{q.aspect_term}</span>
                        )}
                      </span>
                      <span>
                        <span className="font-medium text-purple-700">Category:</span>{" "}
                        <span className="font-medium text-gray-800">{q.category_id}</span>
                      </span>
                      <span>
                        <span className="font-medium text-green-700">Opinion:</span>{" "}
                        {q.opinion_implicit ? (
                          <em className="text-gray-400">implicit</em>
                        ) : (
                          <span className="font-medium text-gray-800">{q.opinion_term}</span>
                        )}
                      </span>
                    </div>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        SENTIMENT_COLORS[q.sentiment] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {SENTIMENT_LABELS[q.sentiment] ?? q.sentiment}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteQuadruple(q.id)}
                    disabled={deletingId === q.id}
                    className="shrink-0 rounded px-2 py-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Delete quadruple"
                  >
                    {deletingId === q.id ? "..." : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add quadruple form */}
      {projectId && (
        <QuadrupleForm
          projectId={projectId}
          rowId={row.id}
          rowText={row.text}
          existingQuadruples={row.quadruples}
          onAdd={handleQuadrupleAdded}
        />
      )}

      {/* Row actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={async () => {
            if (!projectId) return;
            await api.patch(`/projects/${projectId}/rows/${row.id}/status`, {
              status: "completed",
            });
            loadNextRow();
          }}
          className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Mark complete & next
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!projectId) return;
            await api.patch(`/projects/${projectId}/rows/${row.id}/status`, {
              status: "skipped",
            });
            loadNextRow();
          }}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm hover:bg-gray-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
