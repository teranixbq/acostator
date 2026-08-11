import { api } from "@/lib/api.ts";
import { useEffect, useRef, useState } from "react";

const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1 GB

interface InitUploadResponse {
  data: {
    uploadUrl: string;
    uploadId: string;
  };
}

interface Props {
  projectId: string;
  onClose: () => void;
  onUploaded: (totalRows: number) => void;
}

type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

/** Parse the header row of a CSV file without reading the whole file. */
function parseCSVHeaders(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    // Read only the first 64 KB — enough to get the header line
    const slice = file.slice(0, 65536);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const firstLine = text.split(/\r?\n/)[0] ?? "";
      // Simple CSV header parse: handles quoted fields
      const headers: string[] = [];
      let field = "";
      let inQuotes = false;
      for (let i = 0; i < firstLine.length; i++) {
        const ch = firstLine[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          headers.push(field.trim());
          field = "";
        } else {
          field += ch;
        }
      }
      headers.push(field.trim());
      resolve(headers.filter((h) => h.length > 0));
    };
    reader.onerror = () => reject(new Error("Failed to read file headers"));
    reader.readAsText(slice);
  });
}

export function UploadCSVModal({ projectId, onClose, onUploaded }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [textColumn, setTextColumn] = useState<string>("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Open dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();

    // Close on backdrop click
    const handleClick = (e: MouseEvent) => {
      const rect = dialog.getBoundingClientRect();
      const clickedOutside =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom;
      if (clickedOutside && uploadState === "idle") onClose();
    };
    dialog.addEventListener("click", handleClick);
    return () => dialog.removeEventListener("click", handleClick);
  }, [onClose, uploadState]);

  // Cancel native Escape — only allow close when not uploading
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      if (uploadState === "idle" || uploadState === "error") onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose, uploadState]);

  // Cancel in-flight XHR on unmount
  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setCsvHeaders([]);
    setTextColumn("");
    const selected = e.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are accepted.");
      setFile(null);
      e.target.value = "";
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError("File exceeds the 1 GB limit.");
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(selected);

    // Parse headers from the selected file immediately (no upload yet)
    try {
      const headers = await parseCSVHeaders(selected);
      if (headers.length === 0) {
        setError("Could not detect columns in this CSV file.");
        return;
      }
      setCsvHeaders(headers);
      setTextColumn(headers[0] ?? "");
    } catch {
      setError("Failed to read CSV headers.");
    }
  };

  const handleUpload = async () => {
    if (!file || !textColumn) return;

    setError(null);
    setProgress(0);
    setUploadState("uploading");

    let uploadId: string;
    let uploadUrl: string;

    // Step 1 — init (include text_column in body)
    try {
      const res = await api.post<InitUploadResponse>(`/projects/${projectId}/upload/init`, {
        file_name: file.name,
        file_size: file.size,
        text_column: textColumn,
      });
      uploadId = res.data.uploadId;
      uploadUrl = res.data.uploadUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialise upload");
      setUploadState("error");
      return;
    }

    // Step 2 — PUT directly to R2 via XHR (for progress events)
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.onabort = () => reject(new Error("Upload cancelled"));

        xhr.open("PUT", uploadUrl);
        xhr.withCredentials = true;
        xhr.setRequestHeader("Content-Type", "text/csv");
        xhr.send(file);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploadState("error");
      return;
    }

    // Step 3 — complete (server-side parse)
    setUploadState("processing");
    try {
      const res = await api.post<{ data: { total_rows: number } }>(
        `/projects/${projectId}/upload/complete`,
        { upload_id: uploadId }
      );
      setUploadState("done");
      onUploaded(res.data.total_rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
      setUploadState("error");
    }
  };

  const isActive = uploadState === "uploading" || uploadState === "processing";
  const canClose = !isActive;

  const handleTryAgain = () => {
    setUploadState("idle");
    setProgress(0);
    setError(null);
    setFile(null);
    setCsvHeaders([]);
    setTextColumn("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl backdrop:bg-black/30"
    >
      <h2 className="mb-4 text-base font-semibold text-gray-900">Upload CSV</h2>

      <div className="space-y-4">
        {/* File input */}
        <div>
          <label
            htmlFor="csv-file-input"
            className="mb-1.5 block text-xs font-medium text-gray-600"
          >
            CSV file
          </label>
          <input
            id="csv-file-input"
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => void handleFileChange(e)}
            disabled={isActive}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-gray-200 disabled:opacity-50"
          />
        </div>

        {/* Column picker — shown once headers are parsed */}
        {csvHeaders.length > 0 && uploadState === "idle" && (
          <div>
            <label
              htmlFor="text-column-select"
              className="mb-1.5 block text-xs font-medium text-gray-600"
            >
              Column for annotation text
            </label>
            <select
              id="text-column-select"
              value={textColumn}
              onChange={(e) => setTextColumn(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
            >
              {csvHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              This column will be used as the text for each annotation row.
            </p>
          </div>
        )}

        {/* Progress bar */}
        {(uploadState === "uploading" || uploadState === "processing") && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{uploadState === "uploading" ? "Uploading…" : "Processing…"}</span>
              {uploadState === "uploading" && <span>{progress}%</span>}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gray-900 transition-all duration-200"
                style={{ width: uploadState === "processing" ? "100%" : `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Done state */}
        {uploadState === "done" && <p className="text-sm text-green-600">Upload complete.</p>}

        {/* Error */}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-2">
        {uploadState === "error" && (
          <button
            type="button"
            onClick={handleTryAgain}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={!canClose}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {uploadState === "done" ? "Close" : "Cancel"}
        </button>
        {uploadState !== "error" && uploadState !== "done" && (
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={!file || !textColumn || isActive}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {uploadState === "uploading"
              ? "Uploading…"
              : uploadState === "processing"
                ? "Processing…"
                : "Upload"}
          </button>
        )}
      </div>
    </dialog>
  );
}
