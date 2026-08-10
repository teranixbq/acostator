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
