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

export function AnnotatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [row, setRow] = useState<RowWithQuadruples | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Back
        </button>
        <span className="text-xs text-gray-400">Row {row.row_index + 1}</span>
      </div>

      {/* Text to annotate */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-gray-500 mb-2">Text</p>
        <p className="text-base leading-relaxed">{row.text}</p>
      </div>

      {/* Existing quadruples */}
      {row.quadruples.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-500">Quadruples</p>
          <ul className="space-y-2">
            {row.quadruples.map((q) => (
              <li
                key={q.id}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm"
              >
                <span className="font-medium">{q.aspect_term}</span>
                {" · "}
                <span className="text-gray-500">{q.opinion_term}</span>
                {" · "}
                <span className="text-gray-500">{q.sentiment}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
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
