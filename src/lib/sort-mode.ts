export type SortMode = "title" | "year" | "recent";

export const DEFAULT_SORT_MODE: SortMode = "title";

export function coerceSortMode(value: unknown): SortMode {
  return value === "year" || value === "recent" || value === "title"
    ? value
    : DEFAULT_SORT_MODE;
}
