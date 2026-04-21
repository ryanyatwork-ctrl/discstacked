import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { MediaItem } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Strip leading articles (A, An, The) for sorting/grouping purposes */
export function sortTitle(title: string, customSortTitle?: string): string {
  const base = customSortTitle || title;
  return base.replace(/^(the|a|an)\s+/i, "");
}

/** Get the grouping letter for a title (ignoring leading articles) */
export function groupLetter(title: string, customSortTitle?: string): string {
  const stripped = sortTitle(title, customSortTitle);
  const first = stripped[0]?.toUpperCase();
  return first && /[A-Z]/.test(first) ? first : "#";
}

function normalizeSequence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getCollectorSortKey(item: Pick<MediaItem, "title" | "sortTitle" | "metadata">): string {
  const metadata = (item.metadata as Record<string, any> | undefined) || {};
  const seriesName = typeof metadata.series_sort_name === "string" ? metadata.series_sort_name.trim() : "";
  const sequence = normalizeSequence(metadata.series_sort_order);

  if (seriesName) {
    const sequencePart = sequence != null ? String(sequence).padStart(4, "0") : "9999";
    return `${sortTitle(seriesName)} ${sequencePart} ${sortTitle(item.title, item.sortTitle)}`;
  }

  return sortTitle(item.title, item.sortTitle);
}

export function getCollectorGroupLetter(item: Pick<MediaItem, "title" | "sortTitle" | "metadata">): string {
  const metadata = (item.metadata as Record<string, any> | undefined) || {};
  const seriesName = typeof metadata.series_sort_name === "string" ? metadata.series_sort_name.trim() : "";
  return groupLetter(seriesName || item.title, seriesName ? undefined : item.sortTitle);
}
