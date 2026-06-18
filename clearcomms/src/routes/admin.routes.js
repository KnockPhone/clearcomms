"use strict";
const express = require("express");
const repo = require("../db/repo");
const config = require("../config");
const { requireAuth, requireAdmin, isPlatformAdmin } = require("../auth/auth");
const { getAiConfig } = require("../services/aiConfig");

// Every route here requires a signed-in platform administrator.
const router = express.Router();
router.use(requireAuth, requireAdmin);

// A snapshot of the whole platform: headline numbers, every organisation and
// every user, so the admin screen can render in a single request.
router.get("/overview", (req, res) => {
  res.json({
    me: { email: req.user.email },
    ai: getAiConfig().enabled,
    billing: config.stripe.enabled,
    stats: repo.platformStats(),
    orgs: repo.listOrgsWithStats(),
    users: repo.listAllUsers(),
  });
});

function loadUser(req, res) {
  const user = repo.getUserById(req.params.id);
  if (!user) { res.status(404).json({ error: "User not found." }); return null; }
  return user;
}

// Suspend: the user is signed out and cannot sign back in until reactivated.
router.post("/users/:id/suspend", (req, res) => {
  const user = loadUser(req, res); if (!user) return;
  if (user.id === req.user.id) return res.status(400).json({ error: "You cannot suspend your own account." });
  if (isPlatformAdmin(user)) return res.status(400).json({ error: "You cannot suspend the administrator." });
  repo.setUserStatus(user.id, "suspended");
  res.json({ ok: true });
});

router.post("/users/:id/activate", (req, res) => {
  const user = loadUser(req, res); if (!user) return;
  repo.setUserStatus(user.id, "active");
  res.json({ ok: true });
});

// Change a user's role within their organisation.
router.post("/users/:id/role", (req, res) => {
  const user = loadUser(req, res); if (!user) return;
  const role = String((req.body || {}).role || "").trim();
  if (!["owner", "editor"].includes(role)) return res.status(400).json({ error: "Role must be owner or editor." });
  if (user.id === req.user.id && role !== "owner") return res.status(400).json({ error: "You cannot demote your own account." });
  repo.setUserRole(user.id, role);
  res.json({ ok: true });
});

router.delete("/users/:id", (req, res) => {
  const user = loadUser(req, res); if (!user) return;
  if (user.id === req.user.id) return res.status(400).json({ error: "You cannot delete your own account." });
  if (isPlatformAdmin(user)) return res.status(400).json({ error: "You cannot delete the administrator." });
  repo.deleteUser(user.id);
  res.json({ ok: true });
});

// Move an organisation between plans by hand (useful for comps, trials and fixes).
router.post("/orgs/:id/plan", (req, res) => {
  const org = repo.getOrg(req.params.id);
  if (!org) return res.status(404).json({ error: "Organisation not found." });
  const plan = String((req.body || {}).plan || "").trim();
  if (!["free", "pro"].includes(plan)) return res.status(400).json({ error: "Plan must be free or pro." });
  repo.setOrgPlan(org.id, plan, plan === "pro" ? "active" : "inactive");
  res.json({ ok: true });
});

router.delete("/orgs/:id", (req, res) => {
  const org = repo.getOrg(req.params.id);
  if (!org) return res.status(404).json({ error: "Organisation not found." });
  if (req.org && org.id === req.org.id) return res.status(400).json({ error: "You cannot delete your own organisation." });
  repo.deleteOrgCascade(org.id);
  res.json({ ok: true });
});

module.exports = router;
