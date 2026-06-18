"use strict";
const crypto = require("crypto");
const config = require("../config");
const repo = require("../db/repo");

const COOKIE = "cc_session";
const SESSION_DAYS = 30;

// ---- Passwords (scrypt, no native deps) ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(pw, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const test = crypto.scryptSync(pw, parts[1], 64);
  const want = Buffer.from(parts[2], "hex");
  return test.length === want.length && crypto.timingSafeEqual(test, want);
}

// ---- Sessions ----
const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex");

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  repo.createSession(hashToken(token), userId, expires.toISOString());
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: SESSION_DAYS * 86400000,
    path: "/",
  });
}

function endSession(req, res) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) repo.deleteSession(hashToken(token));
  res.clearCookie(COOKIE, { path: "/" });
}

// Attaches req.user and req.org when a valid session cookie is present.
function attachUser(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) {
    const s = repo.getSession(hashToken(token));
    if (s && new Date(s.expires_at) > new Date()) {
      const user = repo.getUserById(s.user_id);
      if (user) { req.user = user; req.org = repo.getOrg(user.org_id); }
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in." });
  next();
}

module.exports = { hashPassword, verifyPassword, startSession, endSession, attachUser, requireAuth, COOKIE };
