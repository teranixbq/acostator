import { type LocalAnnotation, QuadrupleForm } from "@/components/QuadrupleForm.tsx";
import { getAnnotationColor } from "@/components/TextHighlighter.tsx";
import { api } from "@/lib/api.ts";
import type { Annotation } from "@/lib/api.ts";
import {
  type CsvRow,
  type RowLocalStatus,
  getAllRowStatuses,
  getCSVRows,
  hasCachedCSV,
  loadProgress,
  saveCSVRows,
  saveProgress,
  setRowStatus,
} from "@/lib/indexeddb.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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

/** Parse raw CSV text into rows using the given header column name. */
function parseCSV(csvText: string, textColumn: string): CsvRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0] ?? "");
  const colIndex = headers.findIndex(
    (h) => h.trim().toLowerCase() === textColumn.trim().toLowerCase()
  );
  if (colIndex === -1) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCSVLine(lines[i] ?? "");
    const text = fields[colIndex]?.trim() ?? "";
    if (text.length > 0) {
      rows.push({ row_index: i - 1, text });
    }
  }
  return rows;
}

/** Minimal CSV line splitter that handles double-quoted fields. */
function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

interface ProjectResponse {
  data: {
    id: string;
    text_column: string;
    total_rows: number;
    [key: string]: unknown;
  };
}

