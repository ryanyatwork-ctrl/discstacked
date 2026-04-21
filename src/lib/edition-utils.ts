/**
 * Safely extract an edition label string from metadata.
 * The edition field can be either a plain string or an object like
 * { barcode_title: "...", formats: ["Blu-ray"] }.
 * This helper always returns a string or undefined, never an object.
 */
function isGenericEditionLabel(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return true;

  if (/^\d+\s+disc(s)?\b/.test(normalized)) return true;
  if (/^(blu-ray|blu ray|dvd|4k|uhd|ultra hd|digital|3d|cd|vinyl|cassette)(\s*[+/&]\s*|\s+)+/.test(normalized)) return true;
  if (/^(blu-ray|blu ray|dvd|4k|uhd|ultra hd|digital|3d|cd|vinyl|cassette)(\s|$)/.test(normalized)) return true;
  if (normalized.includes(" + digital") || normalized.includes(" / digital")) return true;

  return false;
}

function sanitizeEditionLabel(value: unknown, meta?: Record<string, unknown>) {
  if (typeof value !== "string") return undefined;
  const label = value.trim();
  if (!label) return undefined;
  if (isGenericEditionLabel(label)) return undefined;

  const publisher = typeof meta?.publisher === "string" ? meta.publisher.trim().toLowerCase() : "";
  const studio = typeof meta?.studio === "string" ? meta.studio.trim().toLowerCase() : "";
  const sourceLabel = typeof meta?.label === "string" ? meta.label.trim().toLowerCase() : "";
  const lowered = label.toLowerCase();

  if (lowered === publisher || lowered === studio || lowered === sourceLabel) {
    return undefined;
  }

  return label;
}

export function getEditionLabel(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const meta = metadata as Record<string, unknown>;
  const edition = meta.edition;
  if (!edition) return undefined;
  if (typeof edition === "string") return sanitizeEditionLabel(edition, meta);
  if (typeof edition === "object" && edition !== null) {
    const ed = edition as Record<string, unknown>;
    if (typeof ed.label === "string") return sanitizeEditionLabel(ed.label, meta);
    if (typeof ed.name === "string") return sanitizeEditionLabel(ed.name, meta);
    return undefined;
  }
  return undefined;
}
