# Acostator — Agent Rules

This document is mandatory reading for any AI agent working on the Acostator codebase. Read before writing any code.

---

## Filesystem Access

Your working directory is a git worktree under `/tmp/acostator-worktrees/<branch>/`.
You have full read/write access to:
- `/tmp/acostator-worktrees/` — your worktree (this is your repo root)
- `/tmp/opencode/` — scratch space for temporary files during work

Both directories are pre-approved. Do NOT ask for permission to access them.

---

## Core Principles

1. **Read first, write second.** Before creating or editing any file, read the relevant files first.
2. **Follow existing patterns.** Don't introduce new patterns if existing ones are sufficient.
3. **Service layer owns business logic.** Logic must not live in Server Actions or Components — only in `services/`.
4. **TypeScript strict.** No `any`, no `as unknown as X` without a clear comment explaining why.
5. **No new dependencies** without user confirmation.

---

## Directory Structure

```
actions/      ← not used — Hono routes call services directly
services/     ← business logic: pure, testable, no HTTP framework imports
routes/       ← Hono route handlers: validate input, call service, return response
lib/          ← utilities, DB client, auth helpers
db/           ← Drizzle schema and migrations
middleware/   ← Hono middleware (auth, CORS, etc.)
```

### Rules per Layer

**`actions/`**
- Only called from Server Components or `"use client"` components
- Must validate input with Zod before calling any service
- Return `{ success: true, data }` or `{ success: false, error: string }`
- No business logic here

**`services/`**
- Pure functions or classes — no imports from `next/` or React
- May import from `lib/db.ts` (Prisma)
- Every function must be testable without an HTTP request
- Errors: throw domain errors, never HTTP errors

**`components/`**
- No direct `fetch` calls to APIs
- No Prisma imports
- Local state management with `useState`/`useReducer`
- Server Components by default; `"use client"` only when interactivity is required

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `text-highlighter.tsx` |
| Components | PascalCase | `TextHighlighter` |
| Functions | camelCase | `getRecommendations` |
| DB tables | snake_case | `dataset_rows` |
| Types/Interfaces | PascalCase | `QuadrupleInput` |
| Server Actions | camelCase + `Action` suffix | `createProjectAction` |
| Services | camelCase + `Service` suffix | `annotationService` |
| Constants | SCREAMING_SNAKE | `MAX_FILE_SIZE` |

---

## Data Flow Rules

```
Component
  └─ calls Server Action  (never calls service directly)
       └─ validates with Zod
            └─ calls Service
                 └─ calls Prisma
```

Do not skip this layering. Components must never call Prisma directly.

---

## Annotation State Machine

The state machine in `AnnotationWizard` must follow this strict order:

```
idle → selecting_aspect → aspect_selected → selecting_opinion
     → opinion_selected → selecting_sentiment → selecting_category → idle
```

Invalid transitions must be ignored, not thrown as errors.

---

## Database Rules

- Always use Prisma transactions for operations that modify more than one table
- Never use `findFirst` when you expect a unique result — use `findUnique`
- All queries that can return null must handle it explicitly
- Indexes: add `@@index` in the schema for frequently queried fields (project_id, row_index, status)

---

## CSV Handling

- Upload: always streaming, never buffer the entire file into memory
- Parse: use Papa Parse with `worker: true` in the browser, streaming on the server
- Batch insert: maximum 500 rows per transaction
- Validation: the `text` column is required and must not be empty

---

## Error Handling

```typescript
// Correct pattern for Server Actions
export async function createProjectAction(input: unknown) {
  const parsed = CreateProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.message }
  }

  try {
    const project = await projectService.create(parsed.data)
    return { success: true, data: project }
  } catch (error) {
    console.error('[createProjectAction]', error)
    return { success: false, error: 'Failed to create project' }
  }
}
```

Never expose internal error messages to the client.

---

## Forbidden

- ❌ `console.log` in production code (use a proper logger or remove it)
- ❌ Hardcoded user IDs or project IDs anywhere
- ❌ Skipping Zod validation in Server Actions
- ❌ Prisma queries inside React components
- ❌ `useEffect` for data fetching (use Server Components)
- ❌ Inline styles (use Tailwind)
- ❌ `<div>` for interactive buttons (use `<button>`)
- ❌ Storing sensitive data in localStorage

---

## Accessibility (Required)

- All interactive elements must be keyboard accessible
- The text highlighter must have a keyboard alternative (not mouse-only)
- ARIA labels are required for icon-only buttons
- Minimum contrast ratio of 4.5:1 for text

---

## Documentation (`docs/`)

All project documentation lives in the `docs/` folder with 4 subfolders, each containing `en/` and `id/` language variants:

```
docs/
├── tech-stack/
│   ├── en/          ← Frameworks, libraries, tooling, versions, rationale
│   └── id/
├── business-logic/
│   ├── en/          ← Product, features, user flow, data model, domain rules
│   └── id/
├── architecture/
│   ├── en/          ← System architecture, module design, data flow, deployment
│   └── id/
└── problems-solutions/
    ├── en/          ← Significant problems + verified solutions
    └── id/
```

### When to Write Docs

- Every important architectural decision that is not obvious → write in `architecture/`
- Every tech stack change (new library, version upgrade, migration rationale) → write in `tech-stack/`
- Every high-impact problem with a solution **verified as working by the user** → write in `problems-solutions/`
- Small or trivial issues **do not need documentation**

### File Naming Format

```
NNN.descriptive-name.md
```

Examples:
```
001.csv-streaming-upload.md
002.text-highlight-span-offset.md
003.category-recommendation-ranking.md
```

Three-digit sequence number starting at `001`, incremented per subfolder independently (not globally).

### Template: `problems-solutions/en/NNN.name.md`

```markdown
# [Problem Title]

## Context
Describe the situation and the components involved.

## Problem
What was not working or blocking progress. What was the impact.

## Solution
What was done to resolve the problem.

## Why This Solution
Technical rationale for choosing this approach over alternatives.

## Status
Verified: [date]
```

### Do Not Write Docs For

- Small, straightforward bugs
- Minor styling changes
- Variable renames or small refactors

---

## Document References

- `docs/business-logic/en/001.product-definition.md` — scope, user flow, output format
- `docs/business-logic/en/002.database-schema.md` — complete entity schema
- `docs/architecture/en/001.system-architecture.md` — architecture, module structure, tech stack
- `AGENT.md` — this document (root level, always read first)
