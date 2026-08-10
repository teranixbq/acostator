# Task 004 — Quadruple Annotation Form

## Status
[ ] Not started

## Dependencies
None (can run in parallel with 001, 003, 005)

## Files touched
- `apps/web/src/pages/annotate.tsx`
- `apps/web/src/components/QuadrupleForm.tsx` (new)
- `apps/web/src/components/TextHighlighter.tsx` (new)
- `apps/web/src/components/CategoryPicker.tsx` (new)

## Gap
`annotate.tsx` shows the current row and existing quadruples but has no form
to add new quadruples. The page is read-only.

## Goal
Implement the ACOS quadruple annotation form:
- Aspect term: text selection from the row text
- Category: searchable dropdown backed by `GET /projects/:id/categories`
- Opinion term: text selection from the row text
- Sentiment: radio (positive / neutral / negative)

## Components

### TextHighlighter
- Renders row text
- User can click+drag to select a span
- Returns `{ text, start, end }` on selection
- Highlights already-selected spans for existing quadruples

### CategoryPicker
- Search input → `GET /projects/:projectId/categories?q=<query>`
- Shows dropdown of matches + "Create new" option
- On select: returns `{ id, name }`

### QuadrupleForm
- Integrates TextHighlighter (for aspect + opinion selection)
- Integrates CategoryPicker
- Sentiment radio buttons
- Submit: `POST /projects/:projectId/rows/:rowId/quadruples`
- After submit: append new quadruple to list, reset form

### annotate.tsx
- Render `QuadrupleForm` below the row text
- Show existing quadruples as a list with delete button
  (`DELETE /projects/:projectId/rows/:rowId/quadruples/:quadrupleId`)

## Acceptance Criteria
- User can highlight text for aspect term
- User can search and select/create a category
- User can highlight text for opinion term
- User can select sentiment
- Submit adds the quadruple and it appears in the list immediately
- Delete removes a quadruple from the list