export function AnnotatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [statuses, setStatuses] = useState<Map<number, RowLocalStatus>>(new Map());
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [saving, setSaving] = useState(false);

  const csvRowsRef = useRef<CsvRow[]>([]);
  csvRowsRef.current = csvRows;

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    try {
      const projectRes = await api.get<ProjectResponse>(`/projects/${projectId}`);
      const textColumn = projectRes.data.text_column;

      let rows: CsvRow[];
      const cached = await hasCachedCSV(projectId);
      if (cached) {
        rows = await getCSVRows(projectId);
      } else {
        const csvText = await api.getCSV(projectId);
        rows = parseCSV(csvText, textColumn);
        if (rows.length > 0) {
          await saveCSVRows(projectId, rows);
        }
      }
      setCsvRows(rows);

      const lastIndex = await loadProgress(projectId);
      const startIndex = lastIndex !== null ? Math.min(lastIndex, rows.length - 1) : 0;
      setCurrentIndex(startIndex);

      const statusMap = await getAllRowStatuses(projectId);
      setStatuses(statusMap);

      const annRes = await api.getAnnotations(projectId);
      setAnnotations(annRes.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Save progress to IndexedDB whenever the current row changes
  useEffect(() => {
    if (!projectId || csvRows.length === 0) return;
    void saveProgress(projectId, currentIndex);
  }, [projectId, currentIndex, csvRows.length]);

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  function goTo(index: number) {
    const rows = csvRowsRef.current;
    if (index < 0 || index >= rows.length) return;
    setCurrentIndex(index);
  }

  function goNext() {
    goTo(currentIndex + 1);
  }

  function goPrevious() {
    goTo(currentIndex - 1);
  }

  // -------------------------------------------------------------------------
  // Local annotation state — reset on row change
  // -------------------------------------------------------------------------

  const [pendingAnnotations, setPendingAnnotations] = useState<LocalAnnotation[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<LocalAnnotation | null>(null);

  // Form open by default when there are no annotations yet for this row;
  // collapsed after the first annotation is added.
  const [isFormOpen, setIsFormOpen] = useState(true);

  // Reset pending list, edit state, and form visibility when navigating to a new row
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on row change only
  useEffect(() => {
    setPendingAnnotations([]);
    setEditingAnnotation(null);
    setIsFormOpen(true);
  }, [currentIndex]);

  function handleAnnotationAdded(annotation: LocalAnnotation) {
    setPendingAnnotations((prev) => [...prev, annotation]);
  }

  function handleAnnotationUpdated(annotation: LocalAnnotation) {
    setPendingAnnotations((prev) =>
      prev.map((a) => (a.localId === annotation.localId ? annotation : a))
    );
    setEditingAnnotation(null);
  }

  function handleDeleteAnnotation(localId: string) {
    setPendingAnnotations((prev) => prev.filter((a) => a.localId !== localId));
    if (editingAnnotation?.localId === localId) {
      setEditingAnnotation(null);
    }
  }

  function handleEditAnnotation(annotation: LocalAnnotation) {
    setEditingAnnotation(annotation);
  }

  function handleCancelEdit() {
    setEditingAnnotation(null);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function handleComplete() {
    if (!projectId || csvRows.length === 0) return;
    const row = csvRows[currentIndex];
    if (!row) return;

    setSaving(true);
    try {
      // POST all pending annotations to server in one batch
      for (const a of pendingAnnotations) {
        await api.postAnnotation(projectId, {
          row_index: row.row_index,
          aspect: a.aspectTerm,
          category: a.categoryId,
          opinion: a.opinionTerm,
          sentiment: a.sentiment,
        });
      }
      await setRowStatus(projectId, row.row_index, "completed");
      setStatuses((prev) => new Map(prev).set(row.row_index, "completed"));
      goNext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save annotations");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    if (!projectId || csvRows.length === 0) return;
    const row = csvRows[currentIndex];
    if (!row) return;

    setSaving(true);
    try {
      await setRowStatus(projectId, row.row_index, "skipped");
      setStatuses((prev) => new Map(prev).set(row.row_index, "skipped"));
      goNext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to skip row");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const currentRow = csvRows[currentIndex] ?? null;
  const currentStatus = currentRow ? (statuses.get(currentRow.row_index) ?? "pending") : "pending";
  const savedAnnotations = currentRow
    ? annotations.filter((a) => a.row_index === currentRow.row_index)
    : [];

  const completedCount = [...statuses.values()].filter((s) => s === "completed").length;
  const totalRows = csvRows.length;
  const allDone = totalRows > 0 && completedCount === totalRows;

  // Convert pending annotations to Quadruple shape for TextHighlighter
  const pendingAsQuadruples = pendingAnnotations.map((a) => ({
    id: a.localId,
    aspect_term: a.aspectTerm,
    aspect_implicit: a.aspectImplicit,
    aspect_start: a.aspectStart,
    aspect_end: a.aspectEnd,
    category_id: a.categoryId,
    opinion_term: a.opinionTerm,
    opinion_implicit: a.opinionImplicit,
    opinion_start: a.opinionStart,
    opinion_end: a.opinionEnd,
    sentiment: a.sentiment,
  }));

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-500">{error}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (allDone || !currentRow) {
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
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {currentIndex + 1} / {totalRows}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              currentStatus === "completed"
                ? "bg-green-100 text-green-700"
                : currentStatus === "skipped"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-500"
            }`}
          >
            {currentStatus}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-gray-900 transition-all"
          style={{ width: `${Math.round((completedCount / totalRows) * 100)}%` }}
        />
      </div>

      {/* Row text */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
          Row {currentRow.row_index + 1}
        </p>
        <p className="text-sm text-gray-800 leading-relaxed">{currentRow.text}</p>
      </div>

      {/* Annotations already saved to D1 for this row */}
      {savedAnnotations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Saved annotations ({savedAnnotations.length})
          </p>
          <ul className="space-y-2">
            {savedAnnotations.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm"
              >
                <div className="space-y-0.5 text-gray-700">
                  <p>
                    <span className="text-gray-400">Aspect:</span> {a.aspect}
                  </p>
                  <p>
                    <span className="text-gray-400">Category:</span> {a.category}
                  </p>
                  <p>
                    <span className="text-gray-400">Opinion:</span> {a.opinion}
                  </p>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      SENTIMENT_COLORS[a.sentiment] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {SENTIMENT_LABELS[a.sentiment] ?? a.sentiment}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pending (unsaved) annotations — with per-entry color dot, edit, delete */}
      {pendingAnnotations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Pending annotations ({pendingAnnotations.length})
          </p>
          <ul className="space-y-2">
            {pendingAnnotations.map((a, idx) => {
              const color = getAnnotationColor(idx);
              const isBeingEdited = editingAnnotation?.localId === a.localId;
              return (
                <li
                  key={a.localId}
                  className={`rounded-lg border px-4 py-3 text-sm ${color.border} bg-white ${
                    isBeingEdited ? "ring-2 ring-offset-1 ring-gray-400" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      {/* Color dot matching TextHighlighter */}
                      <span
                        className={`mt-1 shrink-0 inline-block h-2.5 w-2.5 rounded-full ${color.dot}`}
                        aria-hidden="true"
                      />
                      <div className="space-y-0.5 text-gray-700 min-w-0">
                        <p>
                          <span className="text-gray-400">Aspect:</span> {a.aspectTerm}
                        </p>
                        <p>
                          <span className="text-gray-400">Category:</span> {a.categoryName}
                        </p>
                        <p>
                          <span className="text-gray-400">Opinion:</span> {a.opinionTerm}
                        </p>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            SENTIMENT_COLORS[a.sentiment] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {SENTIMENT_LABELS[a.sentiment] ?? a.sentiment}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditAnnotation(a)}
                        className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAnnotation(a.localId)}
                        className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Annotation form — key forces full remount on row change */}
      <QuadrupleForm
        key={currentIndex}
        projectId={projectId ?? ""}
        rowText={currentRow.text}
        existingQuadruples={pendingAsQuadruples as never}
        isFormOpen={isFormOpen}
        onOpenForm={() => setIsFormOpen(true)}
        onCloseForm={() => setIsFormOpen(false)}
        editingQuadruple={editingAnnotation}
        onAdd={handleAnnotationAdded}
        onUpdate={handleAnnotationUpdated}
        onCancelEdit={handleCancelEdit}
      />

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goPrevious}
          disabled={currentIndex === 0 || saving}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          ← Previous
        </button>

        <button
          type="button"
          onClick={() => void handleSkip()}
          disabled={saving}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Skip →
        </button>

        <button
          type="button"
          onClick={() => void handleComplete()}
          disabled={pendingAnnotations.length === 0 || saving}
          className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Complete →"}
        </button>
      </div>
    </div>
  );
}
