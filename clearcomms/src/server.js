"use strict";
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const config = require("./config");
const { helmetMiddleware, originCheck, authLimiter, checkLimiter } = require("./middleware/security");
const { attachUser } = require("./auth/auth");
const stripeSvc = require("./billing/stripe");
const { getAiConfig } = require("./services/aiConfig");
require("./db/index"); // ensure DB is migrated on boot

const app = express();
if (config.isProd) app.set("trust proxy", 1);

// Stripe webhook needs the raw body, so it is registered before JSON parsing.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!config.stripe.enabled) return res.status(503).end();
  let event;
  try { event = stripeSvc.constructEvent(req.body, req.headers["stripe-signature"]); }
  catch (e) { return res.status(400).send("Webhook signature verification failed"); }
  try { stripeSvc.applyEvent(event); } catch (e) { console.error("webhook apply failed:", e && e.message); }
  res.json({ received: true });
});

app.use(helmetMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(attachUser);
app.use(originCheck);

app.get("/api/health", (req, res) => res.json({ ok: true, ai: getAiConfig().enabled, billing: config.stripe.enabled }));
app.use("/api/auth", authLimiter, require("./routes/auth.routes"));
app.use("/api/billing", require("./routes/billing.routes"));
app.use("/api", checkLimiter, require("./routes/api.routes"));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Static frontend
const pub = path.join(__dirname, "public");
app.use(express.static(pub));
app.get("/app", (req, res) => res.sendFile(path.join(pub, "app.html")));
app.get("/", (req, res) => res.sendFile(path.join(pub, "index.html")));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: "Server error" }); });

if (require.main === module) {
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`ClearComms on ${config.appUrl}  (AI: ${config.anthropic.enabled ? "on" : "off"}, billing: ${config.stripe.enabled ? "on" : "off"})`);
  });
}

module.exports = app;
