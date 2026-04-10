import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanProductTitle, generateTitleCandidates, scoreMovieResult } from "./lookup-utils.ts";

Deno.test("cleanProductTitle strips distributor and edition suffix noise", () => {
  assertEquals(
    cleanProductTitle("Silent Night Deadly Night Collector's Edition Cineverse"),
    "Silent Night Deadly Night",
  );

  assertEquals(
    cleanProductTitle("Coyote Ugly Mill Creek Entertainment"),
    "Coyote Ugly",
  );
});

Deno.test("generateTitleCandidates keeps the base movie title when barcode text appends genre fragments", () => {
  const candidates = generateTitleCandidates("Sisu: Road to Revenge Action &");

  assert(candidates.includes("Sisu: Road to Revenge"));
  assert(candidates.includes("Sisu"));
});

Deno.test("scoreMovieResult strongly prefers the barcode year for remake titles", () => {
  const remakeScore = scoreMovieResult(
    "Planet of the Apes",
    { id: 1, title: "Planet of the Apes", release_date: "2001-07-27", popularity: 20 },
    2001,
  );

  const originalScore = scoreMovieResult(
    "Planet of the Apes",
    { id: 2, title: "Planet of the Apes", release_date: "1968-02-07", popularity: 40 },
    2001,
  );

  assert(remakeScore > originalScore);
});