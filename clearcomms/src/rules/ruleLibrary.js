"use strict";
/**
 * ClearComms rule library (single source of truth).
 *
 * This is the encoded domain expertise that makes the product defensible.
 * It is consumed by:
 *   - the deterministic engine (engine.js)
 *   - the Claude system prompt (prompt.js)
 * Keep it current as sector language guidance evolves.
 */

// Plain-English swaps: officialese -> plainer word.
const JARGON = {
  "utilise": "use", "utilize": "use", "commence": "start", "prior to": "before",
  "in order to": "to", "facilitate": "help", "approximately": "about", "additional": "more",
  "currently": "now", "purchase": "buy", "assistance": "help", "individuals": "people",
  "ascertain": "find out", "terminate": "end", "endeavour": "try", "sufficient": "enough",
  "demonstrate": "show", "obtain": "get", "require": "need", "regarding": "about",
  "in receipt of": "getting", "considerable": "large", "leverage": "use",
  "going forward": "from now on", "in the event that": "if", "with regard to": "about",
  "subsequently": "later", "numerous": "many", "provide": "give", "possess": "have",
};

// Non-stigmatising language bank. noauto = flag for a human, do not auto-replace.
const INCLUSIVE = [
  { find: "commit suicide", suggest: "die by suicide", reason: "'Commit' links suicide to crime or sin.", topic: "Mental health" },
  { find: "committed suicide", suggest: "died by suicide", reason: "'Committed' links suicide to crime or sin.", topic: "Mental health" },
  { find: "successful suicide", suggest: "suicide", reason: "Avoid framing a death as a success.", topic: "Mental health" },
  { find: "failed suicide", suggest: "non-fatal suicide attempt", reason: "Avoid 'failed' for an attempt.", topic: "Mental health" },
  { find: "the mentally ill", suggest: "people with mental health conditions", reason: "Use people-first language.", topic: "Mental health" },
  { find: "insane", suggest: "a clearer, specific word", reason: "'Insane' stigmatises mental illness.", topic: "Mental health", noauto: true },
  { find: "crazy", suggest: "a clearer, specific word", reason: "'Crazy' stigmatises mental illness.", topic: "Mental health", noauto: true },
  { find: "suffering from", suggest: "living with", reason: "'Suffering' assumes the person's experience.", topic: "Health" },
  { find: "suffers from", suggest: "lives with", reason: "'Suffers' assumes the person's experience.", topic: "Health" },
  { find: "afflicted by", suggest: "living with", reason: "'Afflicted' is loaded and pitying.", topic: "Health" },
  { find: "addict", suggest: "person with a dependence", reason: "Use people-first language, not a label.", topic: "Addiction" },
  { find: "junkie", suggest: "person who uses drugs", reason: "'Junkie' is stigmatising slang.", topic: "Addiction" },
  { find: "alcoholic", suggest: "person with alcohol dependence", reason: "Use people-first language.", topic: "Addiction" },
  { find: "substance abuse", suggest: "substance use", reason: "'Abuse' is judgemental.", topic: "Addiction" },
  { find: "drug abuse", suggest: "drug use", reason: "'Abuse' is judgemental.", topic: "Addiction" },
  { find: "clean", suggest: "not using, or in recovery", reason: "'Clean' implies people who use are 'dirty'.", topic: "Addiction", noauto: true },
  { find: "wheelchair-bound", suggest: "wheelchair user", reason: "A wheelchair gives freedom, not confinement.", topic: "Disability" },
  { find: "confined to a wheelchair", suggest: "uses a wheelchair", reason: "A wheelchair gives freedom, not confinement.", topic: "Disability" },
  { find: "the disabled", suggest: "disabled people", reason: "Lead with people, not the label.", topic: "Disability" },
  { find: "the handicapped", suggest: "disabled people", reason: "'Handicapped' is outdated.", topic: "Disability" },
  { find: "able-bodied", suggest: "non-disabled", reason: "'Able-bodied' implies disabled people are unable.", topic: "Disability" },
  { find: "special needs", suggest: "additional needs", reason: "'Special needs' can be patronising.", topic: "Disability", noauto: true },
  { find: "AIDS sufferer", suggest: "person living with HIV", reason: "People-first, and HIV is not AIDS.", topic: "Sexual health" },
  { find: "AIDS victim", suggest: "person living with HIV", reason: "'Victim' removes agency.", topic: "Sexual health" },
  { find: "HIV sufferer", suggest: "person living with HIV", reason: "Use people-first language.", topic: "Sexual health" },
  { find: "unprotected sex", suggest: "sex without a condom", reason: "More precise and less loaded.", topic: "Sexual health" },
  { find: "high-risk groups", suggest: "groups at increased risk", reason: "Avoid labelling whole groups as a risk.", topic: "Sexual health" },
  { find: "promiscuous", suggest: "a neutral description", reason: "'Promiscuous' is judgemental.", topic: "Sexual health", noauto: true },
  { find: "obese", suggest: "living with obesity", reason: "Use people-first language for weight.", topic: "Weight" },
  { find: "cancer victim", suggest: "person with cancer", reason: "'Victim' removes agency.", topic: "Health" },
  { find: "battling cancer", suggest: "living with cancer", reason: "Battle metaphors can burden people.", topic: "Health" },
  { find: "normal person", suggest: "person without the condition", reason: "Implies others are abnormal.", topic: "Health", noauto: true },
];

// Acronyms that are allowed to be in capitals (not flagged as shouting).
const ACRONYMS = ["NHS", "HIV", "AIDS", "STI", "STIS", "GP", "UK", "PREP", "HPV", "AE", "PPE", "CEO", "FAQ", "COVID", "NHSE", "ICB", "DPIA", "WCAG"];

// Platform character limits and how much shows before a "more" cut-off.
const PLATFORMS = {
  LinkedIn: { limit: 3000, preview: 210 },
  X: { limit: 280, preview: 280 },
  Instagram: { limit: 2200, preview: 125 },
  Facebook: { limit: 63206, preview: 250 },
};

const THRESHOLDS = {
  readingAgeTarget: 11,   // aim for 9 to 11
  readingAgeIdeal: 9,
  longSentenceWords: 25,
  maxEmoji: 4,
  maxExclamations: 2,
};

/** Render the library as compact text for the Claude system prompt. */
function renderForPrompt() {
  const jargon = Object.entries(JARGON).map(([k, v]) => `${k} -> ${v}`).join("; ");
  const inclusive = INCLUSIVE.map((i) => `"${i.find}" -> "${i.suggest}" (${i.reason}${i.noauto ? " [flag only]" : ""})`).join("\n");
  return [
    "PLAIN-ENGLISH SWAPS (prefer the plainer word):",
    jargon,
    "",
    "NON-STIGMATISING LANGUAGE (avoid -> prefer (reason)):",
    inclusive,
    "",
    `READING AGE TARGET: ${THRESHOLDS.readingAgeIdeal} to ${THRESHOLDS.readingAgeTarget}. Long sentence = over ${THRESHOLDS.longSentenceWords} words.`,
    "ACCESSIBILITY: CamelCase multi-word hashtags; avoid ALL-CAPS shouting (these acronyms are fine: " + ACRONYMS.join(", ") + "); at most one or two emoji at the end; meaningful link text not 'click here'; remind about image alt text; no stylised unicode fonts.",
  ].join("\n");
}

module.exports = { JARGON, INCLUSIVE, ACRONYMS, PLATFORMS, THRESHOLDS, renderForPrompt };
