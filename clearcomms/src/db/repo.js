"use strict";
const crypto = require("crypto");
const db = require("./index");

const uuid = () => crypto.randomUUID();

// ---- Orgs ----
const insOrg = db.prepare("INSERT INTO orgs (id, name) VALUES (?, ?)");
const selOrg = db.prepare("SELECT * FROM orgs WHERE id = ?");
const selOrgByCustomer = db.prepare("SELECT * FROM orgs WHERE stripe_customer_id = ?");
const updOrgStripe = db.prepare("UPDATE orgs SET stripe_customer_id = ? WHERE id = ?");
const updOrgSub = db.prepare("UPDATE orgs SET plan = ?, subscription_status = ?, stripe_subscription_id = ? WHERE id = ?");

function createOrg(name) { const id = uuid(); insOrg.run(id, name); return selOrg.get(id); }
function getOrg(id) { return selOrg.get(id); }
function getOrgByCustomer(cid) { return selOrgByCustomer.get(cid); }
function setOrgCustomer(orgId, customerId) { updOrgStripe.run(customerId, orgId); }
function setOrgSubscription(orgId, plan, status, subId) { updOrgSub.run(plan, status, subId || null, orgId); }

// ---- Users ----
const insUser = db.prepare("INSERT INTO users (id, org_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)");
const selUserByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
const selUserById = db.prepare("SELECT * FROM users WHERE id = ?");

function createUser({ orgId, email, passwordHash, role = "owner" }) {
  const id = uuid();
  insUser.run(id, orgId, email.toLowerCase(), passwordHash, role);
  return selUserById.get(id);
}
function getUserByEmail(email) { return selUserByEmail.get(String(email).toLowerCase()); }
function getUserById(id) { return selUserById.get(id); }

// ---- Sessions ----
const insSession = db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)");
const selSession = db.prepare("SELECT * FROM sessions WHERE id = ?");
const delSession = db.prepare("DELETE FROM sessions WHERE id = ?");
const delExpired = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')");

function createSession(id, userId, expiresAt) { insSession.run(id, userId, expiresAt); }
function getSession(id) { return selSession.get(id); }
function deleteSession(id) { delSession.run(id); }
function purgeSessions() { delExpired.run(); }

// ---- Brand profiles ----
const insBP = db.prepare("INSERT INTO brand_profiles (id, org_id, name, tone, banned_words, reading_age_target) VALUES (?, ?, ?, ?, ?, ?)");
const selBPList = db.prepare("SELECT * FROM brand_profiles WHERE org_id = ? ORDER BY created_at DESC");
const selBP = db.prepare("SELECT * FROM brand_profiles WHERE id = ? AND org_id = ?");
const delBP = db.prepare("DELETE FROM brand_profiles WHERE id = ? AND org_id = ?");

function createBrandProfile({ orgId, name, tone, bannedWords, readingAgeTarget }) {
  const id = uuid();
  insBP.run(id, orgId, name, tone || null, JSON.stringify(bannedWords || []), readingAgeTarget || null);
  return hydrateBP(selBP.get(id, orgId));
}
function listBrandProfiles(orgId) { return selBPList.all(orgId).map(hydrateBP); }
function getBrandProfile(id, orgId) { return hydrateBP(selBP.get(id, orgId)); }
function deleteBrandProfile(id, orgId) { return delBP.run(id, orgId).changes > 0; }
function hydrateBP(row) {
  if (!row) return null;
  let banned = [];
  try { banned = JSON.parse(row.banned_words || "[]"); } catch (_) { banned = []; }
  return { id: row.id, orgId: row.org_id, name: row.name, tone: row.tone, bannedWords: banned, readingAgeTarget: row.reading_age_target, createdAt: row.created_at };
}

