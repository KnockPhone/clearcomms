"use strict";
const engine = require("../rules/engine");
const { reviewWithClaude } = require("./anthropic");
const { getAiConfig } = require("./aiConfig");

/** Merge Claude's qualitative findings and natural rewrite into the engine result. */
function mergeClaude(base, ai) {
  if (ai.rewrite && ai.rewrite.trim()) { base.rewrite = ai.rewrite.trim(); base.engine = "claude"; }
  base.summary = ai.summary || base.summary || "";

  const aiInc = (ai.inclusive || []).filter((x) => x && x.label);
  if (aiInc.length) base.categories.inclusive = base.categories.inclusive.filter((i) => i.status !== "good");

  const seen = new Set(base.categories.inclusive.map((i) => String(i.label).toLowerCase()));
  let added = 0;
  for (const it of aiInc) {
    const key = String(it.label).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    base.categories.inclusive.push({ status: "issue", label: it.label, detail: it.detail || "", topic: it.topic || "", match: it.label, source: "ai" });
    added++;
  }
  for (const it of ai.clarity || []) if (it && it.label) base.categories.clarity.push({ status: "warn", label: it.label, detail: it.detail || "", source: "ai" });
  for (const it of ai.tone || []) if (it && it.label) base.categories.tone.push({ status: "warn", label: it.label, detail: it.detail || "", source: "ai" });

  if (added) { base.score = Math.max(0, base.score - Math.min(added * 6, 24)); base.band = engine.band(base.score); }
  if (!base.categories.inclusive.length) base.categories.inclusive.push({ status: "good", label: "No flagged language found", detail: "Nothing flagged. A human check is still wise." });
  return base;
}

/**
 * Run a full check: deterministic engine for structure and accessibility,
 * Claude for nuance and a natural rewrite, merged into one result.
 */
async function checkText({ text, platform, brandProfile, useClaude = true } = {}) {
  const base = engine.analyze(text, { platform, brandProfile });
  if (base.empty) return base;
  base.aiUsed = false;
  if (useClaude && getAiConfig().enabled) {
    try {
      const ai = await reviewWithClaude(text, { platform, brandProfile });
      mergeClaude(base, ai);
      base.aiUsed = true;
    } catch (e) {
      base.aiError = (e && e.message) || "AI unavailable";
    }
  }
  // Score the suggested rewrite so the improvement is visible.
  if (base.rewrite) {
    try {
      const rw = engine.analyze(base.rewrite, { platform, brandProfile });
      base.rewriteScore = rw.score;
      base.rewriteBand = rw.band;
      base.rewriteReadingAge = rw.readingAge;
    } catch (_) { /* ignore */ }
  }
  return base;
}

module.exports = { checkText, mergeClaude };
