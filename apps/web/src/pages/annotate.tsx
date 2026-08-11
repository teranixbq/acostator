import { QuadrupleForm } from "@/components/QuadrupleForm.tsx";
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
import type { Quadruple } from "@acostator/shared";
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

  // Parse header row
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
      // Escaped quote inside quoted field
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

// Quadruples are stored in memory only (fetched from D1 on load)
type LocalQuadruple = Quadruple;

export function AnnotatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // CSV rows loaded from IndexedDB (or fetched from R2)
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  // Current row index into csvRows array
  const [currentIndex, setCurrentIndex] = useState(0);
  // Row statuses from IndexedDB
  const [statuses, setStatuses] = useState<Map<number, RowLocalStatus>>(new Map());
  // Annotations fetched from D1
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  // Whether a Complete/Skip action is in flight
  const [saving, setSaving] = useState(false);

  // Keep a ref to the latest csvRows for use inside callbacks without stale closure
  const csvRowsRef = useRef<CsvRow[]>([]);
  csvRowsRef.current = csvRows;

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch project metadata for text_column
      const projectRes = await api.get<ProjectResponse>(`/projects/${projectId}`);
      const textColumn = projectRes.data.text_column;

      // Load CSV rows — use IndexedDB cache if available
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

      // Restore last position
      const lastIndex = await loadProgress(projectId);
      const startIndex = lastIndex !== null ? Math.min(lastIndex, rows.length - 1) : 0;
      setCurrentIndex(startIndex);

      // Load row statuses
      const statusMap = await getAllRowStatuses(projectId);
      setStatuses(statusMap);

      // Load existing annotations from D1
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
  // Navigation helpers
  // -------------------------------------------------------------------------

  function goTo(index: number) {
    const rows = csvRowsRef.current;
    if (index < 0 || index >= rows.length) return;
    setCurrentIndex(index);
  }

  function goNext() {
    goTo(currentIndex + 1);
  }

  function goPrev() {
    goTo(currentIndex - 1);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function handleComplete(quadruples: LocalQuadruple[]) {
    if (!projectId || csvRows.length === 0) return;
    const row = csvRows[currentIndex];
    if (!row) return;

    setSaving(true);
    try {
      // Post each quadruple in the current session to D1
      for (const q of quadruples) {
        await api.postAnnotation(projectId, {
          row_index: row.row_index,
          aspect: q.aspect_term,
          category: q.category_id,
          opinion: q.opinion_term,
          sentiment: q.sentiment,
        });
      }
      // Mark locally as completed
      await setRowStatus(projectId, row.row_index, "completed");
      setStatuses((prev) => new Map(prev).set(row.row_index, "completed"));
      goNext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save annotation");
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
  // Quadruple state — kept locally, posted on Complete
  // -------------------------------------------------------------------------

  const [pendingQuadruples, setPendingQuadruples] = useState<LocalQuadruple[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Reset pending quadruples when moving to a different row.
  // currentIndex is intentionally omitted — biome treats setter functions as stable.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on row change only
  useEffect(() => {
    setPendingQuadruples([]);
  }, [currentIndex]);

  function handleQuadrupleAdded(quadruple: LocalQuadruple) {
    setPendingQuadruples((prev) => [...prev, quadruple]);
  }

  function handleDeleteQuadruple(quadrupleId: string) {
    setDeletingId(quadrupleId);
    setPendingQuadruples((prev) => prev.filter((q) => q.id !== quadrupleId));
    setDeletingId(null);
  }

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const currentRow = csvRows[currentIndex] ?? null;
  const currentStatus = currentRow ? (statuses.get(currentRow.row_index) ?? "pending") : "pending";
  // Annotations already saved to D1 for this row
  const savedAnnotations = currentRow
    ? annotations.filter((a) => a.row_index === currentRow.row_index)
    : [];

  const completedCount = [...statuses.values()].filter((s) => s === "completed").length;
  const totalRows = csvRows.length;
  const allDone = totalRows > 0 && completedCount === totalRows;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
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
            {completedCount} / {totalRows} completed
          </span>
          <span className="text-xs text-gray-400">Row #{currentRow.row_index + 1}</span>
          {currentStatus !== "pending" && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                currentStatus === "completed"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {currentStatus}
            </span>
          )}
        </div>
      </div>

      {/* Row text */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Row text</p>
        <p className="text-sm leading-relaxed text-gray-900">{currentRow.text}</p>
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

      {/* Pending (unsaved) quadruples added in this session */}
      {pendingQuadruples.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Pending quadruples ({pendingQuadruples.length})
          </p>
          <ul className="space-y-2">
            {pendingQuadruples.map((q) => (
              <li
                key={q.id}
                className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5 text-gray-700 min-w-0">
                    <p>
                      <span className="text-gray-400">Aspect:</span> {q.aspect_term}
                    </p>
                    <p>
                      <span className="text-gray-400">Opinion:</span> {q.opinion_term}
                    </p>
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
                    disabled={deletingId === q.id}
                    onClick={() => handleDeleteQuadruple(q.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quadruple form */}
      <QuadrupleForm
        projectId={projectId ?? ""}
        rowId={`local-${currentRow.row_index}`}
        rowText={currentRow.text}
        existingQuadruples={pendingQuadruples}
        onAdd={handleQuadrupleAdded}
      />

      {/* Navigation + actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0 || saving}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          ← Prev
        </button>

        <button
          type="button"
          onClick={() => void handleSkip()}
          disabled={saving}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Skip
        </button>

        <button
          type="button"
          onClick={() => void handleComplete(pendingQuadruples)}
          disabled={pendingQuadruples.length === 0 || saving}
          className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Complete & next"}
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex >= csvRows.length - 1 || saving}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
