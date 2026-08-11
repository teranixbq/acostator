# Task 013 — Docs Update: Reflect new architecture in bilingual docs

## Branch: `setup-docs`

## Status: DONE

## What was updated

### `docs/architecture/en/001.system-architecture.md`
- Updated architecture diagram — added IndexedDB box inside Browser
- Added "Key Design Decision" section: CSV stays in R2, D1 only stores quadruples
- Updated tech stack table — added IndexedDB row, updated D1 description
- Updated project structure — added indexeddb.ts, annotations.ts, schemas.ts
- Added full API contract
- Replaced old CSV upload flow with new column picker + direct R2 upload flow
- Added new "Annotation Flow (Browser-Local)" section
- Added "Annotation Sync Strategy" section
- Added "TextHighlighter — Span Highlight System" section
- Updated export flow — joins R2 CSV + D1 annotations
- Updated CI/CD section — base branch is development, not main

### `docs/architecture/id/001.system-architecture.md`
- Full Indonesian translation of all changes above

### `docs/business-logic/en/001.product-definition.md`
- Added "Text Column" concept under Core Concepts
- Updated annotation flow — highlight via click+drag
- Added "CSV Upload with Column Picker" section
- Added "Local-First Annotation Storage" section
- Added "Progress Navigation" section (Previous/Next/Complete + syncStatus)
- Updated Scope (v1) — added column picker, local-first, IndexedDB, upsert sync

### `docs/business-logic/id/001.product-definition.md`
- Full Indonesian translation of all changes above

### `docs/business-logic/en/002.database-schema.md`
- Updated Entity Overview — DatasetRow removed, replaced with Annotation
- Added note: DatasetRow no longer exists in D1
- Updated Project entity — added `text_column` field, updated `annotated_rows` computation
- Replaced DatasetRow + Quadruple entities with single Annotation (Quadruple) entity
- Added UNIQUE constraint explanation + upsert rationale
- Added "What is NOT in D1" table
- Added "D1 Migrations Applied" table (0000, 0001, 0002)
- Added "IndexedDB Schema (Browser)" table
- Updated Progress Calculation — now uses COUNT(DISTINCT row_index)
- Updated Soft Delete Strategy

### `docs/business-logic/id/002.database-schema.md`
- Full Indonesian translation of all changes above

### `docs/problems-solutions/en/common-issues.md` (NEW FILE)
- Issue 1: D1 too many SQL variables
- Issue 2: UNIQUE constraint 500 on POST annotations
- Issue 3: Existing annotation highlights not shown in TextHighlighter
- Issue 4: Annotation color looks same for active selection and first annotation (not a bug)
- Issue 5: OAuth callback redirects to worker root
- Issue 6: Session cookie not sent cross-subdomain
- Issue 7: Cloudflare Workers auto-deploy points to main instead of development
- Issue 8: CI test step fails — no test files found
- Issue 9: Biome lint errors in agent branches

### `docs/problems-solutions/id/common-issues.md` (NEW FILE)
- Full Indonesian translation of all above issues

### `docs/dev-log.md`
- Added entry 10: UNIQUE constraint 500 fix (upsert)
- Added entry 11: Architecture change — CSV in R2, D1 quadruples only, IndexedDB
- Added entry 12: Annotation sync flow (isDirty, syncStatus, Previous/Next/Complete)
- Added entry 13: TextHighlighter highlight bug fix
