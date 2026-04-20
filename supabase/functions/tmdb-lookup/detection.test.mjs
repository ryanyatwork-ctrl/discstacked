// Node-runnable regression tests for the pure detection helpers in
// supabase/functions/tmdb-lookup/index.ts.
//
// These helpers live inside the Deno edge function and aren't directly
// importable in Node without a transpile step. To keep the edge function
// a single deployable file (matching every other function in this repo)
// we re-declare the pure logic here. If you change MULTI_MOVIE_KEYWORDS,
// TV_KEYWORDS, ORDINAL_WORDS, parseTvIndicator, detectFormats, the
// slash-split prefix rule, or the collection ranking in index.ts, mirror
// the change here and re-run `node detection.test.mjs`.
//
// Usage: node supabase/functions/tmdb-lookup/detection.test.mjs

import assert from "node:assert/strict";

// ---------------- mirror of index.ts ----------------

const MULTI_MOVIE_KEYWORDS = /\b(collection|trilogy|quadrilogy|pentalogy|hexalogy|anthology|box\s*set|boxset|double\s*feature|triple\s*feature|complete\s*saga|pack|[2-9][\s-]?(film|movie)s?)\b/i;

const TV_KEYWORDS = /\b(complete\s*(series|seasons?)|season[s]?\s*\d+(\s*[-–]\s*\d+)?|the\s+complete\s+\w+\s+season|mini[-\s]?series)\b/i;

const ORDINAL_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16,
  seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
};

function parseTvIndicator(title) {
  const completeSeriesMatch = title.match(/^(.+?)\s*[:\-–]?\s*(?:the\s+)?complete\s+series\b.*$/i);
  if (completeSeriesMatch) {
    return { kind: "complete", showName: completeSeriesMatch[1].trim().replace(/[:\-–\s]+$/g, "").trim() };
  }
  const rangeMatch = title.match(/^(.+?)\s*[:\-–]?\s*seasons?\s*(\d+)\s*[-–]\s*(\d+)\b/i);
  if (rangeMatch) {
    const from = parseInt(rangeMatch[2]);
    const to = parseInt(rangeMatch[3]);
    if (from && to && to >= from) {
      return { kind: "range", from, to, showName: rangeMatch[1].trim().replace(/[:\-–\s]+$/g, "").trim() };
    }
  }
  const numericMatch = title.match(/^(.+?)\s*[:\-–]?\s*(?:the\s+)?(?:complete\s+)?season\s*(\d+)\b/i);
  if (numericMatch) {
    const seasonNum = parseInt(numericMatch[2]);
    if (seasonNum) {
      return { kind: "single", seasonNum, showName: numericMatch[1].trim().replace(/[:\-–\s]+$/g, "").trim() };
    }
  }
  const ordinalMatch = title.match(/^(.+?)\s*[:\-–]\s*(?:the\s+)?(?:complete\s+)?(\w+)\s+season\b/i);
  if (ordinalMatch) {
    const word = ordinalMatch[2].toLowerCase();
    if (ORDINAL_WORDS[word]) {
      return { kind: "single", seasonNum: ORDINAL_WORDS[word], showName: ordinalMatch[1].trim().replace(/[:\-–\s]+$/g, "").trim() };
    }
  }
  const miniMatch = title.match(/^(.+?)\s*[:\-–]?\s*mini[-\s]?series\b/i);
  if (miniMatch) {
    return { kind: "complete", showName: miniMatch[1].trim().replace(/[:\-–\s]+$/g, "").trim() };
  }
  return { kind: "none" };
}

