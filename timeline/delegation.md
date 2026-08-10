# Acostator — Task Delegation Board

This file coordinates parallel agent work. Before starting a group, claim it here.
After finishing, mark it done. This prevents two agents working on the same files simultaneously.

---

## Rules

1. **Read this file first** before picking up any group.
2. **Claim a group** by changing its status to `RUNNING` and adding your agent identifier.
3. **One agent per group** — never start a group already marked `RUNNING`.
4. **Pick any free group** — groups marked `FREE` are available even if others are running (check Dependencies column).
5. **Branch from `development`** — always `git checkout -b <slug> origin/development`. Never from `main` or another feature branch.
6. **Push when done** — `git push -u origin <branch>`. Do NOT merge yourself. Manager reviews and merges.
7. **Edit only your row** — never rewrite this entire file. Only change the row(s) for your group.
8. **Update timeline files** — rename `TODO.` → `WIP.` → `DONE.` as you work.

---

## Dependency Graph

```
(parallel, no deps)
  Group A — 001 random-queue-bug     → rows.ts only
  Group B — 002 csv-upload + export  → worker backend only
  Group C — 004 quadruple-form       → annotate.tsx + new components

(waits for Group B to be DONE)
  Group D — 003 project-ui + csv-frontend + export-buttons → projects.tsx + new modal components

(waits for A + B + C + D all DONE)
  Group E — 006 testing-setup        → test files + vitest config
```

---

## Delegation Board

| Group | Tasks | Status | Agent | Branch | Dependencies |
|---|---|---|---|---|---|
| A | 001 — random queue bug fix | DONE | agent-a | random-queue-bug | none |
| B | 002 — csv upload backend + export backend | DONE | agent-b | csv-upload-and-export-backend | none |
| C | 004 — quadruple annotation form | DONE | agent-c | quadruple-form | none |
| D | 003 — project UI + csv upload frontend + export buttons | DONE | agent-d | project-ui-csv-frontend | B must be DONE |
| E | 006 — testing setup | DONE | agent-e | testing-setup | A + B + C + D must be DONE |
| F | 007 — modal centering + annotation_order move to project detail | DONE | agent-f | modal-annotation-order-fix | none |
| G | 008 — upload modal auto-open fix, centering, annotate button disabled | DONE | agent-g | upload-modal-fixes | none |
| H | 009 — fix upload route 404 (Hono routing conflict) | DONE | agent-h | upload-route-fix | none |

---

## How to Claim a Group

### 1. Edit only your row

Change from:
```
| A | 001 — random queue bug fix | FREE | — | — | none |
```
to:
```
| A | 001 — random queue bug fix | RUNNING | agent-a | random-queue-bug | none |
```

### 2. Create branch from `development`

```bash
git fetch origin
git checkout -b random-queue-bug origin/development
```

**Base is always `origin/development`. Never main, never another feature branch.**

### 3. Work, commit, push

```bash
git push -u origin random-queue-bug
```

Do NOT open a PR or merge into development yourself. Manager handles that.

### 4. Mark done

Change your row status to `DONE` and add a row to the Completed Groups table.

---

## Completed Groups

| Group | Tasks | Branch | Agent | Date |
|---|---|---|---|---|
| A | 001 — random queue bug fix | random-queue-bug | agent-a | Aug 2026 |
| B | 002 — csv upload backend + export backend | csv-upload-and-export-backend | agent-b | Aug 2026 |
| C | 004 — quadruple annotation form | quadruple-form | agent-c | Aug 2026 |
| D | 003 — project UI + csv upload frontend + export buttons | project-ui-csv-frontend | agent-d | Aug 2026 |
| E | 006 — testing setup | testing-setup | agent-e | Aug 2026 |
| F | 007 — modal centering + annotation_order move to project detail | modal-annotation-order-fix | agent-f | Aug 2026 |
| G | 008 — upload modal auto-open fix, centering, annotate button disabled | upload-modal-fixes | agent-g | Aug 2026 |
