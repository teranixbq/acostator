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
| A | 001 — random queue bug fix | FREE | — | — | none |
| B | 002 — csv upload backend + export backend | FREE | — | — | none |
| C | 004 — quadruple annotation form | FREE | — | — | none |
| D | 003 — project UI + csv upload frontend + export buttons | FREE | — | — | B must be DONE |
| E | 006 — testing setup | FREE | — | — | A + B + C + D must be DONE |

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

_(none yet)_

| Group | Tasks | Branch | Agent | Date |
|---|---|---|---|---|
