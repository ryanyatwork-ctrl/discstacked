export type CollectionViewMode = "collector" | "vertical-cards" | "horizontal-cards" | "list";

export const DEFAULT_COLLECTION_VIEW: CollectionViewMode = "collector";

const LEGACY_VIEW_MODE_MAP: Record<string, CollectionViewMode> = {
  collector: "collector",
  pro: "collector",
  table: "collector",
  covers: "vertical-cards",
  editions: "horizontal-cards",
  list: "list",
};

export function coerceCollectionViewMode(value: string | null | undefined): CollectionViewMode {
  if (!value) return DEFAULT_COLLECTION_VIEW;

  if (value === "collector" || value === "vertical-cards" || value === "horizontal-cards" || value === "list") {
    return value;
  }

  return LEGACY_VIEW_MODE_MAP[value] || DEFAULT_COLLECTION_VIEW;
}

