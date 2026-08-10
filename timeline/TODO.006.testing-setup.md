# Task 006 — Testing Setup

## Status
[ ] Not started

## Dependencies
- Tasks 001, 003, 004, 005 should be DONE (tests cover their logic)

## Files touched
- `apps/worker/vitest.config.ts` (new)
- `apps/worker/test/` directory (new)
- `apps/worker/package.json` (add test scripts)
- `package.json` (add root test script)

## Goal
Set up Vitest with `@cloudflare/vitest-pool-workers` and write initial tests.

## Steps

### 1. Install dependencies
```bash
npm install --save-dev vitest @cloudflare/vitest-pool-workers --workspace=apps/worker
```

### 2. Create `apps/worker/vitest.config.ts`
```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
```

### 3. Test files

`apps/worker/test/random-queue.test.ts`:
- After PATCH status=completed on random project, next GET /rows/next returns different row
- Queue shrinks by 1 after each annotation

`apps/worker/test/csv-parser.test.ts`:
- Valid CSV with `text` column → rows inserted correctly
- CSV with no `text` column → uses first column
- Empty CSV → 422 response
- CSV with special characters → handled correctly

`apps/worker/test/export.test.ts`:
- JSON export contains only completed rows
- CSV export has correct headers and one row per quadruple
- Returns 404 for unknown project

### 4. Update package.json scripts
`apps/worker/package.json`:
```json
{ "scripts": { "test": "vitest run", "test:watch": "vitest" } }
```

Root `package.json`:
```json
{ "scripts": { "test": "npm run test -w apps/worker" } }
```

## Acceptance Criteria
- `npm run test` from root passes all tests
- Tests use real D1/R2 bindings via miniflare (no mocking)
- `vitest --watch` works locally