// ---- Checks (audit history) ----
const insCheck = db.prepare("INSERT INTO checks (id, org_id, user_id, platform, input_text, score, band, reading_age, ai_used, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const selChecks = db.prepare("SELECT id, platform, score, band, reading_age, ai_used, created_at FROM checks WHERE org_id = ? ORDER BY created_at DESC LIMIT ?");
const selCheck = db.prepare("SELECT * FROM checks WHERE id = ? AND org_id = ?");
const countMonth = db.prepare("SELECT COUNT(*) AS n FROM checks WHERE org_id = ? AND created_at >= datetime('now','start of month')");

function createCheck({ orgId, userId, platform, inputText, result }) {
  const id = uuid();
  insCheck.run(id, orgId, userId, platform, inputText, result.score, result.band, result.readingAge, result.aiUsed ? 1 : 0, JSON.stringify(result));
  return id;
}
function listChecks(orgId, limit = 25) { return selChecks.all(orgId, limit); }
function getCheck(id, orgId) {
  const row = selCheck.get(id, orgId);
  if (!row) return null;
  let result = null; try { result = JSON.parse(row.result_json); } catch (_) {}
  return { ...row, result };
}
function countChecksThisMonth(orgId) { return countMonth.get(orgId).n; }

// ---- App settings (instance-wide single row) ----
const selSettings = db.prepare("SELECT * FROM app_settings WHERE id = 1");
const upsertSettings = db.prepare(
  "INSERT INTO app_settings (id, anthropic_key_enc, claude_model, updated_at) VALUES (1, ?, ?, datetime('now')) " +
  "ON CONFLICT(id) DO UPDATE SET anthropic_key_enc = excluded.anthropic_key_enc, claude_model = excluded.claude_model, updated_at = excluded.updated_at"
);
function getAppSettings() { return selSettings.get(); }
function setAnthropicKey(enc, model) { upsertSettings.run(enc, model || null); }
function clearAnthropicKey() { upsertSettings.run(null, null); }

// ---- Admin (platform-wide management) ----
const selFirstUser = db.prepare("SELECT * FROM users ORDER BY created_at ASC, rowid ASC LIMIT 1");
const updUserStatus = db.prepare("UPDATE users SET status = ? WHERE id = ?");
const updUserRole = db.prepare("UPDATE users SET role = ? WHERE id = ?");
const delUserSessions = db.prepare("DELETE FROM sessions WHERE user_id = ?");
const delUserChecks = db.prepare("DELETE FROM checks WHERE user_id = ?");
const delUserRow = db.prepare("DELETE FROM users WHERE id = ?");
const countOrgUsers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE org_id = ?");
const updOrgPlan = db.prepare("UPDATE orgs SET plan = ?, subscription_status = ? WHERE id = ?");

function getFirstUser() { return selFirstUser.get(); }
function setUserStatus(id, status) { return updUserStatus.run(status, id).changes > 0; }
function setUserRole(id, role) { return updUserRole.run(role, id).changes > 0; }

// Remove a single user and everything that references them. Wrapped in a
// transaction so an interrupted delete cannot leave half-removed rows.
const deleteUser = db.transaction((id) => {
  delUserSessions.run(id);
  delUserChecks.run(id);
  return delUserRow.run(id).changes > 0;
});

// Remove an organisation and every user, check, profile and session under it.
const deleteOrgCascade = db.transaction((orgId) => {
  const users = db.prepare("SELECT id FROM users WHERE org_id = ?").all(orgId);
  for (const u of users) { delUserSessions.run(u.id); }
  db.prepare("DELETE FROM checks WHERE org_id = ?").run(orgId);
  db.prepare("DELETE FROM brand_profiles WHERE org_id = ?").run(orgId);
  db.prepare("DELETE FROM users WHERE org_id = ?").run(orgId);
  return db.prepare("DELETE FROM orgs WHERE id = ?").run(orgId).changes > 0;
});

function setOrgPlan(orgId, plan, status) { return updOrgPlan.run(plan, status, orgId).changes > 0; }
function countUsersInOrg(orgId) { return countOrgUsers.get(orgId).n; }

function listAllUsers() {
  return db.prepare(
    "SELECT u.id, u.email, u.role, u.status, u.created_at, u.org_id, o.name AS org_name, o.plan, " +
    "(SELECT COUNT(*) FROM checks c WHERE c.user_id = u.id) AS checks " +
    "FROM users u JOIN orgs o ON o.id = u.org_id ORDER BY u.created_at DESC"
  ).all();
}

function listOrgsWithStats() {
  return db.prepare(
    "SELECT o.id, o.name, o.plan, o.subscription_status, o.created_at, " +
    "(SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS users, " +
    "(SELECT COUNT(*) FROM checks c WHERE c.org_id = o.id) AS checks, " +
    "(SELECT MAX(c.created_at) FROM checks c WHERE c.org_id = o.id) AS last_check " +
    "FROM orgs o ORDER BY o.created_at DESC"
  ).all();
}

function platformStats() {
  const one = (sql) => db.prepare(sql).get().n;
  return {
    orgs: one("SELECT COUNT(*) AS n FROM orgs"),
    users: one("SELECT COUNT(*) AS n FROM users"),
    suspended: one("SELECT COUNT(*) AS n FROM users WHERE status = 'suspended'"),
    checks: one("SELECT COUNT(*) AS n FROM checks"),
    checksThisMonth: one("SELECT COUNT(*) AS n FROM checks WHERE created_at >= datetime('now','start of month')"),
    aiChecks: one("SELECT COUNT(*) AS n FROM checks WHERE ai_used = 1"),
    proOrgs: one("SELECT COUNT(*) AS n FROM orgs WHERE plan = 'pro'"),
    signups7d: one("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-7 days')"),
  };
}

module.exports = {
  createOrg, getOrg, getOrgByCustomer, setOrgCustomer, setOrgSubscription,
  createUser, getUserByEmail, getUserById,
  getFirstUser, setUserStatus, setUserRole, deleteUser, deleteOrgCascade,
  setOrgPlan, countUsersInOrg, listAllUsers, listOrgsWithStats, platformStats,
  createSession, getSession, deleteSession, purgeSessions,
  createBrandProfile, listBrandProfiles, getBrandProfile, deleteBrandProfile,
  createCheck, listChecks, getCheck, countChecksThisMonth,
  getAppSettings, setAnthropicKey, clearAnthropicKey,
};
