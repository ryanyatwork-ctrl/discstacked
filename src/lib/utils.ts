import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
