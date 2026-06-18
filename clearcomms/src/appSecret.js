"use strict";
// Generates and persists an app secret on first boot, so the app needs no
// configured SESSION_SECRET. Stored in the data directory (a Docker volume in
// production), so it survives restarts. This is what lets a non-technical
// operator run the app with zero config files.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function dataDir() {
  return process.env.DATABASE_DIR || path.join(__dirname, "..", "data");
}

function ensureSecret() {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "app.secret");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch (_) { /* not created yet */ }
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = { ensureSecret };
