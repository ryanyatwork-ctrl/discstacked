import type { MediaLookupResult } from "@/lib/media-lookup";

export type SlipcoverStatus = "unknown" | "included" | "missing" | "damaged" | "not_included";
export type ObiStatus = "unknown" | "included" | "missing" | "damaged" | "not_included";
export type DigitalCodeStatus =
  | "Unknown"
  | "Included (Unused)"
  | "Used / Redeemed"
  | "Digital Copy Disc"
  | "Digital-on-Disc"
  | "Missing"
  | "Expired"
  | "Not Included";
export type DiscCondition = "Unknown" | "Good" | "Scratched" | "Damaged" | "Missing";

export interface DiscEntry {
  label: string;
  format: string;
  missing?: boolean;
  aspectRatio?: string;
  condition?: DiscCondition;
  replacementNeeded?: boolean;
  notes?: string;
}

export const CASE_TYPES = [
  "Standard",
  "SteelBook",
  "Box Set",
  "DigiPack",
  "DigiBook",
  "Slipcase",
  "Collection",
  "Multi Pack",
  "Metal Tin",
  "Clamshell",
  "Snap Case",
  "Unique/Custom",
];

export const DIGITAL_PLATFORMS = [
  "Movies Anywhere",
  "Apple TV / iTunes",
  "Vudu / Fandango at Home",
  "Google Play",
  "Prime Video",
  "Paramount Digital",
  "Lionsgate VIP",
  "Sony Pictures Core",
  "UltraViolet",
  "Other",
];

export function normalizeCaseType(value?: string | null): string {
  const v = String(value || "").toLowerCase().trim().replace(/[-_]/g, " ");
  if (!v) return "";
  if (v.includes("steelbook") || v.includes("steel book") || v.includes("futurepak") || v.includes("metalpak")) return "SteelBook";
  if (v.includes("digibook") || v.includes("digi book") || v.includes("booklet")) return "DigiBook";
  if (v.includes("digipack") || v.includes("digipak") || v.includes("digi pack")) return "DigiPack";
  if (v.includes("slipcase") || v.includes("slip case") || v.includes("slip cover") || v.includes("hardbox")) return "Slipcase";
  if (v.includes("box set") || v.includes("boxset") || v.includes("box-set")) return "Box Set";
  if (v.includes("multi pack") || v.includes("multipack") || v.includes("2 pack") || v.includes("3 pack") || v.includes("4 pack") || v.includes("double feature") || v.includes("triple feature")) return "Multi Pack";
  if (v.includes("collection") || v.includes("anthology") || v.includes("quadrilogy") || v.includes("trilogy")) return "Collection";
  if (v.includes("tin") || v.includes("metal tin")) return "Metal Tin";
  if (v.includes("clamshell")) return "Clamshell";
  if (v.includes("snap")) return "Snap Case";
  if (v.includes("custom") || v.includes("unique")) return "Unique/Custom";
  if (v.includes("standard") || v.includes("regular") || v.includes("keep case") || v.includes("amaray") || v.includes("case")) return "Standard";
  return value?.trim() || "Standard";
}
export const CONDITIONS = ["Mint", "Near Mint", "Good", "Fair", "Poor"];
export const SLIPCOVER_STATUSES: { value: SlipcoverStatus; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "included", label: "Included" },
  { value: "missing", label: "Missing" },
  { value: "damaged", label: "Damaged" },
  { value: "not_included", label: "Not Included" },
];
export const DIGITAL_CODE_STATUSES: DigitalCodeStatus[] = [
  "Unknown",
  "Included (Unused)",
  "Used / Redeemed",
  "Digital Copy Disc",
  "Digital-on-Disc",
  "Missing",
  "Expired",
  "Not Included",
];
export const RIP_STATUSES = ["Not Ripped", "Ripped", "Unrippable"];
export const DISC_CONDITIONS: DiscCondition[] = ["Unknown", "Good", "Scratched", "Damaged", "Missing"];
export const PACKAGE_COMPONENT_CONDITIONS = ["Unknown", "Mint", "Near Mint", "Good", "Fair", "Poor", "Missing"] as const;
export const OBI_STATUSES: { value: ObiStatus; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "included", label: "Included" },
  { value: "missing", label: "Missing" },
  { value: "damaged", label: "Damaged" },
  { value: "not_included", label: "Not Included" },
];

export function normalizePhysicalFormats(formats: string[] | undefined | null) {
  return (formats || []).filter((format) => format !== "Digital" && format !== "UltraViolet");
}

export function buildDiscEntries(formats: string[] | undefined | null, discCount?: number | null): DiscEntry[] {
  const physicalFormats = normalizePhysicalFormats(formats);
  const totalDiscs = Math.max(discCount || 0, physicalFormats.length === 0 ? 0 : 1);

  if (totalDiscs === 0 || physicalFormats.length === 0) return [];

  const entries: DiscEntry[] = [];
  const queue = [...physicalFormats];
  for (let index = 0; index < totalDiscs; index += 1) {
    const nextFormat = queue[index] || physicalFormats[Math.min(index, physicalFormats.length - 1)] || physicalFormats[0];
    entries.push({
      label: `Disc ${index + 1}`,
      format: nextFormat,
      condition: "Unknown",
      missing: false,
      replacementNeeded: false,
    });
  }

  return entries;
}

export function deriveEditionLabel(result: Partial<MediaLookupResult>) {
  const edition = result.edition;
  if (edition?.label) return edition.label;
  return undefined;
}

export function buildCollectorFields(result: Partial<MediaLookupResult>) {
  const edition = result.edition;
  const expectedFormats = edition?.formats || result.detected_formats || [];
  const expectedDiscCount = edition?.disc_count || null;
  const digitalCodeExpected = edition?.digital_code_expected ?? expectedFormats.includes("Digital");

  return {
    edition: edition
      ? {
          ...edition,
          label: edition.label || deriveEditionLabel(result),
          package_title: edition.package_title || edition.barcode_title || result.title,
          formats: expectedFormats,
          disc_count: expectedDiscCount,
          digital_code_expected: digitalCodeExpected,
        }
      : undefined,
    discs: buildDiscEntries(expectedFormats, expectedDiscCount),
    slipcover_status: edition?.slipcover_expected === false ? "not_included" : undefined,
    digital_code_status: digitalCodeExpected ? "Unknown" : "Not Included",
  };
}

export function hasCopyIssue(metadata: Record<string, any> | null | undefined) {
  if (!metadata || typeof metadata !== "object") return false;

  const discs = Array.isArray(metadata.discs) ? metadata.discs : [];
  if (discs.some((disc: any) => disc?.missing || disc?.replacementNeeded || disc?.condition === "Scratched" || disc?.condition === "Damaged")) {
    return true;
  }

  if (metadata.slipcover_status === "missing" || metadata.slipcover_status === "damaged") return true;
  if (metadata.obi_status === "missing" || metadata.obi_status === "damaged") return true;
  if (metadata.digital_code_status === "Missing" || metadata.digital_code_status === "Expired") return true;
  if (metadata.case_condition === "Poor" || metadata.case_condition === "Missing") return true;
  if (metadata.booklet_condition === "Poor" || metadata.booklet_condition === "Missing") return true;
  if (metadata.traycard_condition === "Poor" || metadata.traycard_condition === "Missing") return true;
  if (metadata.upgrade_target) return true;

  return false;
}

export function digitalCodeStatusProvidesAccess(status?: string | null) {
  return status === "Included (Unused)" || status === "Used / Redeemed";
}
