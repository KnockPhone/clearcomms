"use strict";
require("dotenv").config();
const crypto = require("crypto");
const { ensureSecret } = require("./appSecret");

// A persistent secret is generated on first boot if none is configured, so the
// app runs with no required environment variables at all.
const persistentSecret = ensureSecret();

const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  env: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  appUrl: process.env.APP_URL || "http://localhost:3000",
  sessionSecret: process.env.SESSION_SECRET || persistentSecret,
  encryptionKey: crypto.createHash("sha256").update("cc-enc:" + persistentSecret).digest(),

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
    enabled: !!process.env.ANTHROPIC_API_KEY,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    priceId: process.env.STRIPE_PRICE_ID || "",
    enabled: !!process.env.STRIPE_SECRET_KEY,
  },

  limits: {
    freeMonthlyChecks: parseInt(process.env.FREE_MONTHLY_CHECKS || "20", 10),
    maxInputChars: 8000,
  },
};

// Loud warning in production if insecure defaults are left in place.
if (config.isProd && config.sessionSecret === "dev-insecure-secret-change-me") {
  // eslint-disable-next-line no-console
  console.warn("[config] WARNING: SESSION_SECRET is not set. Set a strong secret before going live.");
}

module.exports = config;
