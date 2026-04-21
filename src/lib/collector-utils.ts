import type { MediaLookupResult } from "@/lib/media-lookup";

export type SlipcoverStatus = "unknown" | "included" | "missing" | "damaged" | "not_included";
export type ObiStatus = "unknown" | "included" | "missing" | "damaged" | "not_included";
export type DigitalCodeStatus =
  | "Unknown"
  | "Included (Unused)"
  | "Used / Redeemed"
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
}

export const CASE_TYPES = ["Regular", "Steelbook", "Digipack", "Slipcase", "Box Set", "Unique/Custom"];
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

  const packageTitle = edition?.package_title || edition?.barcode_title || result.title || "";
  const title = result.title || "";

  if (title && packageTitle.toLowerCase().startsWith(title.toLowerCase())) {
    const suffix = packageTitle.slice(title.length).replace(/^[\s:,-]+/, "").trim();
    if (suffix) return suffix;
  }

  const bits: string[] = [];
  if (edition?.formats?.length) bits.push(edition.formats.join(" + "));
  if (edition?.disc_count && edition.disc_count > 1) bits.push(`${edition.disc_count} discs`);

  return bits.length > 0 ? bits.join(" · ") : undefined;
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
    slipcover_status: edition?.slipcover_expected === false ? "not_included" : "unknown",
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
