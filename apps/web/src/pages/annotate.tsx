import { type LocalAnnotation, QuadrupleForm } from "@/components/QuadrupleForm.tsx";
import { getAnnotationColor } from "@/components/TextHighlighter.tsx";
import { api } from "@/lib/api.ts";
import type { Annotation } from "@/lib/api.ts";
import {
  type CsvRow,
  type LocalAnnotationRecord,
  type RowLocalStatus,
  getAllRowStatuses,
  getCSVRows,
  getLocalAnnotations,
  hasCachedCSV,
  loadProgress,
  saveCSVRows,
  saveLocalAnnotations,
  saveProgress,
  setRowStatus,
} from "@/lib/indexeddb.ts";
import type { Quadruple } from "@acostator/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

// ---------------------------------------------------------------------------
// Feature flag — flip to true once the backend annotation-crud task is merged
// ---------------------------------------------------------------------------
const BACKEND_HAS_STATUS = false;

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

type SyncStatus = "idle" | "syncing" | "synced" | "error";

/** Convert a LocalAnnotation (form shape) to a LocalAnnotationRecord (IDB shape). */
function toIdbRecord(a: LocalAnnotation, rowIndex: number): LocalAnnotationRecord {
  const rec: LocalAnnotationRecord = {
    local_id: a.localId,
    row_index: rowIndex,
    aspect: a.aspectTerm,
    category_id: a.categoryId,
    category: a.categoryName,
    opinion: a.opinionTerm,
    sentiment: a.sentiment as "positive" | "negative" | "neutral" | "mixed",
    aspect_implicit: a.aspectImplicit,
    aspect_start: a.aspectStart,
    aspect_end: a.aspectEnd,
    opinion_implicit: a.opinionImplicit,
    opinion_start: a.opinionStart,
    opinion_end: a.opinionEnd,
  };
  return rec;
}

