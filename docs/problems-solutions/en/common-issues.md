# Acostator — Common Issues & Solutions

## 1. D1 "Too Many SQL Variables" on CSV Upload

**Problem**: When uploading a large CSV (thousands of rows), the worker tried to insert all rows into a `dataset_rows` D1 table in one transaction. D1 (SQLite) has a limit of 32,766 bind parameters per statement, causing a 500 error for any CSV with more than ~500 rows.

**Root cause**: Each row insert required multiple columns (id, project_id, row_index, text, status, created_at, updated_at = 7 params). 500 rows × 7 params = 3,500 params — still under limit, but batching at 500 was fragile and the real solution was architectural.

**Fix**: Removed `dataset_rows` table entirely. CSV stays in R2 permanently. Browser fetches CSV from R2 once, parses it locally, caches in IndexedDB. D1 only stores annotation quadruples (one row per quadruple, not per CSV row).

**Files changed**: `apps/worker/src/routes/projects.ts`, `apps/worker/src/db/schema.ts`, migration `0001_annotations`

---

## 2. UNIQUE Constraint 500 on POST Annotations

**Problem**: When a user completed a row, then navigated back and completed it again, `POST /projects/:id/annotations` returned 500 because the same `(project_id, row_index, aspect_term, opinion_term)` combination already existed in D1.

**Root cause**: The insert was a plain `INSERT`, not an upsert. Re-submitting the same row violated the UNIQUE constraint.

**Fix**: Changed to `INSERT OR REPLACE` (upsert) in `apps/worker/src/routes/annotations.ts`. Re-submitting the same annotation now silently replaces the existing record.

**Files changed**: `apps/worker/src/routes/annotations.ts`

---

## 3. Existing Annotation Highlights Not Shown in TextHighlighter

**Problem**: When a user opened a row that already had saved annotations, the text highlights (colored span overlays) did not appear. Only the active selection (aspect/opinion being picked) showed colors.

**Root cause**: In `apps/web/src/pages/annotate.tsx`, the prop `existingQuadruples` passed to `QuadrupleForm` was always an empty array `[]` (hardcoded as `const noServerQuadruples: Quadruple[] = []`). A stale comment claimed "highlights come from the form's own internal span selection state" — but the form has no such mechanism.

**Fix**: Map `pendingAnnotations` (the in-memory list of annotations for the current row) to `Quadruple[]` format so `TextHighlighter` can render per-annotation colored highlights.

```ts
// apps/web/src/pages/annotate.tsx
const noServerQuadruples: Quadruple[] = pendingAnnotations.map((a) => ({
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
```

**Files changed**: `apps/web/src/pages/annotate.tsx`

---

## 4. Annotation Color Looks the Same for Active Selection and First Annotation

**Problem**: When adding a new annotation while annotation #1 already exists, the active aspect selection and annotation #1 both appear blue. User may perceive this as "all blue".

**Root cause**: Not a bug. `ANNOTATION_COLORS[0]` is blue (`bg-blue-200`), and `active-aspect` style is also blue (`bg-blue-200 ring-1 ring-blue-400`). They are intentionally similar because annotation #1 and its active selection are the same item.

**Expected behavior**:
- Annotation #1 highlight = blue (index 0)
- Annotation #2 highlight = emerald (index 1)
- Active aspect selection = blue + ring (distinguishable by the ring outline)
- Active opinion selection = emerald + ring

No fix needed. Annotations with span data created after the highlight fix will display correctly with distinct per-index colors.

---

## 5. OAuth Callback Redirects to Worker Root Instead of Pages

**Problem**: After GitHub OAuth login, the worker did `c.redirect("/")` which redirected to `acostator-api.apicode.my.id/` (JSON 404), not the Pages frontend.

**Fix**: Added `FRONTEND_URL` env var and changed redirect to `c.redirect(c.env.FRONTEND_URL)`.

**Files changed**: `apps/worker/src/routes/auth.ts`

---

## 6. Session Cookie Not Sent Cross-Subdomain

**Problem**: Cookie was set without `Domain` attribute, so the browser only sent it to `acostator-api.apicode.my.id`. The Pages frontend on `acostator.apicode.my.id` could not read the session.

**Fix**: Added `Domain=.apicode.my.id` to cookie via `domain` parameter in `setSessionCookie`. Domain is read from `c.env.ALLOWED_DOMAIN`.

**Files changed**: `apps/worker/src/lib/auth.ts`

---

## 7. Cloudflare Workers Auto-Deploy Points to `main` Instead of `development`

**Problem**: Cloudflare Workers Builds was configured to deploy from `main`, but all active development happens on `development`. Merges to `development` did not trigger deploys.

**Fix**: Changed the production branch in Cloudflare Workers Builds dashboard from `main` to `development`.

---

## 8. CI Test Step Fails: "No Test Files Found"

**Problem**: Vitest exits with code 1 when no test files exist. CI failed at the test step even when there were no test files yet.

**Fix**: Added `--passWithNoTests` flag to the test script in `apps/worker/package.json`.

**Files changed**: `apps/worker/package.json`

---

## 9. Biome Lint Errors in Agent Branches

**Problem**: Agents writing code with formatting or patterns that violate Biome rules. CI fails after PR is created.

**Fix**: Run `npx biome check --write --unsafe .` in the worktree before pushing. All errors are auto-fixable. Non-auto-fixable errors (`noArrayIndexKey`, missing required interface fields) must be fixed manually.
