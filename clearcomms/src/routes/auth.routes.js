"use strict";
const express = require("express");
const db = require("../db/index");
const repo = require("../db/repo");
const { hashPassword, verifyPassword, startSession, endSession } = require("../auth/auth");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(req) {
  if (!req.user) return null;
  return {
    email: req.user.email,
    org: { id: req.org.id, name: req.org.name, plan: req.org.plan, subscriptionStatus: req.org.subscription_status },
  };
}

// Create org + first user atomically.
const createOrgAndUser = db.transaction(({ orgName, email, passwordHash }) => {
  const org = repo.createOrg(orgName);
  const user = repo.createUser({ orgId: org.id, email, passwordHash, role: "owner" });
  return { org, user };
});

router.post("/signup", (req, res) => {
  const { orgName, email, password } = req.body || {};
  if (!orgName || String(orgName).trim().length < 2) return res.status(400).json({ error: "Please enter your organisation name." });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
  if (!password || String(password).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (repo.getUserByEmail(email)) return res.status(409).json({ error: "An account with that email already exists." });

  const { user, org } = createOrgAndUser({ orgName: String(orgName).trim(), email, passwordHash: hashPassword(String(password)) });
  startSession(res, user.id);
  res.json({ email: user.email, org: { id: org.id, name: org.name, plan: org.plan, subscriptionStatus: org.subscription_status } });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? repo.getUserByEmail(email) : null;
  if (!user || !verifyPassword(String(password || ""), user.password_hash)) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  startSession(res, user.id);
  const org = repo.getOrg(user.org_id);
  res.json({ email: user.email, org: { id: org.id, name: org.name, plan: org.plan, subscriptionStatus: org.subscription_status } });
});

router.post("/logout", (req, res) => { endSession(req, res); res.json({ ok: true }); });

router.get("/me", (req, res) => { res.json({ user: publicUser(req) }); });

module.exports = router;
