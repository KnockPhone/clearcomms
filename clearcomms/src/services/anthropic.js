"use strict";
const { buildSystemPrompt, buildUserMessage } = require("../rules/prompt");
const { getAiConfig } = require("./aiConfig");

// Cache one client per API key (the key can change at runtime via settings).
let cache = { key: null, client: null };
function getClient(apiKey) {
  if (cache.key !== apiKey) {
    const Anthropic = require("@anthropic-ai/sdk");
    cache = { key: apiKey, client: new Anthropic({ apiKey }) };
  }
  return cache.client;
}

/** Pull a JSON object out of a model response, tolerating stray text or fences. */
function parseJson(raw) {
  if (!raw) throw new Error("empty response");
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("no JSON object found");
  return JSON.parse(s.slice(first, last + 1));
}

/**
 * Ask Claude to review the text. Returns { summary, inclusive[], clarity[], tone[], rewrite }.
 * Throws if no key is configured or the call fails (callers fall back to the engine).
 */
async function reviewWithClaude(text, { platform, brandProfile } = {}) {
  const ai = getAiConfig();
  if (!ai.enabled) throw new Error("Anthropic not configured");
  const client = getClient(ai.apiKey);
  const msg = await client.messages.create({
    model: ai.model,
    max_tokens: 1500,
    temperature: 0.2,
    system: buildSystemPrompt(brandProfile),
    messages: [{ role: "user", content: buildUserMessage(text, platform) }],
  });
  const out = (msg.content || []).map((b) => (b && b.type === "text" ? b.text : "")).join("");
  const data = parseJson(out);
  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    inclusive: Array.isArray(data.inclusive) ? data.inclusive : [],
    clarity: Array.isArray(data.clarity) ? data.clarity : [],
    tone: Array.isArray(data.tone) ? data.tone : [],
    rewrite: typeof data.rewrite === "string" ? data.rewrite : "",
  };
}

const ALT_SYSTEM = [
  "You write accessible alt text for images in UK public sector, health and charity social media.",
  "Follow accessibility best practice: describe what matters in the image and its purpose, be specific but concise (aim for 125 characters or fewer), British English, no 'image of' or 'picture of', no ending full stop needed.",
  "If the image contains readable text, include that text in the alt description.",
  "Also write a short, warm social caption (one sentence) that suits the image.",
  "Respond with ONLY a JSON object: { \"altText\": \"...\", \"caption\": \"...\" }. No markdown, no extra words.",
].join("\n");

/**
 * Generate accessible alt text and a caption for an image.
 * @param {string} base64 raw base64 (no data: prefix)
 * @param {string} mediaType e.g. "image/jpeg"
 * Returns { altText, caption }. Throws if no key is configured or the call fails.
 */
async function altTextForImage(base64, mediaType = "image/jpeg") {
  const ai = getAiConfig();
  if (!ai.enabled) throw new Error("Anthropic not configured");
  const client = getClient(ai.apiKey);
  const msg = await client.messages.create({
    model: ai.model,
    max_tokens: 400,
    temperature: 0.3,
    system: ALT_SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "Write alt text and a caption for this image." },
      ],
    }],
  });
  const out = (msg.content || []).map((b) => (b && b.type === "text" ? b.text : "")).join("");
  const data = parseJson(out);
  return {
    altText: typeof data.altText === "string" ? data.altText.trim() : "",
    caption: typeof data.caption === "string" ? data.caption.trim() : "",
  };
}

module.exports = { reviewWithClaude, altTextForImage, parseJson };
