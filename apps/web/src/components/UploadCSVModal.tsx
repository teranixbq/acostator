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

export function UploadCSVModal({ projectId, onClose, onUploaded }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [file, setFile] = useState<File | null>(null);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
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
  };

  const handleUpload = async () => {
    if (!file) return;

    setError(null);
    setProgress(0);
    setUploadState("uploading");

    let uploadId: string;
    let uploadUrl: string;

    // Step 1 — init
    try {
      const res = await api.post<InitUploadResponse>(`/projects/${projectId}/upload/init`, {
        file_name: file.name,
        file_size: file.size,
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

  const handleRetry = () => {
    setError(null);
    setFile(null);
    setProgress(0);
    setUploadState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isActive = uploadState === "uploading" || uploadState === "processing";
  const canClose = !isActive;

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-md rounded-xl p-0 shadow-xl backdrop:bg-black/40"
      aria-labelledby="upload-csv-title"
    >
      <div className="px-6 pt-6 pb-2">
        <h2 id="upload-csv-title" className="text-base font-semibold">
          Upload CSV
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          The file must have a header row and at least one data row.
        </p>
      </div>

      <div className="space-y-4 px-6 py-4">
        {/* File input */}
        <div className="space-y-1">
          <label htmlFor="csv-file" className="block text-sm font-medium text-gray-700">
            CSV file <span aria-hidden="true">*</span>
          </label>
          <input
            ref={fileInputRef}
            id="csv-file"
            type="file"
            accept=".csv"
            disabled={isActive}
            onChange={handleFileChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-sm file:font-medium hover:file:bg-gray-200 disabled:opacity-50"
          />
          <p className="text-xs text-gray-400">Max 1 GB · .csv only</p>
        </div>

        {/* Progress bar — shown while uploading */}
        {(uploadState === "uploading" || uploadState === "processing") && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{uploadState === "processing" ? "Processing…" : "Uploading…"}</span>
              {uploadState === "uploading" && <span>{progress}%</span>}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gray-900 transition-all duration-200"
                style={{
                  width: uploadState === "processing" ? "100%" : `${progress}%`,
                  opacity: uploadState === "processing" ? 0.5 : 1,
                }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Success */}
        {uploadState === "done" && <p className="text-sm text-green-600">Upload complete.</p>}
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
        {uploadState === "error" && (
          <button
            type="button"
            onClick={handleRetry}
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
            onClick={handleUpload}
            disabled={!file || isActive}
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
