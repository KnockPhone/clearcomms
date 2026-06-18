"use strict";
/**
 * Deterministic checking engine.
 *
 * Runs instantly with no external calls. It produces the structural and
 * accessibility checks (which do not need a model) and a baseline score, and
 * serves as the fallback when Claude is unavailable.
 *
 * Every finding carries `auto`: true when the suggested change is reflected in
 * the deterministic rewrite, false when it is deliberately left for a human
 * (context-dependent wording, or fixes the rewrite cannot safely make). The UI
 * uses this so the findings list and the rewrite never appear to disagree.
 */
const { JARGON, INCLUSIVE, ACRONYMS, PLATFORMS, THRESHOLDS } = require("./ruleLibrary");

const ACRONYM_SET = new Set(ACRONYMS.map((a) => a.toUpperCase()));

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

function readability(text) {
  const clean = text.replace(/https?:\/\/\S+/g, " ").replace(/[#@]\w+/g, " ");
  const sentences = clean.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = clean.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  const ns = Math.max(sentences.length, 1);
  const nw = Math.max(words.length, 1);
  let syll = 0;
  for (const w of words) syll += countSyllables(w);
  const wps = nw / ns, spw = syll / nw;
  const ease = clamp(Math.round(206.835 - 1.015 * wps - 84.6 * spw), 0, 100);
  const grade = 0.39 * wps + 11.8 * spw - 15.59;
  const readingAge = clamp(Math.round(grade + 5), 5, 18);
  return { ease, readingAge, words: words.length, sentences: sentences.length };
}

function findKeys(text, dict) {
  const hits = [];
  const seen = new Set();
  for (const key of Object.keys(dict)) {
    const re = new RegExp("\\b" + escapeRegExp(key) + "\\b", "i");
    const m = re.exec(text);
    if (m && !seen.has(key.toLowerCase())) { seen.add(key.toLowerCase()); hits.push({ match: m[0], key }); }
  }
  return hits;
}

function toCamelHint(tag) {
  const b = tag.replace(/^#/, "");
  return "#" + b.charAt(0).toUpperCase() + b.slice(1);
}

/**
 * Best-effort rewrite. Applies the swaps and accessibility fixes it can make
 * safely. Context-dependent items (INCLUSIVE.noauto) and hashtag casing are
 * left alone and surfaced as `auto:false` findings instead.
 */
function deterministicRewrite(text) {
  let out = text;
  for (const it of INCLUSIVE) {
    if (it.noauto) continue;
    out = out.replace(new RegExp("\\b" + escapeRegExp(it.find) + "\\b", "gi"), it.suggest);
  }
  for (const [key, val] of Object.entries(JARGON)) {
    out = out.replace(new RegExp("\\b" + escapeRegExp(key) + "\\b", "gi"), val);
  }
  out = out.replace(/\bclick here\b/gi, "read more about it");
  // De-shout: lower-case fully capitalised words, keeping known acronyms.
  out = out.replace(/\b[A-Z][A-Z'&]{2,}\b/g, (w) => (ACRONYM_SET.has(w.replace(/[^A-Z]/g, "")) ? w : w.toLowerCase()));
  out = out.replace(/!{2,}/g, "!");
  out = out.replace(/(\p{Extended_Pictographic})\1+/gu, "$1");
  out = out.replace(/\s*—\s*/g, ", ");   // never output em dashes
  out = out.replace(/ – /g, ", ");          // spaced en dash as punctuation
  out = out.replace(/\b([Aa])n\s+(?=[bcdfghjklmnpqrstvwxyz])/g, "$1 ");
  out = out.replace(/\b([Aa])\s+(?=[aeio])/g, "$1n ");
  // Re-capitalise the first letter of each sentence after the de-shout pass.
  out = out.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
  return out;
}

function band(score) { return score >= 80 ? "Good" : score >= 60 ? "Needs polish" : "Needs work"; }

/**
 * @param {string} text
 * @param {{platform?:string, brandProfile?:{readingAgeTarget?:number, bannedWords?:string[]}}} opts
 */
function analyze(text, opts = {}) {
  text = (text || "").trim();
  const platform = PLATFORMS[opts.platform] ? opts.platform : "LinkedIn";
  const brand = opts.brandProfile || {};
  const targetAge = Number(brand.readingAgeTarget) || THRESHOLDS.readingAgeTarget;
  const res = { empty: text.length === 0, platform, score: 100, categories: { inclusive: [], clarity: [], accessibility: [], tone: [] } };
  if (res.empty) return res;

  const r = readability(text);
  res.readingAge = r.readingAge; res.ease = r.ease; res.words = r.words; res.sentences = r.sentences;

  // ---- Clarity ----
  if (r.readingAge <= targetAge) {
    res.categories.clarity.push({ status: "good", label: "Reading age about " + r.readingAge, detail: "On target. Plain health writing aims for a reading age of 9 to 11." });
  } else {
    res.categories.clarity.push({ status: r.readingAge >= 14 ? "issue" : "warn", label: "Reading age about " + r.readingAge, detail: "Aim for 9 to 11. Shorten sentences and swap long words for short ones.", auto: false });
  }
  const longs = text.split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length > THRESHOLDS.longSentenceWords);
  if (longs.length) res.categories.clarity.push({ status: "warn", label: longs.length + " long sentence" + (longs.length > 1 ? "s" : ""), detail: "Sentences over " + THRESHOLDS.longSentenceWords + " words are hard to follow. Try splitting them.", auto: false });
  for (const j of findKeys(text, JARGON)) {
    res.categories.clarity.push({ status: "warn", label: "“" + j.match + "”", detail: "Plainer option: “" + JARGON[j.key] + "”.", fix: [j.match, JARGON[j.key]], auto: true });
  }

  // ---- Inclusive language ----
  const incHits = INCLUSIVE.filter((it) => new RegExp("\\b" + escapeRegExp(it.find) + "\\b", "i").test(text));
  for (const it of incHits) {
    res.categories.inclusive.push({ status: "issue", label: "“" + it.find + "”", detail: it.reason + " Try: “" + it.suggest + "”.", topic: it.topic, fix: it.noauto ? null : [it.find, it.suggest], auto: !it.noauto });
  }
  const banned = Array.isArray(brand.bannedWords) ? brand.bannedWords : [];
  let bannedHits = 0;
  for (const w of banned) {
    if (!w) continue;
    if (new RegExp("\\b" + escapeRegExp(String(w)) + "\\b", "i").test(text)) {
      bannedHits++;
      res.categories.inclusive.push({ status: "issue", label: "“" + w + "”", detail: "On your organisation's banned-words list.", topic: "Brand", auto: false });
    }
  }
  if (!res.categories.inclusive.length) res.categories.inclusive.push({ status: "good", label: "No flagged language found", detail: "Nothing matched the sensitive-language list. A human check is still wise." });

  // ---- Accessibility ----
  const hashtags = text.match(/#\w+/g) || [];
  const badHash = hashtags.filter((h) => { const b = h.slice(1); return b.length > 5 && b === b.toLowerCase(); });
  if (badHash.length) res.categories.accessibility.push({ status: "warn", label: "Hashtags need CamelCase", detail: "Capitalise each word so screen readers read them correctly, e.g. " + toCamelHint(badHash[0]) + ".", auto: false });
  else if (hashtags.length) res.categories.accessibility.push({ status: "good", label: "Hashtags look accessible", detail: "CamelCase hashtags read correctly aloud." });

  const caps = (text.match(/\b[A-Z][A-Z'&]{2,}\b/g) || []).filter((w) => !ACRONYM_SET.has(w.replace(/[^A-Z]/g, "")));
  if (caps.length) res.categories.accessibility.push({ status: "warn", label: "Avoid SHOUTING in capitals", detail: "Screen readers may spell out “" + caps[0] + "” letter by letter. The rewrite switches these to sentence case.", auto: true });

  const emoji = text.match(/\p{Extended_Pictographic}/gu) || [];
  const repeat = /(\p{Extended_Pictographic})\1/u.test(text);
  if (emoji.length > THRESHOLDS.maxEmoji || repeat) res.categories.accessibility.push({ status: "warn", label: "Go easy on emoji", detail: "Each emoji is read aloud, and repeats get repeated. Use one or two, at the end.", auto: false });

  if (/\bclick here\b/i.test(text) || /\bclick the link\b/i.test(text)) res.categories.accessibility.push({ status: "warn", label: "Replace “click here”", detail: "Describe where the link goes, e.g. “read our support guide”.", fix: ["click here", "read more about it"], auto: true });

  if (/[\u{1D400}-\u{1D7FF}]/u.test(text)) res.categories.accessibility.push({ status: "issue", label: "Fancy fonts are unreadable", detail: "Stylised unicode letters are skipped by screen readers. Use standard text.", auto: false });

  res.categories.accessibility.push({ status: "info", label: "Image alt text", detail: "If this post has an image, add descriptive alt text and caption any video. The checker cannot see your media." });

  // ---- Tone & platform ----
  const bangs = (text.match(/!/g) || []).length;
  if (bangs > THRESHOLDS.maxExclamations) res.categories.tone.push({ status: "warn", label: bangs + " exclamation marks", detail: "More than two can feel shouty. The rewrite keeps one.", auto: true });
  if (caps.length) res.categories.tone.push({ status: "warn", label: "Capitalised words feel loud", detail: "Sentence case reads as calmer and more trustworthy.", auto: true });
  if (bangs <= THRESHOLDS.maxExclamations && !caps.length) res.categories.tone.push({ status: "good", label: "Tone looks measured", detail: "Calm, clear and trustworthy." });

  const p = PLATFORMS[platform];
  if (text.length > p.limit) res.categories.tone.push({ status: "issue", label: "Over the " + platform + " limit", detail: text.length + " characters against a limit of " + p.limit + ".", auto: false });
  else res.categories.tone.push({ status: "info", label: text.length + " characters", detail: "The first ~" + p.preview + " show before “...more” on " + platform + ". Put the key message first." });

  // ---- Score ----
  let score = 100;
  score -= incHits.length * 9;
  score -= bannedHits * 9;
  score -= Math.min(findKeys(text, JARGON).length, 6) * 2;
  score -= longs.length * 4;
  score -= badHash.length ? 4 : 0;
  score -= caps.length ? 5 : 0;
  score -= (emoji.length > THRESHOLDS.maxEmoji || repeat) ? 3 : 0;
  score -= /\bclick here\b/i.test(text) ? 3 : 0;
  if (r.readingAge > targetAge) score -= clamp((r.readingAge - targetAge) * 3, 0, 21);
  if (bangs > THRESHOLDS.maxExclamations) score -= 3;
  res.score = clamp(Math.round(score), 0, 100);
  res.band = band(res.score);

  res.rewrite = deterministicRewrite(text);
  res.engine = "rules";
  return res;
}

module.exports = { analyze, band, readability };
