import { api } from "@/lib/api.ts";
import type { Quadruple, Sentiment } from "@acostator/shared";
import { useState } from "react";
import { CategoryPicker } from "./CategoryPicker.tsx";
import { TextHighlighter, type TextSpan } from "./TextHighlighter.tsx";

interface CategoryOption {
  id: string;
  name: string;
}

interface CreateQuadrupleResponse {
  data: Quadruple;
}

interface QuadrupleFormProps {
  projectId: string;
  rowId: string;
  rowText: string;
  existingQuadruples: Quadruple[];
  onAdd: (quadruple: Quadruple) => void;
}

const SENTIMENTS: { value: Sentiment; label: string; color: string }[] = [
  { value: "positive", label: "Positive", color: "text-green-700" },
  { value: "neutral", label: "Neutral", color: "text-gray-600" },
  { value: "negative", label: "Negative", color: "text-red-700" },
  { value: "mixed", label: "Mixed", color: "text-yellow-700" },
];

/**
 * Form for adding ACOS quadruples to a row.
 * Integrates TextHighlighter (aspect + opinion), CategoryPicker, and sentiment radios.
 */
export function QuadrupleForm({
  projectId,
  rowId,
  rowText,
  existingQuadruples,
  onAdd,
}: QuadrupleFormProps) {
  const [aspectSpan, setAspectSpan] = useState<TextSpan | null>(null);
  const [aspectImplicit, setAspectImplicit] = useState(false);
  const [opinionSpan, setOpinionSpan] = useState<TextSpan | null>(null);
  const [opinionImplicit, setOpinionImplicit] = useState(false);
  const [category, setCategory] = useState<CategoryOption | null>(null);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which field is the text highlighter currently targeting
  const [highlightTarget, setHighlightTarget] = useState<"aspect" | "opinion">("aspect");

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const aspectTerm = aspectImplicit ? "NULL" : aspectSpan?.text ?? "";
    const opinionTerm = opinionImplicit ? "NULL" : opinionSpan?.text ?? "";

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

    setSubmitting(true);
    try {
      const body = {
        aspect_term: aspectTerm,
        aspect_implicit: aspectImplicit,
        aspect_start: aspectImplicit ? null : (aspectSpan?.start ?? null),
        aspect_end: aspectImplicit ? null : (aspectSpan?.end ?? null),
        category_id: category.id,
        opinion_term: opinionTerm,
        opinion_implicit: opinionImplicit,
        opinion_start: opinionImplicit ? null : (opinionSpan?.start ?? null),
        opinion_end: opinionImplicit ? null : (opinionSpan?.end ?? null),
        sentiment,
      };

      const res = await api.post<CreateQuadrupleResponse>(
        `/projects/${projectId}/rows/${rowId}/quadruples`,
        body
      );
      onAdd(res.data);
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add quadruple.");
    } finally {
      setSubmitting(false);
    }
  }

  const isValid =
    (aspectImplicit || aspectSpan !== null) &&
    category !== null &&
    (opinionImplicit || opinionSpan !== null) &&
    sentiment !== null;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">Add quadruple</h3>

      {/* Text highlighter — shared for aspect and opinion */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setHighlightTarget("aspect")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              highlightTarget === "opinion"
                ? "bg-green-100 text-green-800 ring-1 ring-green-300"
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
            {aspectImplicit
              ? "Implicit"
              : aspectSpan
              ? aspectSpan.text
              : "Highlight text above..."}
          </span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={aspectImplicit}
              onChange={(e) => {
                setAspectImplicit(e.target.checked);
                if (e.target.checked) setAspectSpan(null);
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
      <CategoryPicker
        projectId={projectId}
        value={category}
        onChange={setCategory}
      />

      {/* Opinion term */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Opinion term</p>
        <div className="flex items-center gap-3">
          <span
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              opinionSpan && !opinionImplicit
                ? "border-green-200 bg-green-50 text-green-900"
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
                if (e.target.checked) setOpinionSpan(null);
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
        <div className="flex gap-3 flex-wrap">
          {SENTIMENTS.map(({ value, label, color }) => (
            <label
              key={value}
              className="flex items-center gap-1.5 cursor-pointer select-none"
            >
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
          type="submit"
          disabled={!isValid || submitting}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "Adding..." : "Add quadruple"}
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
