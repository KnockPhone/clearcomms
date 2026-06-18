"use strict";
const express = require("express");
const config = require("../config");
const repo = require("../db/repo");
const { requireAuth } = require("../auth/auth");
const { checkText } = require("../services/checker");
const { altTextForImage } = require("../services/anthropic");
const { buildReport } = require("../services/report");
const { getAiConfig } = require("../services/aiConfig");
const { encrypt } = require("../services/secretbox");

const router = express.Router();
router.use(requireAuth);

function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== "owner") return res.status(403).json({ error: "Only the account owner can change this." });
  next();
}

function subscriptionActive(org) { return org && (org.subscription_status === "active" || org.subscription_status === "trialing"); }
function allowance(org) {
  if (!config.stripe.enabled) return { unlimited: true };       // local/dev: no billing wired
  if (subscriptionActive(org)) return { unlimited: true };
  return { unlimited: false, limit: config.limits.freeMonthlyChecks };
}

router.get("/usage", (req, res) => {
  const a = allowance(req.org);
  res.json({
    used: repo.countChecksThisMonth(req.org.id),
    limit: a.unlimited ? null : a.limit,
    unlimited: a.unlimited,
    plan: req.org.plan,
    subscriptionStatus: req.org.subscription_status,
    ai: getAiConfig().enabled,
    billing: config.stripe.enabled,
  });
});

// ---- Instance settings: the in-app Claude API key ----
router.get("/settings", (req, res) => {
  const ai = getAiConfig();
  res.json({
    aiConfigured: ai.enabled,
    source: ai.source,
    model: ai.model,
    envManaged: ai.source === "env",
    isOwner: req.user.role === "owner",
  });
});

router.post("/settings/anthropic-key", requireOwner, (req, res) => {
  const { apiKey, model } = req.body || {};
  if (typeof apiKey !== "string" || !/^sk-ant-\S+/.test(apiKey.trim())) {
    return res.status(400).json({ error: "That does not look like an Anthropic key. It should start with sk-ant-." });
  }
  if (config.anthropic.apiKey) {
    return res.status(409).json({ error: "A key is already set on the server, so the in-app key is disabled." });
  }
  repo.setAnthropicKey(encrypt(apiKey.trim()), model ? String(model) : null);
  res.json({ ok: true });
});

router.delete("/settings/anthropic-key", requireOwner, (req, res) => {
  repo.clearAnthropicKey();
  res.json({ ok: true });
});

router.post("/check", async (req, res) => {
  const { text, platform, brandProfileId } = req.body || {};
  if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "Please enter some text to check." });
  if (text.length > config.limits.maxInputChars) return res.status(413).json({ error: `Text is too long (max ${config.limits.maxInputChars} characters).` });

  const a = allowance(req.org);
  if (!a.unlimited && repo.countChecksThisMonth(req.org.id) >= a.limit) {
    return res.status(402).json({ error: "You have used your free checks for this month.", upgrade: true, limit: a.limit });
  }

  let brandProfile = null;
  if (brandProfileId) {
    brandProfile = repo.getBrandProfile(brandProfileId, req.org.id);
    if (!brandProfile) return res.status(404).json({ error: "Brand profile not found." });
  }

  try {
    const result = await checkText({ text: text.trim(), platform, brandProfile });
    const checkId = repo.createCheck({ orgId: req.org.id, userId: req.user.id, platform: result.platform, inputText: text.trim(), result });
    res.json({ checkId, result, usage: { used: repo.countChecksThisMonth(req.org.id), limit: a.unlimited ? null : a.limit } });
  } catch (e) {
    console.error("check failed:", e && e.message);
    res.status(500).json({ error: "The check could not be completed." });
  }
});

// ---- Image alt text (Claude vision) ----
const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];
router.post("/alt-text", async (req, res) => {
  if (!getAiConfig().enabled) return res.status(503).json({ error: "Turn on AI in Settings to generate alt text.", needsAi: true });
  const { image, mediaType } = req.body || {};
  if (typeof image !== "string" || image.length < 50) return res.status(400).json({ error: "Please choose an image." });
  if (!ALLOWED_MEDIA.includes(mediaType)) return res.status(400).json({ error: "Use a JPEG, PNG, WebP or GIF image." });
  if (image.length > 1200000) return res.status(413).json({ error: "That image is too large. Try a smaller one." });
  try {
    const result = await altTextForImage(image, mediaType);
    res.json({ result });
  } catch (e) {
    console.error("alt-text failed:", e && e.message);
    res.status(500).json({ error: "Could not read that image. Please try another." });
  }
});

router.get("/history", (req, res) => res.json({ checks: repo.listChecks(req.org.id, 30) }));

router.get("/checks/:id", (req, res) => {
  const row = repo.getCheck(req.params.id, req.org.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  res.json({ check: { id: row.id, platform: row.platform, inputText: row.input_text, createdAt: row.created_at, result: row.result } });
});

router.get("/checks/:id/report", (req, res) => {
  const row = repo.getCheck(req.params.id, req.org.id);
  if (!row || !row.result) return res.status(404).send("Not found");
  const html = buildReport(row.result, { org: req.org.name, date: new Date(row.created_at).toLocaleString("en-GB"), input: row.input_text });
  res.setHeader("Content-Disposition", 'attachment; filename="clearcomms-report.html"');
  res.type("html").send(html);
});

// ---- Brand profiles ----
router.get("/brand-profiles", (req, res) => res.json({ profiles: repo.listBrandProfiles(req.org.id) }));

router.post("/brand-profiles", (req, res) => {
  const { name, tone, bannedWords, readingAgeTarget } = req.body || {};
  if (!name || String(name).trim().length < 1) return res.status(400).json({ error: "Please give the profile a name." });
  // Free includes a single brand profile; Pro removes the limit. This only
  // bites once billing is configured, so a no-billing instance stays unlimited.
  const a = allowance(req.org);
  if (!a.unlimited && repo.listBrandProfiles(req.org.id).length >= 1) {
    return res.status(402).json({ error: "Free includes one brand profile. Upgrade to Pro for unlimited brand profiles.", upgrade: true });
  }
  let banned = [];
  if (Array.isArray(bannedWords)) banned = bannedWords.map(String);
  else if (typeof bannedWords === "string") banned = bannedWords.split(",");
  banned = banned.map((s) => s.trim()).filter(Boolean).slice(0, 100);
  let age = parseInt(readingAgeTarget, 10);
  if (!(age >= 5 && age <= 18)) age = null;
  const profile = repo.createBrandProfile({
    orgId: req.org.id,
    name: String(name).trim().slice(0, 80),
    tone: tone ? String(tone).slice(0, 400) : null,
    bannedWords: banned,
    readingAgeTarget: age,
  });
  res.json({ profile });
});

router.delete("/brand-profiles/:id", (req, res) => {
  if (!repo.deleteBrandProfile(req.params.id, req.org.id)) return res.status(404).json({ error: "Not found." });
  res.json({ ok: true });
});

module.exports = router;
