export type SortMode = "artist" | "title" | "year" | "recent";

export const DEFAULT_SORT_MODE: SortMode = "title";

export function coerceSortMode(value: unknown): SortMode {
  return value === "artist" || value === "year" || value === "recent" || value === "title"
    ? value
    : DEFAULT_SORT_MODE;
}
