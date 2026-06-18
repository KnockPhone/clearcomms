"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");

// Isolated, key-free environment before anything is required.
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.STRIPE_SECRET_KEY;
const tmp = path.join(os.tmpdir(), "cc-test-" + crypto.randomBytes(4).toString("hex") + ".sqlite");
process.env.DATABASE_PATH = tmp;

const app = require("../src/server");

let server, base, cookie;

test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, () => { base = "http://127.0.0.1:" + server.address().port; resolve(); }); });
});
test.after(() => {
  if (server) server.close();
  for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch (_) {} }
});

function req(method, p, body, withCookie) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (withCookie && cookie) headers["Cookie"] = cookie;
  return fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

test("health endpoint responds", async () => {
  const d = await (await fetch(base + "/api/health")).json();
  assert.equal(d.ok, true);
});

test("signup creates an account and session", async () => {
  const email = "t" + Date.now() + "@example.com";
  const r = await req("POST", "/api/auth/signup", { orgName: "Test Org", email, password: "password123" });
  assert.equal(r.status, 200);
  const sc = r.headers.get("set-cookie");
  assert.ok(sc && /cc_session=/.test(sc), "should set a session cookie");
  cookie = sc.split(";")[0];
});

test("rejects weak passwords", async () => {
  const r = await req("POST", "/api/auth/signup", { orgName: "X", email: "weak@example.com", password: "short" });
  assert.equal(r.status, 400);
});

test("check returns a score and is saved to history", async () => {
  const r = await req("POST", "/api/check", { text: "Every AIDS victim deserves help.", platform: "X" }, true);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(typeof d.result.score, "number");
  assert.ok(d.checkId);
  const h = await (await req("GET", "/api/history", null, true)).json();
  assert.ok(h.checks.length >= 1);
});

test("usage requires authentication", async () => {
  const r = await req("GET", "/api/usage", null, false);
  assert.equal(r.status, 401);
});

test("brand profile is created and applied to a check", async () => {
  const c = await req("POST", "/api/brand-profiles", { name: "Main", bannedWords: "synergy" }, true);
  assert.equal(c.status, 200);
  const { profile } = await c.json();
  const d = await (await req("POST", "/api/check", { text: "This is full of synergy today.", platform: "LinkedIn", brandProfileId: profile.id }, true)).json();
  assert.ok(d.result.categories.inclusive.some((i) => /synergy/i.test(i.label)));
});

test("owner can save and clear the in-app API key", async () => {
  let s = await (await req("GET", "/api/settings", null, true)).json();
  assert.equal(s.aiConfigured, false);
  assert.equal(s.isOwner, true);

  const bad = await req("POST", "/api/settings/anthropic-key", { apiKey: "not-a-key" }, true);
  assert.equal(bad.status, 400);

  const ok = await req("POST", "/api/settings/anthropic-key", { apiKey: "sk-ant-test-abc123", model: "claude-sonnet-4-6" }, true);
  assert.equal(ok.status, 200);

  s = await (await req("GET", "/api/settings", null, true)).json();
  assert.equal(s.aiConfigured, true);
  assert.equal(s.source, "stored");

  // Clear it so later checks do not attempt a live AI call.
  const del = await req("DELETE", "/api/settings/anthropic-key", null, true);
  assert.equal(del.status, 200);
});

test("logout ends the session", async () => {
  const r = await req("POST", "/api/auth/logout", null, true);
  assert.equal(r.status, 200);
});