/** Convert a LocalAnnotationRecord (IDB shape) back to LocalAnnotation (form shape). */
function fromIdbRecord(r: LocalAnnotationRecord): LocalAnnotation {
  return {
    localId: r.local_id,
    aspectTerm: r.aspect,
    aspectImplicit: r.aspect_implicit,
    aspectStart: r.aspect_start,
    aspectEnd: r.aspect_end,
    categoryId: r.category_id,
    categoryName: r.category,
    opinionTerm: r.opinion,
    opinionImplicit: r.opinion_implicit,
    opinionStart: r.opinion_start,
    opinionEnd: r.opinion_end,
    sentiment: r.sentiment,
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
  const [saving, setSaving] = useState(false);

  // Sync indicator state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  // isDirty: true when local annotations differ from last server state
  const [isDirty, setIsDirty] = useState(false);

  const csvRowsRef = useRef<CsvRow[]>([]);
  csvRowsRef.current = csvRows;
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // Local annotation state — reset on row change
  // -------------------------------------------------------------------------

  const [pendingAnnotations, setPendingAnnotations] = useState<LocalAnnotation[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<LocalAnnotation | null>(null);

  // isFormOpen: true when no annotations yet for this row, false otherwise
  const [isFormOpen, setIsFormOpen] = useState(true);

  // Reset pending list, edit state, and form visibility when navigating to a new row.
  // Form starts open iff there are no local annotations cached for the destination row.
  // Falls back to server fetch for completed rows where IDB is empty.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    void (async () => {
      const cached = await getLocalAnnotations(projectId, currentIndex);
      if (cancelled) return;

      // IDB has data — use directly
      if (cached.length > 0) {
        setPendingAnnotations(cached.map(fromIdbRecord));
        setEditingAnnotation(null);
        setIsFormOpen(false);
        return;
      }

      // IDB empty + row already completed → fallback fetch from server
      const rowStatus = statuses.get(currentIndex);
      if (rowStatus === "completed") {
        try {
          const res = await api.getAnnotationsByRow(projectId, currentIndex);
          if (!cancelled && res.data.length > 0) {
            const idbRecords: LocalAnnotationRecord[] = res.data.map((a: Annotation) => {
              const rec: LocalAnnotationRecord = {
                local_id: a.aspect,
                row_index: a.row_index,
                aspect: a.aspect,
                category_id: "",
                category: a.category,
                opinion: a.opinion,
                sentiment: a.sentiment as "positive" | "negative" | "neutral" | "mixed",
                aspect_implicit: false,
                aspect_start: null,
                aspect_end: null,
                opinion_implicit: false,
                opinion_start: null,
                opinion_end: null,
                server_id: a.id,
              };
              return rec;
            });
            await saveLocalAnnotations(projectId, currentIndex, idbRecords);
            if (!cancelled) {
              setPendingAnnotations(idbRecords.map(fromIdbRecord));
              setEditingAnnotation(null);
              setIsFormOpen(false);
              setIsDirty(false);
            }
            return;
          }
        } catch {
          // silent — fall through to empty state
        }
      }

      // No data at all → open form empty
      if (!cancelled) {
        setPendingAnnotations([]);
        setEditingAnnotation(null);
        setIsFormOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentIndex, projectId, statuses]);

  function handleAnnotationAdded(annotation: LocalAnnotation) {
    setPendingAnnotations((prev) => {
      const next = [...prev, annotation];
      // Persist to IDB and mark dirty
      if (projectId) {
        void saveLocalAnnotations(
          projectId,
          currentIndex,
          next.map((a) => toIdbRecord(a, currentIndex))
        );
      }
      return next;
    });
    setIsDirty(true);
    setIsFormOpen(false);
  }

  function handleAnnotationUpdated(annotation: LocalAnnotation) {
    setPendingAnnotations((prev) => {
      const next = prev.map((a) => (a.localId === annotation.localId ? annotation : a));
      if (projectId) {
        void saveLocalAnnotations(
          projectId,
          currentIndex,
          next.map((a) => toIdbRecord(a, currentIndex))
        );
      }
      return next;
    });
    setEditingAnnotation(null);
    setIsDirty(true);
  }

  function handleDeleteAnnotation(localId: string) {
    setPendingAnnotations((prev) => {
      const next = prev.filter((a) => a.localId !== localId);
      if (projectId) {
        void saveLocalAnnotations(
          projectId,
          currentIndex,
          next.map((a) => toIdbRecord(a, currentIndex))
        );
      }
      return next;
    });
    if (editingAnnotation?.localId === localId) {
      setEditingAnnotation(null);
    }
    setIsDirty(true);
  }

  function handleEditAnnotation(annotation: LocalAnnotation) {
    setEditingAnnotation(annotation);
  }

  function handleCancelEdit() {
    setEditingAnnotation(null);
  }

  // -------------------------------------------------------------------------
  // handleNext — save local, move row, fire-and-forget draft sync
  // -------------------------------------------------------------------------

  async function handleNext() {
    if (!projectId) return;
    const rows = csvRowsRef.current;
    if (currentIndex >= rows.length - 1) return;

    // 1. Annotations already persisted to IDB on every add/edit/delete.
    //    Nothing extra needed here.

    // 2. Move to next row immediately
    setCurrentIndex(currentIndex + 1);

    // 3. Fire-and-forget background sync (draft) — only if there's something to sync
    if (pendingAnnotations.length === 0) return;

    setSyncStatus("syncing");

    void (async () => {
      try {
        if (BACKEND_HAS_STATUS) {
          await Promise.all(
            pendingAnnotations.map((a) =>
              api.postAnnotation(projectId, {
                row_index: currentIndex,
                aspect: a.aspectTerm,
                category: a.categoryName,
                opinion: a.opinionTerm,
                sentiment: a.sentiment,
                status: "draft",
              })
            )
          );
        } else {
          await Promise.all(
            pendingAnnotations.map((a) =>
              api.postAnnotation(projectId, {
                row_index: currentIndex,
                aspect: a.aspectTerm,
                category: a.categoryName,
                opinion: a.opinionTerm,
                sentiment: a.sentiment,
              })
            )
          );
        }

        setSyncStatus("synced");
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => setSyncStatus("idle"), 2000);
      } catch {
        setSyncStatus("error");
      }
    })();
  }

  // -------------------------------------------------------------------------
  // handlePrevious — save local, move row, load IDB then optionally server
  // -------------------------------------------------------------------------

  async function handlePrevious() {
    if (!projectId || currentIndex === 0 || saving) return;
    // Move to previous row — useEffect handles IDB load + server fallback for completed rows
    setCurrentIndex(currentIndex - 1);
  }

  // -------------------------------------------------------------------------
  // handleComplete — reconcile local vs server, mark completed, advance
  // -------------------------------------------------------------------------

  async function handleComplete() {
    if (!projectId) return;
    setSaving(true);

    try {
      if (BACKEND_HAS_STATUS) {
        // Full reconcile mode
        const serverRes = await api.getAnnotationsByRow(projectId, currentIndex);
        const serverAnnotations = serverRes.data;

        // Build lookup maps by aspect (natural key)
        const serverByAspect = new Map(serverAnnotations.map((a) => [a.aspect, a]));
        const localByAspect = new Map(pendingAnnotations.map((a) => [a.aspectTerm, a]));

        const ops: Promise<unknown>[] = [];

        // Local items not on server → POST as completed
        for (const [aspect, local] of localByAspect) {
          const serverMatch = serverByAspect.get(aspect);
          if (!serverMatch) {
            ops.push(
              api.postAnnotation(projectId, {
                row_index: currentIndex,
                aspect: local.aspectTerm,
                category: local.categoryName,
                opinion: local.opinionTerm,
                sentiment: local.sentiment,
                status: "completed",
              })
            );
          } else {
            // Both exist — check if data differs → PUT as completed
            const differs =
              local.categoryName !== serverMatch.category ||
              local.opinionTerm !== serverMatch.opinion ||
              local.sentiment !== serverMatch.sentiment;
            if (differs || serverMatch.status !== "completed") {
              ops.push(
                api.putAnnotation(projectId, serverMatch.id, {
                  category: local.categoryName,
                  opinion: local.opinionTerm,
                  sentiment: local.sentiment,
                  status: "completed",
                })
              );
            }
          }
        }

        // Server items not in local → DELETE
        for (const [aspect, serverAnn] of serverByAspect) {
          if (!localByAspect.has(aspect)) {
            ops.push(api.deleteAnnotation(projectId, serverAnn.id));
          }
        }

        await Promise.all(ops);
      } else {
        // Simplified mode — just POST all local annotations
        await Promise.all(
          pendingAnnotations.map((a) =>
            api.postAnnotation(projectId, {
              row_index: currentIndex,
              aspect: a.aspectTerm,
              category: a.categoryName,
              opinion: a.opinionTerm,
              sentiment: a.sentiment,
            })
          )
        );
      }

      // Mark row completed locally
      await setRowStatus(projectId, currentIndex, "completed");
      setStatuses((prev) => new Map(prev).set(currentIndex, "completed"));

      // Persist completed annotations ke IDB supaya bisa di-load saat balik via Previous
      await saveLocalAnnotations(
        projectId,
        currentIndex,
        pendingAnnotations.map((a) => toIdbRecord(a, currentIndex))
      );

      setIsDirty(false);

      // Advance to next row
      const rows = csvRowsRef.current;
      if (currentIndex < rows.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save annotations");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const totalRows = csvRows.length;
  const completedCount = [...statuses.values()].filter((s) => s === "completed").length;
  const currentRow = csvRows[currentIndex];
  const currentStatus = statuses.get(currentIndex) ?? "pending";

  // Complete button visibility:
  // Hide when row is already completed AND not dirty.
  // Show in all other cases.
  const showComplete = !(currentStatus === "completed" && !isDirty);

  // Build Quadruple[] from pendingAnnotations so TextHighlighter can render
  // existing span highlights for the current row.
  // Exclude the annotation currently being edited — its spans are rendered
  // via the form's own aspectSpan/opinionSpan active selection state.
  const noServerQuadruples: Quadruple[] = pendingAnnotations
    .filter((a) => a.localId !== editingAnnotation?.localId)
    .map((a) => ({
      id: a.localId,
      row_id: "",
      project_id: projectId ?? "",
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
      created_at: "",
      updated_at: "",
    }));

  // -------------------------------------------------------------------------
  // Render states
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

  if (!currentRow) {
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
          Row {currentIndex + 1}
        </p>
        <p className="text-sm text-gray-800 leading-relaxed">{currentRow.text}</p>
      </div>

      {/* Pending annotations — with per-entry color dot, edit, delete */}
      {pendingAnnotations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Annotations ({pendingAnnotations.length})
          </p>
          <ul className="space-y-2">
            {pendingAnnotations.map((a, idx) => {
              const color = getAnnotationColor(idx);
              const isBeingEdited = editingAnnotation?.localId === a.localId;
              return (
                <li
                  key={a.localId}
                  className={`rounded-lg border px-4 py-3 text-sm border-gray-200 bg-white ${
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
        existingQuadruples={noServerQuadruples}
        isFormOpen={isFormOpen}
        onOpenForm={() => setIsFormOpen(true)}
        onCloseForm={() => setIsFormOpen(false)}
        editingQuadruple={editingAnnotation}
        onAdd={handleAnnotationAdded}
        onUpdate={handleAnnotationUpdated}
        onCancelEdit={handleCancelEdit}
      />

      {/* Sync indicator — shown above action buttons */}
      {syncStatus !== "idle" && (
        <div className="flex items-center gap-1.5" aria-live="polite">
          {syncStatus === "syncing" && (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
              <span className="text-xs text-gray-400">syncing...</span>
            </>
          )}
          {syncStatus === "synced" && (
            <>
              <svg
                className="h-3.5 w-3.5 text-green-500"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs text-green-600">saved</span>
            </>
          )}
          {syncStatus === "error" && (
            <span
              className="inline-block h-2 w-2 rounded-full bg-red-400"
              aria-label="sync error"
            />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handlePrevious()}
          disabled={currentIndex === 0 || saving}
          className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          ← Previous
        </button>

        <button
          type="button"
          onClick={() => void handleNext()}
          disabled={saving || currentIndex >= csvRows.length - 1}
          className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Next →
        </button>

        {showComplete && (
          <button
            type="button"
            onClick={() => void handleComplete()}
            disabled={saving}
            className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "✓ Complete"}
          </button>
        )}
      </div>
    </div>
  );
}
