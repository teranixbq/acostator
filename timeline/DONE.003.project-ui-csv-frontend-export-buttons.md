# Task 003 — Project UI: Create Modal + CSV Upload Frontend + Export Buttons

## Status
[ ] Not started

## Dependencies
- **Task 002 (csv-upload-and-export-backend) must be DONE** before starting
  (needs `/upload/init`, `/upload/complete`, and `/export` endpoints)

## Files touched — this agent owns ALL of these
- `apps/web/src/pages/projects.tsx`
- `apps/web/src/components/CreateProjectModal.tsx` (new)
- `apps/web/src/components/UploadCSVModal.tsx` (new)

## Why grouped together
All three files form one user flow: create project → upload CSV → view list → export.
`projects.tsx` is shared by all three interactions. Splitting would cause conflicts.

## Part A — CreateProjectModal

Fields: name (required, max 255), description (optional), annotation_order (sequential/random)
- On submit: `POST /projects` → `{ data: Project }`
- On success: close modal, prepend project to list, immediately open UploadCSVModal
- Use `<dialog>` element (not `<div role="dialog">`) — Biome a11y requires semantic HTML
- Keyboard: Escape closes, focus trap inside modal

## Part B — UploadCSVModal

Props: `projectId: string`, `onClose: () => void`, `onUploaded: (totalRows: number) => void`

Upload flow:
1. `POST /projects/:projectId/upload/init` → `{ uploadUrl, uploadId }`
2. `PUT uploadUrl` directly to R2 via XHR (for progress events — NOT fetch)
3. `POST /projects/:projectId/upload/complete` → triggers server-side parse

- File input: accept=".csv", max 1 GB client-side (reject before step 1)
- XHR `upload.onprogress` → update progress bar percentage
- On success: call `onUploaded(totalRows)`, close modal
- On error: show inline error, allow retry

## Part C — projects.tsx wiring

- "New project" button → opens CreateProjectModal
- After project created → open UploadCSVModal for that project
- "Upload CSV" button on cards where `total_rows === 0`
- Export buttons on each project card:
  - "Export JSON" → `window.open(/projects/:id/export?format=json)`
  - "Export CSV" → `window.open(/projects/:id/export?format=csv)`

## Acceptance Criteria
- Full create + upload flow works end to end
- Progress bar visible during R2 upload
- After upload, card shows updated `total_rows`
- Export buttons trigger file download
- Wrong file type (not .csv) rejected client-side
- File > 1 GB rejected client-side before any network request
- No Biome lint errors (use `<dialog>`, no `div[onClick]` without keyboard handler)
