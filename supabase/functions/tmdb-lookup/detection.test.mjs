// Node-runnable regression tests for the pure detection helpers in
// supabase/functions/tmdb-lookup/index.ts.
//
// These helpers live inside the Deno edge function and aren't directly
// importable in Node without a transpile step. To keep the edge function
// a single deployable file (matching every other function in this repo)
// we re-declare the pure logic here. If you change MULTI_MOVIE_KEYWORDS,
// detectFormats, the slash-split prefix rule, or the collection ranking
// in index.ts, mirror the change here and re-run `node detection.test.mjs`.
//
// Usage: node supabase/functions/tmdb-lookup/detection.test.mjs

import assert from "node:assert/strict";

// ---------------- mirror of index.ts ----------------

const MULTI_MOVIE_KEYWORDS = /\b(collection|trilogy|quadrilogy|pentalogy|hexalogy|anthology|box\s*set|boxset|double\s*feature|triple\s*feature|complete\s*(series|saga)|pack|[2-9][\s-]?(film|movie)s?)\b/i;

function detectFormats(text) {
  const t = text.toUpperCase();
  const detected = [];
  if (/\b(4K|ULTRA\s*HD|UHD)\b/.test(t)) detected.push("4K");
  if (/\bBLU[-\s]?RAY\b/.test(t)) detected.push("Blu-ray");
  if (/\bDVD\b/.test(t)) detected.push("DVD");
  if (/\b(DIGITAL(?:\s*(?:CODE|COPY|HD|DOWNLOAD|MOVIE))?|STREAMING)\b/.test(t)) detected.push("Digital");
  if (/\bVHS\b/.test(t)) detected.push("VHS");
  return detected;
}

function splitAndStripPrefix(cleanTitle) {
  const movieTitles = cleanTitle.split(" / ").map(t => t.trim()).filter(Boolean);
  if (movieTitles.length > 1 && movieTitles[0].includes(":")) {
    const colonIdx = movieTitles[0].indexOf(":");
    const prefix = movieTitles[0].substring(0, colonIdx);
    if (MULTI_MOVIE_KEYWORDS.test(prefix)) {
      movieTitles[0] = movieTitles[0].substring(colonIdx + 1).trim();
    }
  }
  return movieTitles;
}

function extractFranchiseName(cleanTitle) {
  const globalKeywords = new RegExp(MULTI_MOVIE_KEYWORDS.source, "gi");
  return cleanTitle
    .replace(globalKeywords, "")
    .replace(/[:,;]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreCollectionMatch(collectionName, franchiseName) {
  const cn = (collectionName || "").toLowerCase();
  const fn = (franchiseName || "").toLowerCase().trim();
  const cnBase = cn
    .replace(/\s*(series\s*collection|collection|saga|trilogy|anthology|quadrilogy|pentalogy)\s*$/i, "")
    .trim();
  const fnCore = fn.replace(/^the\s+/, "").replace(/\s+series$/, "").trim();
  const cnCore = cnBase.replace(/^the\s+/, "").replace(/\s+series$/, "").trim();
  if (cnCore && fnCore && cnCore === fnCore) return 100;
  if (cnBase === fn) return 95;
  if (cn === fn) return 92;
  if (fnCore && cnCore && (cnCore.startsWith(fnCore + " ") || fnCore.startsWith(cnCore + " "))) return 80;
  if (cnBase.startsWith(fn + " ") || fn.startsWith(cnBase + " ")) return 75;
  if (fn.length >= 4 && cn.includes(fn)) return 55;
  return 0;
}

// ---------------- tests ----------------

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
    fail++;
  }
}

console.log("MULTI_MOVIE_KEYWORDS");
test("matches 'Collection'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Dragonheart Collection")));
test("matches 'Quadrilogy'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Alien Quadrilogy")));
test("matches 'Pentalogy'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Some Pentalogy")));
test("matches '5-Movie'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Dragonheart 5-Movie Collection")));
test("matches '5 Movie' with space", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Dragonheart 5 Movie Collection")));
test("matches '3-Film'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Divergent 3-Film Collection")));
test("matches '3 Film'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Divergent 3 Film Collection")));
test("matches 'Box Set'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Star Wars Box Set")));
test("matches 'Boxset'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Star Wars Boxset")));
test("matches 'Complete Saga'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Star Wars Complete Saga")));
test("matches 'Complete Series'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Friends Complete Series")));
test("matches 'Double Feature'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Rocky Double Feature")));
test("matches 'Anthology'", () => assert.ok(MULTI_MOVIE_KEYWORDS.test("Halloween Anthology")));
test("doesn't match plain movie", () => assert.ok(!MULTI_MOVIE_KEYWORDS.test("Alien")));
test("doesn't match 'The Godfather'", () => assert.ok(!MULTI_MOVIE_KEYWORDS.test("The Godfather")));

