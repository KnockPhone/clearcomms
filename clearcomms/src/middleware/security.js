"use strict";
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const config = require("../config");

// Content Security Policy tight enough to be meaningful, loose enough for our
// self-hosted assets. Scripts and styles come from our own origin only.
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
// CSRF mitigation for cookie auth: reject state-changing requests whose Origin
// is a different site. Same-origin requests and non-browser clients pass.
function originCheck(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  try {
    if (new URL(origin).host === new URL(config.appUrl).host) return next();
  } catch (_) { /* fall through */ }
  return res.status(403).json({ error: "Request blocked: bad origin." });
}

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts, please wait a few minutes." } });
const checkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: "Too many checks, please slow down." } });

module.exports = { helmetMiddleware, originCheck, authLimiter, checkLimiter };
