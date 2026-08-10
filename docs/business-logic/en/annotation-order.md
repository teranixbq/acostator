# Annotation Order — Business Logic

## Overview

Each project has an `annotation_order` setting that controls the sequence in which annotators see dataset rows.

## Values

| Value | Behavior |
|---|---|
| `sequential` | Rows are presented in insertion order (row_index 0, 1, 2, ...) |
| `random` | Rows are shuffled once on upload using Fisher-Yates; the permutation is stored as JSON in `projects.annotation_queue` |

## Default

New projects default to `sequential`. The annotation order can be changed at any time from the project detail page — it does not affect already-completed annotations.

## Where It's Configured

- **Create project** — `POST /projects` always sets `annotation_order: "sequential"` by default; user does not choose at creation time
- **Project detail page** — user can change `annotation_order` via `PATCH /projects/:id`

## How Random Queue Works

When a CSV is uploaded to a project with `annotation_order: "random"`:
1. Row indices `[0, 1, ..., n-1]` are shuffled using Fisher-Yates
2. The shuffled array is stored as JSON in `projects.annotation_queue`
3. `getNextRow` reads from the front of the queue
4. On complete/skip, the consumed index is popped from the queue

When `annotation_order: "sequential"`:
- `annotation_queue` is `null`
- `getNextRow` queries rows ordered by `row_index` filtered by `status != completed/skipped`

## Changing Annotation Order

Changing `annotation_order` on an existing project:
- Does **not** re-shuffle or reset completed annotations
- If changing from `sequential` to `random`, a new queue is generated from remaining (non-completed) rows
- If changing from `random` to `sequential`, the queue is cleared (`annotation_queue = null`)

## API

```
POST   /projects              — create project (annotation_order always "sequential")
PATCH  /projects/:id          — update annotation_order { "annotation_order": "sequential" | "random" }
GET    /projects/:id/rows/next — get next row based on current annotation_order
```
