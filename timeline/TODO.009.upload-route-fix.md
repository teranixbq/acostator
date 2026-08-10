# Task 009 — Fix Upload Route 404 (Hono Routing Conflict)

## Status: TODO

## Problem

Production upload flow fails with `{"error":"Not found"}` 404 on:
```
POST /projects/:projectId/upload/init
PUT  /projects/:projectId/upload/:uploadId
POST /projects/:projectId/upload/complete
```

Root cause: in `apps/worker/src/index.ts`, routes are mounted like this:

```ts
app.route("/projects", projectRoutes);                         // line 33
app.route("/projects/:projectId/rows", rowRoutes);             // line 34
app.route("/projects/:projectId/categories", categoryRoutes);  // line 35
app.route("/projects", exportRoutes);                          // line 36
```

The upload routes (`/:projectId/upload/init` etc.) live inside `projectRoutes`,
but Hono may not resolve them correctly when sibling routes at the top level also
use `/:projectId` as a prefix. This causes the request to fall through to `app.notFound()`.

## Task

1. Investigate why `POST /projects/:projectId/upload/init` returns 404 in production
   but the route exists in `projectRoutes`. Test locally with `wrangler dev` if possible.

2. Fix the routing conflict in `apps/worker/src/index.ts` so all upload routes resolve correctly.
   Most likely fix: move `rowRoutes` and `categoryRoutes` to mount inside their respective
   route files, or reorganize how `projectRoutes` mounts sub-routes.

3. Verify all 3 upload steps work end-to-end:
   - `POST /projects/:projectId/upload/init` → returns `{ uploadId, uploadUrl }`
   - `PUT /projects/:projectId/upload/:uploadId` → accepts CSV body
   - `POST /projects/:projectId/upload/complete` → parses CSV, inserts rows, returns updated project

4. Run `npm run lint` and `npm run typecheck` before pushing.

5. Commit and push to branch `upload-route-fix`.

## Files to touch

- `apps/worker/src/index.ts` — fix route mounting
- `apps/worker/src/routes/projects.ts` — may need reorganization
- Tests in `apps/worker/src/` if relevant

## Branch: `upload-route-fix`
