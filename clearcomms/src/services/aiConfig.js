"use strict";
// Resolves the active Claude configuration at call time: an environment key
// wins (for advanced/server-managed setups), otherwise the key the owner saved
// through the in-app settings screen (stored encrypted), otherwise disabled.
const config = require("../config");
const repo = require("../db/repo");
const { decrypt } = require("./secretbox");

function getAiConfig() {
  if (config.anthropic.apiKey) {
    return { enabled: true, apiKey: config.anthropic.apiKey, model: config.anthropic.model, source: "env" };
  }
  try {
    const s = repo.getAppSettings();
    if (s && s.anthropic_key_enc) {
      const key = decrypt(s.anthropic_key_enc);
      if (key) return { enabled: true, apiKey: key, model: s.claude_model || config.anthropic.model, source: "stored" };
    }
  } catch (_) { /* fall through to disabled */ }
  return { enabled: false, apiKey: "", model: config.anthropic.model, source: "none" };
}

module.exports = { getAiConfig };
