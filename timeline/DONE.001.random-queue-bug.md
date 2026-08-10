# Task 001 — Random Queue Bug Fix

## Status
[ ] Not started

## Dependencies
None

## Files touched
- `apps/worker/src/routes/rows.ts` ONLY

## Gap
When annotation_order is `random`, the queue is read but never updated after a row is
marked complete or skipped. So the same row keeps appearing.

## Goal
After a row is marked complete or skipped in random mode, pop its index from
`annotation_queue` and persist the updated queue back to the project row.

## Steps

1. In `PATCH /projects/:projectId/rows/:rowId/status`:
   - After updating row status, check if `project.annotation_order === "random"`
   - If yes, parse `project.annotation_queue` as `number[]`
   - Remove the row's `row_index` from the array (filter, not shift — user may skip non-head rows)
   - Stringify and write back to `projects.annotation_queue`

2. In `GET /projects/:projectId/rows/next` (random branch):
   - Current code reads `queue[0]` but never pops it
   - Change to filter out rows whose status is already `completed` or `skipped` instead
     of relying on queue ordering alone — this makes it idempotent

## Acceptance Criteria
- Annotating row A in random mode, then calling `/rows/next` again does not return row A
- Queue shrinks by 1 after each complete/skip
- Sequential mode is unaffected
