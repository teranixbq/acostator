# Task 008 — Bug Fix: Upload Modal Auto-Open, Modal Position, Annotate Button Disabled

## Status
[ ] Not started

## Dependencies
- Task 007 (modal-annotation-order-fix) must be DONE

## Files touched
- `apps/web/src/pages/projects.tsx` — remove auto-open upload modal, disable Annotate button
- `apps/web/src/components/UploadCSVModal.tsx` — fix modal centering

## Bug A — UploadCSVModal auto-opens after project creation

Currently after `POST /projects` succeeds, `CreateProjectModal` calls `onCreated(project)` and `projects.tsx` immediately opens `UploadCSVModal`. This is bad UX — user should open upload modal manually.

Fix:
- Remove auto-open logic from `projects.tsx` — do NOT open `UploadCSVModal` immediately after project creation
- Add an "Upload CSV" button on each project card that opens `UploadCSVModal` manually
- Only show "Upload CSV" button if `project.total_rows === 0`

## Bug B — UploadCSVModal positioned top-left instead of centered

Same issue as CreateProjectModal fix. The modal backdrop is not using proper centering classes.

Fix — ensure backdrop uses:
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <dialog open className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
    ...
  </dialog>
</div>
```

## Bug C — "Annotate" button not disabled when no CSV uploaded

The `GET /projects` response already includes `total_rows` field. Use it.

Fix in `projects.tsx`:
- Disable the Annotate button when `project.total_rows === 0`
- Add a tooltip or visual hint like `title="Upload CSV first"` when disabled
- Example: `<button disabled={project.total_rows === 0} ...>`

## Rules
- Run `npm run lint` and `npm run typecheck` before pushing
- Use `<dialog>` element for modals (Biome a11y)
- No new dependencies
- Push with: `git push -u origin upload-modal-fixes`
