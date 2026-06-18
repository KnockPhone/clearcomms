"use strict";
const express = require("express");
const config = require("../config");
const { requireAuth } = require("../auth/auth");
const stripeSvc = require("../billing/stripe");

const router = express.Router();

router.post("/checkout", requireAuth, async (req, res) => {
  if (!config.stripe.enabled) return res.status(503).json({ error: "Billing is not configured on this server." });
  try { res.json({ url: await stripeSvc.createCheckout(req.org, req.user.email) }); }
  catch (e) { res.status(500).json({ error: e.message || "Could not start checkout." }); }
});

router.post("/portal", requireAuth, async (req, res) => {
  if (!config.stripe.enabled) return res.status(503).json({ error: "Billing is not configured." });
  try { res.json({ url: await stripeSvc.createPortal(req.org) }); }
  catch (e) { res.status(500).json({ error: e.message || "Could not open the billing portal." }); }
});

module.exports = router;
