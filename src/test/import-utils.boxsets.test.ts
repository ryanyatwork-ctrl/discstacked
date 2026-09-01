import { describe, expect, it } from "vitest";
import { expandBoxSets } from "@/lib/import-utils";

/**
 * Regression tests for expandBoxSets().
 *
 * Background: expandBoxSets() may *delete* an imported row (a box set is hidden
 * once its films are present individually). Deletion is the dangerous branch —
 * a false positive silently removes a disc the user owns from their collection.
 * These tests pin down when deletion is allowed.
 *
 * Fixtures are hand-written release names chosen to reproduce shapes observed in
 * a real Collectorz Blu-ray export; no third-party collection data is committed.
 */

type Item = Record<string, unknown>;
type BoxSetRef = { title: string; format: string; barcode?: string; disc_count?: string };

const movie = (title: string, opts: Item = {}): Item => ({
  title,
  year: 2010,
  format: "Blu-ray",
  formats: ["Blu-ray"],
  barcode: opts.barcode ?? `bc-${title.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
  ...opts,
  metadata: { disc_count: "1", ...((opts.metadata as Item) ?? {}) },
});

const titles = (items: Item[]) => items.map((i) => String(i.title));
const boxSetsOf = (item: Item): BoxSetRef[] =>
  JSON.parse(String((item?.metadata as Item)?.box_sets ?? "[]"));
const find = (items: Item[], title: string) => items.find((i) => i.title === title)!;

describe("expandBoxSets — multi-disc single films are not box sets", () => {
  it("keeps a 4K release that ships three discs", () => {
    const out = expandBoxSets([movie("Interstellar 4K", { metadata: { disc_count: "3" } })]);
    expect(titles(out)).toContain("Interstellar 4K");
  });

  it("keeps both the standard and the 4K edition of the same film", () => {
    const out = expandBoxSets([
      movie("Interstellar", { metadata: { disc_count: "3" } }),
      movie("Interstellar 4K", { metadata: { disc_count: "3" } }),
    ]);
    expect(titles(out)).toEqual(expect.arrayContaining(["Interstellar", "Interstellar 4K"]));
  });

  it("keeps a five-disc single film", () => {
    const out = expandBoxSets([
      movie("The Lord of the Rings: The Two Towers", { metadata: { disc_count: "5" } }),
    ]);
    expect(titles(out)).toContain("The Lord of the Rings: The Two Towers");
  });

  it("keeps a multi-disc documentary series that was not routed to the TV tab", () => {
    const out = expandBoxSets([movie("Frozen Planet", { metadata: { disc_count: "3" } })]);
    expect(titles(out)).toContain("Frozen Planet");
  });
});

describe("expandBoxSets — box-set phrases are matched on word boundaries", () => {
  it("does not treat 'Saga' in a film's subtitle as a box set", () => {
    const out = expandBoxSets([
      movie("Mad Max: Fury Road"),
      movie("Furiosa: A Mad Max Saga"),
    ]);
    expect(titles(out)).toContain("Furiosa: A Mad Max Saga");
  });

  it("does not match 'set' inside an ordinary word", () => {
    const out = expandBoxSets([movie("Sunset Boulevard"), movie("Sunset")]);
    expect(titles(out)).toContain("Sunset Boulevard");
  });

  it("does not match 'pack' inside a packaging note", () => {
    const out = expandBoxSets([
      movie("Jason Bourne Limited Exclusive Edition Fold Out Neo-pack/Digipack with Booklet", {
        metadata: { disc_count: "2" },
      }),
      movie("Jason Bourne"),
    ]);
    expect(titles(out)).toContain(
      "Jason Bourne Limited Exclusive Edition Fold Out Neo-pack/Digipack with Booklet",
    );
  });

  it("still recognises genuine set phrases", () => {
    const out = expandBoxSets([
      movie("Doctor Sleep"),
      movie("The Shining"),
      movie("2-Film Collection: Doctor Sleep and The Shining", { metadata: { disc_count: "2" } }),
    ]);
    expect(titles(out)).not.toContain("2-Film Collection: Doctor Sleep and The Shining");
  });
});

describe("expandBoxSets — a set is only hidden on two or more confirmed contents", () => {
  it("keeps a collection when only one of its films is owned individually", () => {
    const out = expandBoxSets([
      movie("Dirty Harry"),
      movie("Dirty Harry Collection", { metadata: { disc_count: "5" } }),
    ]);
    expect(titles(out)).toContain("Dirty Harry Collection");
  });

  it("does not tag a film with a box set that was never confirmed", () => {
    const out = expandBoxSets([
      movie("Dirty Harry"),
      movie("Dirty Harry Collection", { metadata: { disc_count: "5" } }),
    ]);
    expect(boxSetsOf(find(out, "Dirty Harry"))).toEqual([]);
  });

  it("hides a collection once two of its films are owned individually", () => {
    const out = expandBoxSets([
      movie("Doctor Sleep"),
      movie("The Shining"),
      movie("Doctor Sleep and The Shining 2-Film Collection", {
        barcode: "bc-set",
        metadata: { disc_count: "2" },
      }),
    ]);
    expect(titles(out)).not.toContain("Doctor Sleep and The Shining 2-Film Collection");
    expect(boxSetsOf(find(out, "Doctor Sleep"))[0]).toMatchObject({
      title: "Doctor Sleep and The Shining 2-Film Collection",
      barcode: "bc-set",
      disc_count: "2",
    });
  });

  it("does not accept a short title appearing coincidentally inside a set title", () => {
    const out = expandBoxSets([
      movie("Her"),
      movie("Rio"),
      movie("The Shepherd and the Priority Collection", { metadata: { disc_count: "4" } }),
    ]);
    expect(titles(out)).toContain("The Shepherd and the Priority Collection");
  });
});

describe("expandBoxSets — slash-separated sets", () => {
  it("splits a two-film disc into its films", () => {
    const out = expandBoxSets([
      movie("Capote / In Cold Blood", { barcode: "bc-pair", metadata: { disc_count: "2" } }),
    ]);
    expect(titles(out)).toEqual(expect.arrayContaining(["Capote", "In Cold Blood"]));
    expect(titles(out)).not.toContain("Capote / In Cold Blood");
  });

  it("keeps the set's barcode recorded on each film it produced", () => {
    const out = expandBoxSets([
      movie("Capote / In Cold Blood", { barcode: "bc-pair", metadata: { disc_count: "2" } }),
    ]);
    for (const title of ["Capote", "In Cold Blood"]) {
      expect(boxSetsOf(find(out, title))[0]).toMatchObject({
        title: "Capote / In Cold Blood",
        barcode: "bc-pair",
      });
    }
  });

  it("links to a film already in the collection instead of duplicating it", () => {
    const out = expandBoxSets([
      movie("Capote"),
      movie("Capote / In Cold Blood", { barcode: "bc-pair", metadata: { disc_count: "2" } }),
    ]);
    expect(titles(out).filter((t) => t === "Capote")).toHaveLength(1);
    expect(boxSetsOf(find(out, "Capote"))).toHaveLength(1);
  });
});

describe("expandBoxSets — nothing without a set signal is ever removed", () => {
  // Each multi-disc single film here sits next to a shorter title of its own
  // franchise, which is what turned it into a false "box set": the shorter
  // title matched as a substring, so the longer one was treated as a confirmed
  // set and deleted. A collection of any size contains these pairs.
  it("returns every ordinary title untouched, even beside franchise neighbours", () => {
    const ordinary = [
      movie("Spider-Man"),
      movie("The Amazing Spider-Man", { metadata: { disc_count: "3" } }),
      movie("The Amazing Spider-Man 3D", { metadata: { disc_count: "4" } }),
      movie("The Incredibles", { metadata: { disc_count: "4" } }),
      movie("Incredibles 2", { metadata: { disc_count: "3" } }),
      movie("Incredibles 2 4K", { metadata: { disc_count: "3" } }),
      movie("Predator"),
      movie("Predators", { metadata: { disc_count: "3" } }),
      movie("Onward"),
      movie("Onward 4K", { metadata: { disc_count: "3" } }),
      movie("Dunkirk"),
      movie("Dunkirk 4K", { metadata: { disc_count: "3" } }),
      movie("Avengers: Endgame"),
      movie("Avengers: Endgame 4K", { metadata: { disc_count: "3" } }),
      movie("Kung Fu Panda", { metadata: { disc_count: "3" } }),
      movie("Rogue One: A Star Wars Story", { metadata: { disc_count: "3" } }),
    ];
    const out = expandBoxSets(ordinary);
    expect(titles(out)).toEqual(expect.arrayContaining(titles(ordinary)));
  });

  it("never drops a barcode without recording where it went", () => {
    const items = [
      movie("Interstellar 4K", { metadata: { disc_count: "3" } }),
      movie("Doctor Sleep"),
      movie("The Shining"),
      movie("Doctor Sleep and The Shining 2-Film Collection", {
        barcode: "bc-set",
        metadata: { disc_count: "2" },
      }),
      movie("Capote / In Cold Blood", { barcode: "bc-pair", metadata: { disc_count: "2" } }),
    ];
    const out = expandBoxSets(items);

    const surviving = new Set(out.map((i) => i.barcode).filter(Boolean));
    const recorded = new Set(out.flatMap((i) => boxSetsOf(i).map((s) => s.barcode)));

    for (const item of items) {
      if (surviving.has(item.barcode)) continue;
      expect(recorded).toContain(item.barcode);
    }
  });
});
