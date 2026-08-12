import type { Quadruple } from "@acostator/shared";
import { useCallback, useRef } from "react";

export interface TextSpan {
  text: string;
  start: number;
  end: number;
}

// One color palette entry: Tailwind bg + text classes for mark, and a hex/css
// color for the annotation list dot indicator.
export interface AnnotationColor {
  mark: string; // e.g. "bg-blue-200 text-blue-900"
  dot: string; // e.g. "bg-blue-400"
  border: string; // e.g. "border-blue-300"
}

/** Rotating palette — up to 8 distinct colors per row. */
export const ANNOTATION_COLORS: AnnotationColor[] = [
  { mark: "bg-orange-200 text-orange-900", dot: "bg-orange-400", border: "border-orange-300" },
  { mark: "bg-violet-200 text-violet-900", dot: "bg-violet-400", border: "border-violet-300" },
  { mark: "bg-rose-200 text-rose-900", dot: "bg-rose-400", border: "border-rose-300" },
  { mark: "bg-cyan-200 text-cyan-900", dot: "bg-cyan-400", border: "border-cyan-300" },
  { mark: "bg-amber-200 text-amber-900", dot: "bg-amber-400", border: "border-amber-300" },
  { mark: "bg-pink-200 text-pink-900", dot: "bg-pink-400", border: "border-pink-300" },
  { mark: "bg-blue-200 text-blue-900", dot: "bg-blue-400", border: "border-blue-300" },
  { mark: "bg-emerald-200 text-emerald-900", dot: "bg-emerald-400", border: "border-emerald-300" },
];

export function getAnnotationColor(index: number): AnnotationColor {
  return ANNOTATION_COLORS[index % ANNOTATION_COLORS.length] as AnnotationColor;
}

interface HighlightedSpan {
  start: number;
  end: number;
  // index into ANNOTATION_COLORS for saved quadruples, or "active-aspect" /
  // "active-opinion" for the in-progress selection
  colorKey: number | "active-aspect" | "active-opinion";
}

interface TextHighlighterProps {
  text: string;
  onSelect: (span: TextSpan) => void;
  /** Existing quadruples to highlight already-annotated spans */
  existingQuadruples?: Quadruple[];
  /** Highlight the active aspect selection */
  aspectSpan?: TextSpan | null;
  /** Highlight the active opinion selection */
  opinionSpan?: TextSpan | null;
  label: string;
}

/**
 * Renders row text and lets the user click+drag to select a span.
 * Calls onSelect with { text, start, end } on mouseup over a selection.
 * Highlights existing quadruple spans with per-quadruple colors and the
 * active aspect/opinion selection in a distinct in-progress style.
 */
export function TextHighlighter({
  text,
  onSelect,
  existingQuadruples = [],
  aspectSpan,
  opinionSpan,
  label,
}: TextHighlighterProps) {
  const containerRef = useRef<HTMLParagraphElement>(null);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    // Calculate character offsets relative to the text content of the container
    const preRange = document.createRange();
    preRange.setStart(container, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const selectedText = range.toString();
    const end = start + selectedText.length;

    if (selectedText.length === 0) return;

    onSelect({ text: selectedText, start, end });
    selection.removeAllRanges();
  }, [onSelect]);

  // Build list of highlights: saved quadruples (per-index color) + active
  // aspect/opinion selections (fixed in-progress style)
  const highlights: HighlightedSpan[] = [];

  existingQuadruples.forEach((q, idx) => {
    if (q.aspect_start != null && q.aspect_end != null) {
      highlights.push({ start: q.aspect_start, end: q.aspect_end, colorKey: idx });
    }
    if (q.opinion_start != null && q.opinion_end != null) {
      highlights.push({ start: q.opinion_start, end: q.opinion_end, colorKey: idx });
    }
  });

  if (aspectSpan) {
    highlights.push({
      start: aspectSpan.start,
      end: aspectSpan.end,
      colorKey: "active-aspect",
    });
  }
  if (opinionSpan) {
    highlights.push({
      start: opinionSpan.start,
      end: opinionSpan.end,
      colorKey: "active-opinion",
    });
  }

  const segments = buildSegments(text, highlights);

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed select-text cursor-text"
        aria-label={`Text for ${label} selection`}
      >
        {segments.map((seg) => {
          if (seg.colorKey === null) {
            return <span key={seg.start}>{seg.text}</span>;
          }
          if (seg.colorKey === "active-aspect") {
            return (
              <mark
                key={seg.start}
                className="bg-blue-200 text-blue-900 rounded px-0.5 ring-1 ring-blue-400"
                aria-label="aspect selection"
              >
                {seg.text}
              </mark>
            );
          }
          if (seg.colorKey === "active-opinion") {
            return (
              <mark
                key={seg.start}
                className="bg-emerald-200 text-emerald-900 rounded px-0.5 ring-1 ring-emerald-400"
                aria-label="opinion selection"
              >
                {seg.text}
              </mark>
            );
          }
          const color = getAnnotationColor(seg.colorKey);
          return (
            <mark
              key={seg.start}
              className={`${color.mark} rounded px-0.5`}
              aria-label={`annotation ${seg.colorKey + 1} highlight`}
            >
              {seg.text}
            </mark>
          );
        })}
      </p>
      <p className="text-xs text-gray-400">Click and drag to select text</p>
    </div>
  );
}

interface Segment {
  text: string;
  colorKey: number | "active-aspect" | "active-opinion" | null;
  start: number;
}

/**
 * Splits the text into segments based on highlight ranges.
 * Later highlights in the array win over earlier ones for overlapping ranges.
 */
function buildSegments(text: string, highlights: HighlightedSpan[]): Segment[] {
  if (highlights.length === 0) {
    return [{ text, colorKey: null, start: 0 }];
  }

  // Build a per-character color map; last highlight wins for overlaps
  const colorMap: Array<number | "active-aspect" | "active-opinion" | null> = Array(
    text.length
  ).fill(null);

  for (const h of highlights) {
    const start = Math.max(0, h.start);
    const end = Math.min(text.length, h.end);
    for (let i = start; i < end; i++) {
      colorMap[i] = h.colorKey;
    }
  }

  // Collapse consecutive characters with the same colorKey into segments
  const segments: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const colorKey = colorMap[i] ?? null;
    let j = i + 1;
    while (j < text.length && (colorMap[j] ?? null) === colorKey) {
      j++;
    }
    segments.push({ text: text.slice(i, j), colorKey, start: i });
    i = j;
  }

  return segments;
}
