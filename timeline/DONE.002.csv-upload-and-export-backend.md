# Task 002 — CSV Upload Backend + Export Backend

## Status
[ ] Not started

## Dependencies
None — can run in parallel with 001, 003

## Files touched — this agent owns ALL of these
- `apps/worker/src/routes/projects.ts` (add upload endpoints)
- `apps/worker/src/services/csv-upload.ts` (new)
- `apps/worker/src/routes/export.ts` (new)
- `apps/worker/src/index.ts` (mount export routes)
- `packages/shared/src/schemas.ts` (add upload schemas)

## Why grouped together
Both touch the worker backend. CSV upload backend must exist before export
can reference `dataset_rows`. Both are pure backend with no frontend files.
No conflict risk with other agents.

## Part A — CSV Upload Backend

### 1. Add to `packages/shared/src/schemas.ts`
```typescript
export const UploadInitSchema = z.object({
  file_name: z.string().min(1),
  file_size: z.number().positive(),
});
export const UploadCompleteSchema = z.object({ upload_id: z.string().uuid() });
```

### 2. Create `apps/worker/src/services/csv-upload.ts`
- `initUpload(env, projectId, fileName, fileSize)`:
  - `uploadId = crypto.randomUUID()`
  - R2 key: `uploads/${projectId}/${uploadId}.csv`
  - Generate presigned PUT URL via `env.R2.createPresignedUrl("PUT", key, { expiresIn: 3600 })`
  - Return `{ uploadId, uploadUrl }`
- `completeUpload(env, db, projectId, uploadId, userId)`:
  - Fetch from R2: `uploads/${projectId}/${uploadId}.csv`
  - Stream-parse CSV with TextDecoder (no papaparse in Workers)
  - First row = headers; find `text` column (fallback: first column)
  - Batch insert into `dataset_rows` in chunks of 500 rows per transaction
  - If `annotation_order === "random"`: Fisher-Yates shuffle indices → store as `annotation_queue` JSON
  - Update project: `total_rows`, `file_name`, `file_size`, `status = "ready"`
  - Delete R2 object after successful parse

### 3. Add to `apps/worker/src/routes/projects.ts`
```
POST /projects/:projectId/upload/init     → initUpload
POST /projects/:projectId/upload/complete → completeUpload
```

## Part B — Export Backend

### 4. Create `apps/worker/src/routes/export.ts`
```
GET /projects/:projectId/export?format=json
GET /projects/:projectId/export?format=csv
```

**JSON output:**
```json
{
  "project": { "id": "...", "name": "..." },
  "rows": [{
    "id": "...", "text": "...", "status": "completed",
    "quadruples": [{
      "aspect_term": "...", "category": "...",
      "opinion_term": "...", "sentiment": "..."
    }]
  }]
}
```

**CSV output** (one line per quadruple):
```
text,aspect_term,category,opinion_term,sentiment
"The food was great","food","Food#Quality","great","positive"
```

- Only export rows with `status = 'completed'`
- Verify project ownership (return 404 if not found or wrong user)
- Set `Content-Disposition: attachment; filename="export-<projectId>.<ext>"`
- Set correct `Content-Type`

### 5. Mount in `apps/worker/src/index.ts`
```typescript
import { exportRoutes } from "./routes/export.ts";
app.route("/projects", exportRoutes);
```

## Acceptance Criteria
- `POST /upload/init` returns `{ uploadUrl, uploadId }`
- After PUT to uploadUrl + POST to complete → project `total_rows > 0`
- Random projects have `annotation_queue` populated
- Empty CSV returns 422
- `GET /export?format=json` returns all completed rows with quadruples
- `GET /export?format=csv` triggers file download
- Returns 404 for unknown or unowned project
