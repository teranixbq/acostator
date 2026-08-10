import { api } from "@/lib/api.ts";
import type { Project } from "@acostator/shared";
import { useEffect, useRef, useState } from "react";

interface Props {
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export function CreateProjectModal({ onClose, onCreated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [annotationOrder, setAnnotationOrder] = useState<"sequential" | "random">("sequential");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open dialog and focus first field
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    firstInputRef.current?.focus();

    // Close on backdrop click
    const handleClick = (e: MouseEvent) => {
      const rect = dialog.getBoundingClientRect();
      const clickedOutside =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom;
      if (clickedOutside) onClose();
    };
    dialog.addEventListener("click", handleClick);
    return () => dialog.removeEventListener("click", handleClick);
  }, [onClose]);

  // Native <dialog> handles Escape key automatically — sync state on close
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await api.post<{ data: Project }>("/projects", {
        name: name.trim(),
        description: description.trim() || undefined,
        annotation_order: annotationOrder,
      });
      onCreated(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-md rounded-xl p-0 shadow-xl backdrop:bg-black/40"
      aria-labelledby="create-project-title"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 pt-6 pb-2">
          <h2 id="create-project-title" className="text-base font-semibold">
            New project
          </h2>
        </div>

        <div className="space-y-4 px-6 py-4">
          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="project-name" className="block text-sm font-medium text-gray-700">
              Name <span aria-hidden="true">*</span>
            </label>
            <input
              ref={firstInputRef}
              id="project-name"
              type="text"
              required
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              placeholder="My annotation project"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label
              htmlFor="project-description"
              className="block text-sm font-medium text-gray-700"
            >
              Description
            </label>
            <textarea
              id="project-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              placeholder="Optional description"
            />
          </div>

          {/* Annotation order */}
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-gray-700">
              Annotation order
            </legend>
            <div className="flex gap-4">
              {(["sequential", "random"] as const).map((order) => (
                <label key={order} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="annotation_order"
                    value={order}
                    checked={annotationOrder === order}
                    onChange={() => setAnnotationOrder(order)}
                    className="accent-gray-900"
                  />
                  <span className="capitalize">{order}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
