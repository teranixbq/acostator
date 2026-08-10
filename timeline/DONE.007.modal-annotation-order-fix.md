# Task 007 — Bug Fix: Modal Center + Move Annotation Order to Project Detail

## Status
[x] In progress

## Dependencies
- Task 003 (project-ui-csv-frontend) must be DONE — this task modifies files it created

## Files touched — this agent owns ALL of these
- `apps/web/src/components/CreateProjectModal.tsx` — remove annotation_order field, fix modal centering
- `apps/web/src/pages/projects.tsx` — update to not pass annotation_order on create
- `apps/web/src/pages/project-detail.tsx` (new) — add annotation_order setting UI
- `apps/worker/src/routes/projects.ts` — PATCH /projects/:id already existed, no change needed

## Parts
- Part A: Fix modal centering — add `margin: auto` via Tailwind `m-auto` on `<dialog>`
- Part B: Remove annotation_order from CreateProjectModal, default to "sequential"
- Part C: PATCH /projects/:id — already implemented, skipped
- Part D: Create project-detail.tsx with annotation_order toggle + wire route in App.tsx
