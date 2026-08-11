import type { Quadruple, Sentiment } from "@acostator/shared";
import { useEffect, useState } from "react";
import { CategoryPicker } from "./CategoryPicker.tsx";
import { TextHighlighter, type TextSpan } from "./TextHighlighter.tsx";

interface CategoryOption {
  id: string;
  name: string;
}

interface QuadrupleFormProps {
  projectId: string;
  rowText: string;
  existingQuadruples: Quadruple[];
  /** If set, the form is in edit mode — fields are pre-populated. */
  editingQuadruple?: LocalAnnotation | null;
  onAdd: (annotation: LocalAnnotation) => void;
  onUpdate: (annotation: LocalAnnotation) => void;
  onCancelEdit: () => void;
}

/** A quadruple that lives entirely in local state (no server id yet). */
export interface LocalAnnotation {
  /** Stable client-side id so list keys are stable */
  localId: string;
  aspectTerm: string;
  aspectImplicit: boolean;
  aspectStart: number | null;
  aspectEnd: number | null;
  opinionTerm: string;
  opinionImplicit: boolean;
  opinionStart: number | null;
  opinionEnd: number | null;
  categoryId: string;
  categoryName: string;
  sentiment: Sentiment;
}

const SENTIMENTS: { value: Sentiment; label: string; color: string }[] = [
  { value: "positive", label: "Positive", color: "text-green-700" },
  { value: "neutral", label: "Neutral", color: "text-gray-600" },
  { value: "negative", label: "Negative", color: "text-red-700" },
  { value: "mixed", label: "Mixed", color: "text-yellow-700" },
];

/**
 * Form for adding / editing local ACOS annotations.
 * Does NOT call the server — all data is returned via onAdd / onUpdate.
 */
