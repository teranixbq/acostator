import type { Quadruple } from "@acostator/shared";
import { useCallback, useRef } from "react";

export interface TextSpan {
  text: string;
  start: number;
  end: number;
}

interface HighlightedSpan {
  start: number;
  end: number;
  color: "aspect" | "opinion";
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
 * Highlights existing quadruple spans and the active aspect/opinion selection.
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

  // Build list of highlights to render: existing quadruples + active selections
  const highlights: HighlightedSpan[] = [
    ...existingQuadruples
      .filter((q) => q.aspect_start != null && q.aspect_end != null)
      .map((q) => ({
        start: q.aspect_start as number,
        end: q.aspect_end as number,
        color: "aspect" as const,
      })),
    ...existingQuadruples
      .filter((q) => q.opinion_start != null && q.opinion_end != null)
      .map((q) => ({
        start: q.opinion_start as number,
        end: q.opinion_end as number,
        color: "opinion" as const,
      })),
    ...(aspectSpan
      ? [{ start: aspectSpan.start, end: aspectSpan.end, color: "aspect" as const }]
      : []),
    ...(opinionSpan
      ? [{ start: opinionSpan.start, end: opinionSpan.end, color: "opinion" as const }]
      : []),
  ];

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
          if (seg.color === "aspect") {
            return (
              <mark
                key={seg.start}
                className="bg-blue-200 text-blue-900 rounded px-0.5"
                aria-label="aspect highlight"
              >
                {seg.text}
              </mark>
            );
          }
          if (seg.color === "opinion") {
            return (
              <mark
                key={seg.start}
                className="bg-green-200 text-green-900 rounded px-0.5"
                aria-label="opinion highlight"
              >
                {seg.text}
              </mark>
            );
          }
          return <span key={seg.start}>{seg.text}</span>;
        })}
      </p>
      <p className="text-xs text-gray-400">Click and drag to select text</p>
    </div>
  );
}

interface Segment {
  text: string;
  color: "aspect" | "opinion" | null;
  start: number;
}

/**
 * Splits the text into segments based on highlight ranges.
 * Later highlights in the array win over earlier ones for overlapping ranges.
 */
function buildSegments(text: string, highlights: HighlightedSpan[]): Segment[] {
  if (highlights.length === 0) {
    return [{ text, color: null }];
  }

  // Build a per-character color map; last highlight wins for overlaps
  const colorMap: Array<"aspect" | "opinion" | null> = Array(text.length).fill(null);
  for (const h of highlights) {
    const start = Math.max(0, h.start);
    const end = Math.min(text.length, h.end);
    for (let i = start; i < end; i++) {
      colorMap[i] = h.color;
    }
  }

  // Collapse consecutive characters with the same color into segments
  const segments: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const color = colorMap[i] ?? null;
    let j = i + 1;
    while (j < text.length && (colorMap[j] ?? null) === color) {
      j++;
    }
    segments.push({ text: text.slice(i, j), color, start: i });
    i = j;
  }

  return segments;
}
