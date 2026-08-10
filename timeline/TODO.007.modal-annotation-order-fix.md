# Task 007 — Bug Fix: Modal Center + Move Annotation Order to Project Detail

## Status
[ ] Not started

## Dependencies
- Task 003 (project-ui-csv-frontend) must be DONE — this task modifies files it created

## Files touched — this agent owns ALL of these
- `apps/web/src/components/CreateProjectModal.tsx` — remove annotation_order field, fix modal centering
- `apps/web/src/pages/projects.tsx` — update to not pass annotation_order on create
- `apps/web/src/pages/project-detail.tsx` (new or existing) — add annotation_order setting UI
- `apps/worker/src/routes/projects.ts` — add PATCH /projects/:id endpoint

## Part A — Fix Modal Centering

The CreateProjectModal is rendering at top-left instead of centered.

Fix: ensure the modal backdrop uses `fixed inset-0 flex items-center justify-center` so the dialog is always centered on screen. Use `<dialog>` element (Biome a11y requires semantic HTML).

Example structure:
```tsx
// backdrop
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <dialog open className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
    ...
  </dialog>
</div>
```

## Part B — Remove Annotation Order from CreateProjectModal

Remove the `annotation_order` field (Sequential/Random dropdown) from the CreateProjectModal form entirely.

- Default to `"sequential"` when calling `POST /projects`
- Remove the field from the form UI and validation

## Part C — Add PATCH /projects/:id Endpoint (Backend)

Add endpoint: `PATCH /projects/:id`

Request body (partial):
```json
{ "annotation_order": "sequential" | "random" }
```

- Validate with Zod
- Only owner can update (check user_id)
- Return updated project: `{ data: Project }`

## Part D — Add Annotation Order Setting to Project Detail Page

In the project detail page (or projects list — wherever makes sense after reading the codebase), add a setting to change annotation_order for a project.

- Show current annotation_order value
- Allow toggling between Sequential and Random
- On change: call `PATCH /projects/:id` with new value
- Show success/error feedback

## Rules
- Run `npm run lint` and `npm run typecheck` before pushing
- Use `<dialog>` element for modals (not `<div role="dialog">`)
- No new dependencies
- Push with: `git push -u origin modal-annotation-order-fix`
