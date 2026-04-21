import { describe, expect, it } from "vitest";
import { getEditionLabel } from "@/lib/edition-utils";

describe("edition-utils", () => {
  it("hides generic generated edition labels", () => {
    expect(getEditionLabel({ edition: "1 Disc DVD" })).toBeUndefined();
    expect(getEditionLabel({ edition: "Blu-ray + Digital" })).toBeUndefined();
    expect(getEditionLabel({ edition: { label: "Blu-ray + Digital" } })).toBeUndefined();
  });

  it("keeps meaningful collector edition labels", () => {
    expect(getEditionLabel({ edition: "25th Anniversary Edition" })).toBe("25th Anniversary Edition");
    expect(getEditionLabel({ edition: { label: "Motion Picture Trilogy" } })).toBe("Motion Picture Trilogy");
  });

  it("hides label and publisher values masquerading as editions", () => {
    expect(getEditionLabel({ edition: "Warner Bros", publisher: "Warner Bros" })).toBeUndefined();
    expect(getEditionLabel({ edition: { label: "Elektra" }, label: "Elektra" })).toBeUndefined();
  });
});