export function QuadrupleForm({
  projectId,
  rowText,
  existingQuadruples,
  editingQuadruple,
  onAdd,
  onUpdate,
  onCancelEdit,
}: QuadrupleFormProps) {
  const [aspectSpan, setAspectSpan] = useState<TextSpan | null>(null);
  const [aspectImplicit, setAspectImplicit] = useState(false);
  const [opinionSpan, setOpinionSpan] = useState<TextSpan | null>(null);
  const [opinionImplicit, setOpinionImplicit] = useState(false);
  const [category, setCategory] = useState<CategoryOption | null>(null);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Which field is the text highlighter currently targeting
  const [highlightTarget, setHighlightTarget] = useState<"aspect" | "opinion">("aspect");

  const isEditing = editingQuadruple != null;

  // When editingQuadruple changes, populate the form fields
  useEffect(() => {
    if (editingQuadruple) {
      setAspectImplicit(editingQuadruple.aspectImplicit);
      setAspectSpan(
        editingQuadruple.aspectImplicit ||
          editingQuadruple.aspectStart == null ||
          editingQuadruple.aspectEnd == null
          ? null
          : {
              text: editingQuadruple.aspectTerm,
              start: editingQuadruple.aspectStart,
              end: editingQuadruple.aspectEnd,
            }
      );
      setOpinionImplicit(editingQuadruple.opinionImplicit);
      setOpinionSpan(
        editingQuadruple.opinionImplicit ||
          editingQuadruple.opinionStart == null ||
          editingQuadruple.opinionEnd == null
          ? null
          : {
              text: editingQuadruple.opinionTerm,
              start: editingQuadruple.opinionStart,
              end: editingQuadruple.opinionEnd,
            }
      );
      setCategory({ id: editingQuadruple.categoryId, name: editingQuadruple.categoryName });
      setSentiment(editingQuadruple.sentiment);
      setHighlightTarget("aspect");
      setError(null);
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingQuadruple]);

  function handleTextSelect(span: TextSpan) {
    if (highlightTarget === "aspect") {
      setAspectSpan(span);
      setAspectImplicit(false);
    } else {
      setOpinionSpan(span);
      setOpinionImplicit(false);
    }
  }

  function resetForm() {
    setAspectSpan(null);
    setAspectImplicit(false);
    setOpinionSpan(null);
    setOpinionImplicit(false);
    setCategory(null);
    setSentiment(null);
    setHighlightTarget("aspect");
    setError(null);
  }

  function handleSubmit() {
    setError(null);

    const aspectTerm = aspectImplicit ? "NULL" : (aspectSpan?.text ?? "");
    const opinionTerm = opinionImplicit ? "NULL" : (opinionSpan?.text ?? "");

    if (!aspectTerm) {
      setError("Select an aspect term or mark it as implicit.");
      return;
    }
    if (!category) {
      setError("Select or create a category.");
      return;
    }
    if (!opinionTerm) {
      setError("Select an opinion term or mark it as implicit.");
      return;
    }
    if (!sentiment) {
      setError("Select a sentiment.");
      return;
    }

    const annotation: LocalAnnotation = {
      localId: editingQuadruple?.localId ?? crypto.randomUUID(),
      aspectTerm,
      aspectImplicit,
      aspectStart: aspectImplicit ? null : (aspectSpan?.start ?? null),
      aspectEnd: aspectImplicit ? null : (aspectSpan?.end ?? null),
      opinionTerm,
      opinionImplicit,
      opinionStart: opinionImplicit ? null : (opinionSpan?.start ?? null),
      opinionEnd: opinionImplicit ? null : (opinionSpan?.end ?? null),
      categoryId: category.id,
      categoryName: category.name,
      sentiment,
    };

    if (isEditing) {
      onUpdate(annotation);
    } else {
      onAdd(annotation);
      resetForm();
    }
  }

  const isValid =
    (aspectImplicit || aspectSpan !== null) &&
    category !== null &&
    (opinionImplicit || opinionSpan !== null) &&
    sentiment !== null;

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="space-y-5 rounded-xl border border-gray-200 bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {isEditing ? "Edit annotation" : "New annotation"}
        </h3>
        {isEditing && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel edit
          </button>
        )}
      </div>

      {/* Text highlighter — shared for aspect and opinion */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setHighlightTarget("aspect")}
            disabled={aspectImplicit}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              highlightTarget === "aspect"
                ? "bg-blue-100 text-blue-800 ring-1 ring-blue-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Selecting: Aspect
          </button>
          <button
            type="button"
            onClick={() => setHighlightTarget("opinion")}
            disabled={opinionImplicit}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              highlightTarget === "opinion"
                ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Selecting: Opinion
          </button>
        </div>

        <TextHighlighter
          text={rowText}
          onSelect={handleTextSelect}
          existingQuadruples={existingQuadruples}
          aspectSpan={aspectSpan}
          opinionSpan={opinionSpan}
          label="Row text"
        />
      </div>

      {/* Aspect term */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Aspect term</p>
        <div className="flex items-center gap-3">
          <span
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              aspectSpan && !aspectImplicit
                ? "border-blue-200 bg-blue-50 text-blue-900"
                : "border-gray-200 bg-gray-50 text-gray-400"
            }`}
          >
            {aspectImplicit ? "Implicit" : aspectSpan ? aspectSpan.text : "Highlight text above..."}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={aspectImplicit}
              onChange={(e) => {
                setAspectImplicit(e.target.checked);
                if (e.target.checked) {
                  setAspectSpan(null);
                  setHighlightTarget("opinion");
                }
              }}
              className="rounded"
            />
            Implicit
          </label>
          {aspectSpan && !aspectImplicit && (
            <button
              type="button"
              onClick={() => setAspectSpan(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
              aria-label="Clear aspect selection"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Category */}
      <CategoryPicker projectId={projectId} value={category} onChange={setCategory} />

      {/* Opinion term */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Opinion term</p>
        <div className="flex items-center gap-3">
          <span
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              opinionSpan && !opinionImplicit
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-gray-200 bg-gray-50 text-gray-400"
            }`}
          >
            {opinionImplicit
              ? "Implicit"
              : opinionSpan
                ? opinionSpan.text
                : "Highlight text above..."}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={opinionImplicit}
              onChange={(e) => {
                setOpinionImplicit(e.target.checked);
                if (e.target.checked) {
                  setOpinionSpan(null);
                  setHighlightTarget("aspect");
                }
              }}
              className="rounded"
            />
            Implicit
          </label>
          {opinionSpan && !opinionImplicit && (
            <button
              type="button"
              onClick={() => setOpinionSpan(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
              aria-label="Clear opinion selection"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Sentiment */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sentiment</p>
        <div className="flex flex-wrap gap-4">
          {SENTIMENTS.map(({ value, label, color }) => (
            <label key={value} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="sentiment"
                value={value}
                checked={sentiment === value}
                onChange={() => setSentiment(value)}
                className="accent-gray-900"
              />
              <span className={`text-sm ${color}`}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isEditing ? "Save changes" : "+ Add annotation"}
        </button>
        <button
          type="button"
          onClick={resetForm}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Reset
        </button>
      </div>
    </form>
  );
}
