# Task 009 — Fix Upload Route 404 (Hono Routing Conflict)

## Status: WIP

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

Hono's `app.route()` strips the prefix as a **literal static string** before
handing the request to the sub-router. It cannot strip a dynamic/parameterised
prefix like `/projects/:projectId/rows`. Those mounts silently never match.

Additionally, having two routers mounted at the same `/projects` prefix
(`projectRoutes` and `exportRoutes`) means Hono only evaluates the second one
if the first didn't produce a response — but in practice the duplicate prefix
causes the upload sub-routes inside `projectRoutes` to be unreachable.

## Solution

Mount all project-scoped sub-routers **inside `projectRoutes`** via
`projectRoutes.route()`, then register only a single top-level
`app.route("/projects", projectRoutes)`. This keeps all `/projects/*` routing
in one place and guarantees Hono can resolve every sub-path correctly.

Changes:
- `apps/worker/src/index.ts` — remove the four `/projects*` mounts, add one.
- `apps/worker/src/routes/projects.ts` — import and mount `rowRoutes`,
  `categoryRoutes`, and `exportRoutes` as sub-routers.

## Branch: `upload-route-fix`
