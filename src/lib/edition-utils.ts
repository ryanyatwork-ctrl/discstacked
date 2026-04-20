/**
 * Safely extract an edition label string from metadata.
 * The edition field can be either a plain string or an object like
 * { barcode_title: "...", formats: ["Blu-ray"] }.
 * This helper always returns a string or undefined, never an object.
 */
export function getEditionLabel(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const meta = metadata as Record<string, unknown>;
  const edition = meta.edition;
  if (!edition) return undefined;
  if (typeof edition === "string") return edition;
  if (typeof edition === "object" && edition !== null) {
    const ed = edition as Record<string, unknown>;
    // Prefer a human-readable field from the edition object
    if (typeof ed.label === "string") return ed.label;
    if (typeof ed.barcode_title === "string") return ed.barcode_title;
    if (typeof ed.name === "string") return ed.name;
    if (typeof ed.package_title === "string") return ed.package_title;
    // Build from formats if available
    if (Array.isArray(ed.formats) && ed.formats.length > 0) {
      return ed.formats.join(" / ");
    }
    return undefined;
  }
  return undefined;
}
