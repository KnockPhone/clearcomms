"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { analyze } = require("../src/rules/engine");

test("flags stigmatising language", () => {
  const r = analyze("Every AIDS victim deserves support.", { platform: "X" });
  const issues = r.categories.inclusive.filter((i) => i.status === "issue");
  assert.ok(issues.length >= 1, "expected an inclusive issue");
  assert.ok(issues.some((i) => /AIDS victim/i.test(i.label)));
});

test("clean control scores well", () => {
  const r = analyze("We have a free health check this week. Book your place on our website.", { platform: "LinkedIn" });
  assert.ok(r.score >= 80, "score was " + r.score);
  assert.equal(r.band, "Good");
});

test("rewrite de-shouts capitals but keeps acronyms", () => {
  const r = analyze("STOP today and call the NHS now.", { platform: "X" });
  assert.ok(/Stop today/.test(r.rewrite), "rewrite: " + r.rewrite);
  assert.ok(/NHS/.test(r.rewrite), "acronym should survive: " + r.rewrite);
});

test("jargon flagged and reading age bounded", () => {
  const r = analyze("We will utilise the facility in order to commence.", {});
  assert.ok(r.readingAge >= 5 && r.readingAge <= 18);
  assert.ok(r.categories.clarity.some((i) => /utilise/i.test(i.label)));
});

test("findings carry an auto flag where relevant", () => {
  const r = analyze("the mentally ill deserve support", {});
  const issue = r.categories.inclusive.find((i) => /mentally ill/i.test(i.label));
  assert.equal(issue.auto, true, "replaceable items should be auto:true");
});

test("context-dependent words are flagged but not auto-applied", () => {
  const r = analyze("Stay clean for good.", {});
  const issue = r.categories.inclusive.find((i) => /clean/i.test(i.label));
  assert.ok(issue, "should flag 'clean'");
  assert.equal(issue.auto, false);
  assert.ok(!/in recovery/.test(r.rewrite), "should not auto-substitute context-dependent word");
});

test("brand banned words are flagged", () => {
  const r = analyze("This is full of synergy.", { brandProfile: { bannedWords: ["synergy"] } });
  assert.ok(r.categories.inclusive.some((i) => /synergy/i.test(i.label)));
});

test("empty input handled", () => {
  assert.equal(analyze("   ", {}).empty, true);
});
