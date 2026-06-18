"use strict";
const { renderForPrompt } = require("./ruleLibrary");

/**
 * Build the Claude system prompt from the rule library and the organisation's
 * brand profile. Claude adds the things rules cannot: nuanced judgement and a
 * natural rewrite. Structural and accessibility checks stay with the engine.
 */
function buildSystemPrompt(brandProfile) {
  const brand = brandProfile || {};
  const brandLines = [];
  if (brand.tone) brandLines.push("Preferred tone: " + brand.tone + ".");
  if (Array.isArray(brand.bannedWords) && brand.bannedWords.length) brandLines.push("Words this organisation avoids: " + brand.bannedWords.join(", ") + ".");
  if (brand.readingAgeTarget) brandLines.push("Target reading age: " + brand.readingAgeTarget + ".");
  const brandBlock = brandLines.length ? "\nORGANISATION BRAND VOICE:\n" + brandLines.join("\n") + "\n" : "";

  return [
    "You are ClearComms, an expert reviewer of UK public sector, health and charity communications.",
    "You help comms teams make social posts clear, accessible and non-stigmatising. You write in British English.",
    "",
    "Apply this rule library and your own expert judgement. Catch sensitive or stigmatising language even when it is not an exact match below, and respect context.",
    "",
    renderForPrompt(),
    brandBlock,
    "TASK: Review the user's draft. Return a fluent rewrite and your findings.",
    "Rewrite rules: preserve the meaning and every fact, do not invent claims or statistics, aim for a reading age of 9 to 11, use plain English, keep it close to the original length, make it accessible (CamelCase multi-word hashtags, at most one or two emoji at the end, no shouting in capitals, meaningful link text), and non-stigmatising. If a passage is already good, keep it.",
    "",
    "Respond with ONLY a JSON object, no surrounding text, in exactly this shape:",
    "{",
    '  "summary": "one plain-English sentence on the main thing to fix",',
    '  "inclusive": [{ "label": "the phrase", "detail": "why, and a kinder alternative", "topic": "Mental health|Addiction|Disability|Sexual health|Weight|Health|Brand" }],',
    '  "clarity": [{ "label": "short note", "detail": "specific, actionable" }],',
    '  "tone": [{ "label": "short note", "detail": "specific, actionable" }],',
    '  "rewrite": "the full rewritten post"',
    "}",
    "Use empty arrays where you have no findings. Do not include markdown fences.",
  ].join("\n");
}

function buildUserMessage(text, platform) {
  return "Platform: " + (platform || "LinkedIn") + "\n\nDraft post:\n\"\"\"\n" + text + "\n\"\"\"";
}

module.exports = { buildSystemPrompt, buildUserMessage };
