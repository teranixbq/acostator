# Acostator — Common Issues & Solutions

This document records problems encountered during development and the solutions applied. Add new entries as issues are discovered and resolved.

---

## Issue 1: Upload Route 404 — Hono Routing Conflict

**Symptom:** `POST /projects/:projectId/upload/init` returns `{"error":"Not found"}` 404 even though the route is defined inside `projectRoutes`.

**Root cause:**

Routes were mounted in `apps/worker/src/index.ts` like this:

```ts
app.route("/projects", projectRoutes)
app.route("/projects/:projectId/rows", rowRoutes)
app.route("/projects/:projectId/categories", categoryRoutes)
app.route("/projects", exportRoutes)
```

Hono could not resolve `/:projectId/upload/init` inside `projectRoutes` because sibling top-level routes also used `/:projectId` as a prefix. The overlapping dynamic segments caused a routing conflict — Hono matched the wrong handler before reaching the upload route.

**Solution:**

Consolidated route mounting in `apps/worker/src/index.ts` so that all sub-routes under `/projects/:projectId` are registered without conflicting top-level prefixes.

**Commit:** `fix(worker): resolve upload route 404 by consolidating /projects routes`

**Files changed:**
- `apps/worker/src/index.ts`
- `apps/worker/src/routes/projects.ts`

**Lesson:** When using `app.route()` in Hono, avoid registering multiple top-level routes that share the same dynamic segment prefix. Consolidate them under a single mount point or use sub-routers to prevent Hono from misrouting requests.

---

## Issue 2: Cloudflare Workers Auto-Deploy Only Triggers from `main`, Not `development`

**Symptom:** Fixes merged to the `development` branch never deployed to the live worker. The production worker kept running old code despite successful merges.

**Root cause:**

The Cloudflare Workers GitHub integration was configured with production branch set to `main`. All PRs in this project merge to `development`, so every merge bypassed the deploy trigger entirely.

**Solution (choose one):**

Option A — Change the production branch in the Cloudflare dashboard:
1. Go to Cloudflare Workers dashboard → select the worker
2. Settings → Build → Production branch
3. Change from `main` to `development`
4. Save

Option B — Merge `development` into `main` when ready to release to production.

**Prevention:**

Document clearly in `AGENT.md` and architecture docs that the Cloudflare Workers production branch setting must match the integration branch used in this repo (`development`). Any agent or contributor setting up a new worker must verify this setting before expecting deploys to work.

---

## Issue 3: D1 "Too Many SQL Variables" on CSV Upload

**Symptom:** Uploading a CSV with more than ~500 rows caused the Worker to throw a D1 error: `too many SQL variables`. The upload appeared to succeed on the frontend but data was missing or the Worker crashed silently.

**Root cause:**

The original architecture inserted every CSV row as a `DatasetRow` record in D1 at upload time. D1 (SQLite) has a hard limit of 999 bound parameters per statement. With multi-column inserts batched naively, large CSVs exceeded this limit and caused the query to fail.

Attempts to work around this with smaller batch sizes (e.g., 500 rows per transaction) only delayed the problem — batching reduced the frequency of the error but did not eliminate it for very large files, and it made uploads slow and resource-intensive.

**Solution:**

Redesigned the architecture to eliminate D1 row storage entirely:

- CSV files are stored permanently in R2 after upload (already the case)
- No `DatasetRow` records are inserted into D1 at any point
- At annotation time, the browser fetches the CSV from R2 and parses it client-side with Papa Parse
- D1 only stores `Annotation` records (quadruples), written one at a time as the user annotates

This removes the upload bottleneck completely and makes the system scale to arbitrarily large CSVs.

**Why this solution:**

The root cause was architectural — trying to mirror row data into a database that was not designed for bulk inserts of arbitrary CSV content. The fix removes the mirror entirely. R2 is the right storage layer for the raw file; D1 is the right layer for structured annotation data only.

**Status:**
Verified: 2026-08-11

---
