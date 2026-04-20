export type BarcodeOverride =
  | {
      kind: "movie";
      tmdbId: number;
      title: string;
      year: number;
      packageTitle: string;
      editionLabel?: string;
      formats: string[];
      discCount: number;
      digitalCodeExpected?: boolean | null;
      slipcoverExpected?: boolean | null;
    }
  | {
      kind: "multi_movie";
      productTitle: string;
      collectionName?: string;
      editionLabel?: string;
      movieTmdbIds: number[];
      formats: string[];
      discCount: number;
      digitalCodeExpected?: boolean | null;
      slipcoverExpected?: boolean | null;
    }
  | {
      kind: "tv_box_set";
      productTitle: string;
      showName: string;
      tmdbSeriesId: number;
      seasonNumbers: number[];
      formats: string[];
      discCount: number;
      editionLabel?: string;
      digitalCodeExpected?: boolean | null;
      slipcoverExpected?: boolean | null;
    };

export const BARCODE_OVERRIDES: Record<string, BarcodeOverride> = {
  "191329226674": {
    kind: "movie",
    tmdbId: 675353,
    title: "Sonic the Hedgehog 2",
    year: 2022,
    packageTitle: "Sonic the Hedgehog 2 (Blu-ray + Digital Code)",
    editionLabel: "Blu-ray + Digital Code",
    formats: ["Blu-ray", "Digital"],
    discCount: 1,
    digitalCodeExpected: true,
    slipcoverExpected: null,
  },
  "024543930020": {
    kind: "movie",
    tmdbId: 193610,
    title: "The Other Woman",
    year: 2014,
    packageTitle: "The Other Woman (Blu-ray + Digital HD)",
    editionLabel: "Blu-ray + Digital HD",
    formats: ["Blu-ray", "Digital"],
    discCount: 1,
    digitalCodeExpected: true,
    slipcoverExpected: null,
  },
  "191329144671": {
    kind: "multi_movie",
    productTitle: "Back to the Future: The Ultimate Trilogy (Blu-ray + Digital Code)",
    collectionName: "Back to the Future Collection",
    editionLabel: "Ultimate Trilogy",
    movieTmdbIds: [105, 165, 196],
    formats: ["Blu-ray", "Digital"],
    discCount: 4,
    digitalCodeExpected: true,
    slipcoverExpected: null,
  },
  "024543744719": {
    kind: "movie",
    tmdbId: 10140,
    title: "The Chronicles of Narnia: The Voyage of the Dawn Treader",
    year: 2010,
    packageTitle: "The Chronicles of Narnia: The Voyage of the Dawn Treader (Blu-ray + DVD)",
    editionLabel: "Blu-ray + DVD",
    formats: ["Blu-ray", "DVD"],
    discCount: 2,
    digitalCodeExpected: false,
    slipcoverExpected: null,
  },
  "786936858136": {
    kind: "movie",
    tmdbId: 299536,
    title: "Avengers: Infinity War",
    year: 2018,
    packageTitle: "Avengers: Infinity War (Blu-ray + Digital Code)",
    editionLabel: "Blu-ray + Digital Code",
    formats: ["Blu-ray", "Digital"],
    discCount: 1,
    digitalCodeExpected: true,
    slipcoverExpected: null,
  },
  "786936856330": {
    kind: "movie",
    tmdbId: 284054,
    title: "Black Panther",
    year: 2018,
    packageTitle: "Black Panther (Blu-ray + Digital Code)",
    editionLabel: "Blu-ray + Digital Code",
    formats: ["Blu-ray", "Digital"],
    discCount: 1,
    digitalCodeExpected: true,
    slipcoverExpected: null,
  },
  "883929774685": {
    kind: "movie",
    tmdbId: 791373,
    title: "Zack Snyder's Justice League",
    year: 2021,
    packageTitle: "Zack Snyder's Justice League (Blu-ray)",
    editionLabel: "Blu-ray",
    formats: ["Blu-ray"],
    discCount: 2,
    digitalCodeExpected: false,
    slipcoverExpected: null,
  },
  "794051400123": {
    kind: "tv_box_set",
    productTitle: "Planet Earth: The Complete Series (Blu-ray)",
    showName: "Planet Earth",
    tmdbSeriesId: 1044,
    seasonNumbers: [1],
    formats: ["Blu-ray"],
    discCount: 4,
    editionLabel: "Complete Series",
    digitalCodeExpected: false,
    slipcoverExpected: null,
  },
  "191329118641": {
    kind: "movie",
    tmdbId: 670266,
    title: "Tremors: Shrieker Island",
    year: 2020,
    packageTitle: "Tremors: Shrieker Island (DVD)",
    editionLabel: "DVD",
    formats: ["DVD"],
    discCount: 1,
    digitalCodeExpected: false,
    slipcoverExpected: null,
  },
  "014381514926": {
    kind: "movie",
    tmdbId: 14541,
    title: "Jeff Dunham's Very Special Christmas Special",
    year: 2008,
    packageTitle: "Jeff Dunham's Very Special Christmas Special (DVD)",
    editionLabel: "DVD",
    formats: ["DVD"],
    discCount: 1,
    digitalCodeExpected: false,
    slipcoverExpected: false,
  },
};
