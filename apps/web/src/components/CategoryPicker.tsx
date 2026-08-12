import { api } from "@/lib/api.ts";
import type { Category } from "@acostator/shared";
import { useEffect, useRef, useState } from "react";

interface CategoryOption {
  id: string;
  name: string;
}

interface CategoriesResponse {
  data: Category[];
}

interface CreateCategoryResponse {
  data: Category;
}

interface CategoryPickerProps {
  projectId: string;
  value: CategoryOption | null;
  onChange: (category: CategoryOption) => void;
}

/**
 * Searchable dropdown for categories.
 * Fetches GET /projects/:projectId/categories once on mount, then filters locally.
 * Shows matches + "Create new" option.
 */
export function CategoryPicker({ projectId, value, onChange }: CategoryPickerProps) {
  const [query, setQuery] = useState("");
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch all categories once on mount — no further API calls for search
  useEffect(() => {
    setLoadingAll(true);
    setError(null);
    api
      .get<CategoriesResponse>(`/projects/${projectId}/categories`)
      .then((res) => setAllCategories(res.data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load categories")
      )
      .finally(() => setLoadingAll(false));
  }, [projectId]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Local filter — zero API calls on search
  const options = allCategories.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  function handleOpen() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(cat: Category) {
    onChange({ id: cat.id, name: cat.name });
    setOpen(false);
    setQuery("");
  }

  async function handleCreate() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const res = await api.post<CreateCategoryResponse>(`/projects/${projectId}/categories`, {
        name,
      });
      setAllCategories((prev) => [...prev, res.data]);
      onChange({ id: res.data.id, name: res.data.name });
      setOpen(false);
      setQuery("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setCreating(false);
    }
  }

  const trimmedQuery = query.trim();
  const exactMatch = options.some((o) => o.name.toLowerCase() === trimmedQuery.toLowerCase());
  const showCreate = trimmedQuery.length > 0 && !exactMatch;

  return (
    <div ref={containerRef} className="relative">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Category</p>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {value ? (
          <span>{value.name}</span>
        ) : (
          <span className="text-gray-400">Search or create a category...</span>
        )}
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && showCreate) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="Search categories..."
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              aria-label="Search categories"
            />
          </div>

          {error && <p className="px-3 py-2 text-xs text-red-500">{error}</p>}

          <ul aria-label="Category options" className="max-h-48 overflow-y-auto py-1">
            {loadingAll && <li className="px-3 py-2 text-xs text-gray-400">Loading...</li>}

            {!loadingAll && options.length === 0 && !showCreate && (
              <li className="px-3 py-2 text-xs text-gray-400">
                {trimmedQuery ? "No matches found." : "Start typing to search."}
              </li>
            )}

            {options.map((cat) => (
              <li
                key={cat.id}
                aria-selected={value?.id === cat.id}
                onClick={() => handleSelect(cat)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleSelect(cat);
                }}
                className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
              >
                <span>{cat.name}</span>
                {value?.id === cat.id && <span className="text-gray-400 text-xs">selected</span>}
              </li>
            ))}

            {showCreate && (
              <li
                aria-selected={false}
                onClick={() => void handleCreate()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") void handleCreate();
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-t border-gray-100"
              >
                <span className="text-gray-400">+</span>
                <span>{creating ? "Creating..." : `Create "${trimmedQuery}"`}</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
