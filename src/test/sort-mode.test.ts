import { describe, expect, it } from "vitest";
import { DEFAULT_SORT_MODE, coerceSortMode } from "@/lib/sort-mode";

describe("coerceSortMode", () => {
  it.each([null, undefined, "", "all", "bogus", 42])(
    "falls back to title for invalid persisted value %j",
    (value) => {
      expect(coerceSortMode(value)).toBe(DEFAULT_SORT_MODE);
    },
  );

  it.each(["title", "year", "recent"] as const)("keeps valid mode %s", (value) => {
    expect(coerceSortMode(value)).toBe(value);
  });
});