function detectFormats(text) {
  const t = text.toUpperCase();
  const detected = [];
  if (/\b(4K|ULTRA\s*HD|UHD)\b/.test(t)) detected.push("4K");
  if (/\bBLU[-\s]?RAY\b/.test(t)) detected.push("Blu-ray");
  if (/\b3D\b/.test(t)) detected.push("3D");
  if (/\bDVD\b/.test(t)) detected.push("DVD");
  if (/\b(DIGITAL(?:\s*(?:CODE|COPY|HD|DOWNLOAD|MOVIE))?|STREAMING)\b/.test(t)) detected.push("Digital");
  if (/\bVHS\b/.test(t)) detected.push("VHS");
  if (/\bULTRAVIOLET\b/.test(t)) detected.push("UltraViolet");
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
test("'Complete Series' no longer matches MULTI_MOVIE (now TV)", () =>
  assert.ok(!MULTI_MOVIE_KEYWORDS.test("Friends Complete Series")));
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
test("Blu-ray 3D captured alongside Blu-ray", () =>
  assert.deepEqual(detectFormats("Men in Black 3 Blu-ray 3D + Blu-ray + DVD"), ["Blu-ray", "3D", "DVD"]));
test("UltraViolet captured as its own format", () =>
  assert.deepEqual(detectFormats("Movie Blu-ray + UltraViolet"), ["Blu-ray", "UltraViolet"]));
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

console.log("\nTV_KEYWORDS");
test("matches 'Complete Series'", () => assert.ok(TV_KEYWORDS.test("Friends: The Complete Series")));
test("matches 'Season 1'", () => assert.ok(TV_KEYWORDS.test("Breaking Bad Season 1")));
test("matches 'Seasons 1-3' (hyphen range)", () =>
  assert.ok(TV_KEYWORDS.test("The Wire Seasons 1-3")));
test("matches 'Seasons 1–3' (en-dash range)", () =>
  assert.ok(TV_KEYWORDS.test("The Wire Seasons 1–3")));
test("matches 'The Complete Seventh Season' ordinal form", () =>
  assert.ok(TV_KEYWORDS.test("Seinfeld: The Complete Seventh Season")));
test("matches 'Miniseries'", () => assert.ok(TV_KEYWORDS.test("Band of Brothers Miniseries")));
test("matches 'Mini-Series' with hyphen", () =>
  assert.ok(TV_KEYWORDS.test("Chernobyl Mini-Series")));
test("matches 'Complete Seasons'", () => assert.ok(TV_KEYWORDS.test("Lost: The Complete Seasons")));
test("doesn't match a plain movie title", () => assert.ok(!TV_KEYWORDS.test("The Godfather")));
test("doesn't match 'Season's Greetings' (apostrophe, no number)", () =>
  assert.ok(!TV_KEYWORDS.test("Season's Greetings")));

console.log("\nparseTvIndicator");
test("numeric single: 'Breaking Bad Season 1'", () => {
  const r = parseTvIndicator("Breaking Bad Season 1");
  assert.equal(r.kind, "single");
  assert.equal(r.seasonNum, 1);
  assert.equal(r.showName, "Breaking Bad");
});
test("numeric single with colon: 'Breaking Bad: Season 3'", () => {
  const r = parseTvIndicator("Breaking Bad: Season 3");
  assert.equal(r.kind, "single");
  assert.equal(r.seasonNum, 3);
  assert.equal(r.showName, "Breaking Bad");
});
test("numeric single with dash: 'The Office - Season 5'", () => {
  const r = parseTvIndicator("The Office - Season 5");
  assert.equal(r.kind, "single");
  assert.equal(r.seasonNum, 5);
  assert.equal(r.showName, "The Office");
});
test("numeric single with 'complete': 'The Sopranos: The Complete Season 2'", () => {
  const r = parseTvIndicator("The Sopranos: The Complete Season 2");
  assert.equal(r.kind, "single");
  assert.equal(r.seasonNum, 2);
  assert.equal(r.showName, "The Sopranos");
});
test("range: 'The Wire Seasons 1-3'", () => {
  const r = parseTvIndicator("The Wire Seasons 1-3");
  assert.equal(r.kind, "range");
  assert.equal(r.from, 1);
  assert.equal(r.to, 3);
  assert.equal(r.showName, "The Wire");
});
test("range with en-dash: 'Mad Men: Seasons 1–5'", () => {
  const r = parseTvIndicator("Mad Men: Seasons 1–5");
  assert.equal(r.kind, "range");
  assert.equal(r.from, 1);
  assert.equal(r.to, 5);
  assert.equal(r.showName, "Mad Men");
});
test("complete series: 'Friends: The Complete Series'", () => {
  const r = parseTvIndicator("Friends: The Complete Series");
  assert.equal(r.kind, "complete");
  assert.equal(r.showName, "Friends");
});
test("complete series no delimiter: 'Friends Complete Series'", () => {
  const r = parseTvIndicator("Friends Complete Series");
  assert.equal(r.kind, "complete");
  assert.equal(r.showName, "Friends");
});
test("ordinal: 'Seinfeld: The Complete Seventh Season'", () => {
  const r = parseTvIndicator("Seinfeld: The Complete Seventh Season");
  assert.equal(r.kind, "single");
  assert.equal(r.seasonNum, 7);
  assert.equal(r.showName, "Seinfeld");
});
test("ordinal: 'Frasier - The Complete First Season'", () => {
  const r = parseTvIndicator("Frasier - The Complete First Season");
  assert.equal(r.kind, "single");
  assert.equal(r.seasonNum, 1);
  assert.equal(r.showName, "Frasier");
});
test("miniseries: 'Band of Brothers Miniseries'", () => {
  const r = parseTvIndicator("Band of Brothers Miniseries");
  assert.equal(r.kind, "complete");
  assert.equal(r.showName, "Band of Brothers");
});
test("miniseries with hyphen: 'Chernobyl: Mini-Series'", () => {
  const r = parseTvIndicator("Chernobyl: Mini-Series");
  assert.equal(r.kind, "complete");
  assert.equal(r.showName, "Chernobyl");
});
test("plain movie returns none: 'The Godfather'", () => {
  assert.equal(parseTvIndicator("The Godfather").kind, "none");
});
test("movie with colon returns none: 'Alien: Resurrection'", () => {
  assert.equal(parseTvIndicator("Alien: Resurrection").kind, "none");
});
test("movie collection returns none: 'The Divergent Series Collection'", () => {
  assert.equal(parseTvIndicator("The Divergent Series Collection").kind, "none");
});

console.log("\nTV vs multi-movie routing precedence");
// These are the routing cases the real flow depends on — TV must be checked
// first so TV box sets don't fall into the multi-movie collection path.
test("'Friends: Complete Series' → TV (not multi-movie)", () => {
  assert.ok(TV_KEYWORDS.test("Friends: Complete Series"));
  assert.ok(!MULTI_MOVIE_KEYWORDS.test("Friends: Complete Series"));
});
test("'Star Wars Complete Saga' → multi-movie (not TV)", () => {
  assert.ok(!TV_KEYWORDS.test("Star Wars Complete Saga"));
  assert.ok(MULTI_MOVIE_KEYWORDS.test("Star Wars Complete Saga"));
});
test("'The Office: Seasons 1-3' → TV (not multi-movie)", () => {
  assert.ok(TV_KEYWORDS.test("The Office: Seasons 1-3"));
  assert.ok(!MULTI_MOVIE_KEYWORDS.test("The Office: Seasons 1-3"));
});
test("'Alien Quadrilogy' → multi-movie (not TV)", () => {
  assert.ok(!TV_KEYWORDS.test("Alien Quadrilogy"));
  assert.ok(MULTI_MOVIE_KEYWORDS.test("Alien Quadrilogy"));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