console.log("\ndetectFormats");
test("Blu-ray alone", () => assert.deepEqual(detectFormats("[Blu-ray]"), ["Blu-ray"]));
test("4K + Blu-ray + Digital Code (Divergent case)", () =>
  assert.deepEqual(detectFormats("The Divergent Series 3-Film Collection [Blu-ray + Digital Code]"), ["Blu-ray", "Digital"]));
test("Blu-ray + DVD", () => assert.deepEqual(detectFormats("Alien Quadrilogy Blu-ray + DVD"), ["Blu-ray", "DVD"]));
test("4K + Blu-ray + Digital", () =>
  assert.deepEqual(detectFormats("Matrix Trilogy 4K Ultra HD Blu-ray + Digital"), ["4K", "Blu-ray", "Digital"]));
test("Digital Copy captured alongside Blu-ray", () =>
  assert.deepEqual(detectFormats("Movie Title Blu-ray + Digital Copy"), ["Blu-ray", "Digital"]));
test("Digital HD captured alongside 4K", () =>
  assert.deepEqual(detectFormats("Movie 4K UHD + Digital HD"), ["4K", "Digital"]));
test("Bluray no hyphen", () => assert.deepEqual(detectFormats("Bluray edition"), ["Blu-ray"]));
test("Blu Ray with space", () => assert.deepEqual(detectFormats("Blu Ray special"), ["Blu-ray"]));
test("DVD alone", () => assert.deepEqual(detectFormats("Movie on DVD"), ["DVD"]));
test("VHS alone", () => assert.deepEqual(detectFormats("Movie on VHS"), ["VHS"]));
test("No formats for plain title", () => assert.deepEqual(detectFormats("Jurassic Park"), []));
test("4K word-boundary does not match '24K GOLD'", () =>
  assert.deepEqual(detectFormats("24K GOLD EDITION"), []));

console.log("\nsplitAndStripPrefix");
test("Alien Quadrilogy prefix stripped from first title", () => {
  const result = splitAndStripPrefix("Alien Quadrilogy: Alien / Aliens / Alien 3 / Alien Resurrection");
  assert.deepEqual(result, ["Alien", "Aliens", "Alien 3", "Alien Resurrection"]);
});
test("Plain slash-split (no prefix) left alone", () => {
  const result = splitAndStripPrefix("Die Hard / Die Harder / Die Hard with a Vengeance");
  assert.deepEqual(result, ["Die Hard", "Die Harder", "Die Hard with a Vengeance"]);
});
test("Non-keyword colon-prefix left alone (real movie title with colon)", () => {
  // "Alien: Resurrection / Aliens" — first title legitimately has a colon.
  const result = splitAndStripPrefix("Alien: Resurrection / Aliens");
  assert.deepEqual(result, ["Alien: Resurrection", "Aliens"]);
});
test("Divergent-style prefix stripped", () => {
  const result = splitAndStripPrefix("The Divergent Series Collection: Divergent / Insurgent / Allegiant");
  assert.deepEqual(result, ["Divergent", "Insurgent", "Allegiant"]);
});

console.log("\nextractFranchiseName");
test("Alien Quadrilogy → Alien", () =>
  assert.equal(extractFranchiseName("Alien Quadrilogy"), "Alien"));
test("The Divergent Series: 3-Film Collection → The Divergent Series", () =>
  assert.equal(extractFranchiseName("The Divergent Series: 3-Film Collection"), "The Divergent Series"));
test("Dragonheart: 5-Movie Collection → Dragonheart", () =>
  assert.equal(extractFranchiseName("Dragonheart: 5-Movie Collection"), "Dragonheart"));
test("Dragonheart 5 Movie Collection → Dragonheart", () =>
  assert.equal(extractFranchiseName("Dragonheart 5 Movie Collection"), "Dragonheart"));
test("Star Wars Complete Saga → Star Wars", () =>
  assert.equal(extractFranchiseName("Star Wars Complete Saga"), "Star Wars"));
test("Matrix Trilogy → Matrix", () =>
  assert.equal(extractFranchiseName("Matrix Trilogy"), "Matrix"));

console.log("\nscoreCollectionMatch");
test("Exact: Dragonheart vs Dragonheart Collection", () =>
  assert.equal(scoreCollectionMatch("Dragonheart Collection", "Dragonheart"), 100));
test("Exact: Alien vs Alien Collection", () =>
  assert.equal(scoreCollectionMatch("Alien Collection", "Alien"), 100));
test("The-prefix mismatch: Divergent Series vs The Divergent Collection", () =>
  assert.ok(scoreCollectionMatch("The Divergent Collection", "The Divergent Series") >= 80));
test("Close match: Bourne Series vs The Bourne Collection", () =>
  assert.ok(scoreCollectionMatch("The Bourne Collection", "Bourne Series") >= 80));
test("No match: Dragonheart vs The Godfather Collection", () =>
  assert.equal(scoreCollectionMatch("The Godfather Collection", "Dragonheart"), 0));
test("No match: short franchise 'Go' doesn't over-match", () =>
  assert.equal(scoreCollectionMatch("The Godfather Collection", "Go"), 0));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
