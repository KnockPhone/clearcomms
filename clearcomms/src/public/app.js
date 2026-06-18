"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const SAMPLES = [
    { platform: "LinkedIn", text: "As an organisation we want to utilise this week to commence a conversation about mental health, because we know that many individuals who are suffering from depression feel they cannot speak to anyone and we believe that by working collaboratively with all of our stakeholders we can facilitate better outcomes for the mentally ill right across our local communities. #mentalhealthawareness" },
    { platform: "Instagram", text: "STOP SMOKING TODAY!!! Are you an addict who is desperate to quit? Our service helps smokers get clean for good. Click here to find out more 👉👉👉 #quitsmoking" },
    { platform: "X", text: "This World AIDS Day we remember every AIDS victim and support those in high-risk groups. Remember, unprotected sex puts you at risk. Get tested and stay clean. #hivawareness" },
  ];

  let lastCheckId = null;

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (res.status === 401) { window.location.href = "/"; throw new Error("Not signed in"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || "Request failed"); e.status = res.status; e.data = data; throw e; }
    return data;
  }

  function flash(msg) { const f = $("flash"); f.textContent = msg; f.style.opacity = "1"; setTimeout(() => { f.style.opacity = "0"; }, 1500); }
  function iconChar(s) { return s === "good" ? "✓" : s === "info" ? "i" : "!"; }

  function itemsHtml(arr, aiUsed) {
    if (!arr || !arr.length) return "";
    return arr.map((it) => {
      const manual = !aiUsed && it.auto === false && (it.status === "warn" || it.status === "issue");
      return `<div class="item"><div class="ic s-${esc(it.status)}">${iconChar(it.status)}</div><div class="tx"><b>${esc(it.label)}</b>${it.topic ? `<span class="pill">${esc(it.topic)}</span>` : ""}${manual ? '<span class="manual">edit manually</span>' : ""}<p>${esc(it.detail)}</p></div></div>`;
    }).join("");
  }
  function catBlock(title, color, arr, aiUsed) {
    return `<div class="cat"><h3><span class="dot" style="background:${color}"></span>${title} <span class="n">(${arr.length})</span></h3>${itemsHtml(arr, aiUsed)}</div>`;
  }

  function renderResult(r, checkId) {
    lastCheckId = checkId || null;
    const c = r.categories || {};
    const rc = r.score >= 80 ? "var(--good)" : r.score >= 60 ? "var(--warn)" : "var(--issue)";
    const aiFlag = r.aiUsed ? '<span class="aiflag on">AI review</span>' : '<span class="aiflag off">Rules only</span>';
    let html = `<div class="scorewrap"><div class="ring" style="--p:${r.score};--rc:${rc}"><div class="inner"><b>${r.score}</b><small>score</small></div></div>`
      + `<div class="scoremeta"><span class="band" style="background:${rc}">${esc(r.band)}</span>${aiFlag}<div class="sub">Reading age about ${esc(r.readingAge)} · aim for 9 to 11</div><div class="sub">${esc(r.words)} words · ${esc(r.sentences)} sentences</div></div></div>`;
    if (r.summary) html += `<p class="summary">${esc(r.summary)}</p>`;
    html += catBlock("Inclusive language", "#E0413A", c.inclusive || [], r.aiUsed);
    html += catBlock("Clarity and plain English", "#D98324", c.clarity || [], r.aiUsed);
    html += catBlock("Accessibility", "#0FA37F", c.accessibility || [], r.aiUsed);
    html += catBlock("Tone and platform", "#5B7A86", c.tone || [], r.aiUsed);
    const rwScore = r.rewriteScore != null ? ` <span class="aiflag on">scores ${r.rewriteScore}/100</span>` : "";
    html += `<div class="rewrite"><h3>Suggested rewrite${rwScore}</h3>`;
    if (!r.aiUsed) html += `<p class="note">Items tagged “edit manually” above are context-dependent and left for you. Add a Claude API key for fluent rewrites that apply everything.</p>`;
    html += `<textarea id="rw" rows="6">${esc(r.rewrite || "")}</textarea><div class="row"><button class="btn btn-ghost" id="copy-rw">Copy rewrite</button>`;
    if (lastCheckId) html += `<button class="btn btn-ghost" id="dl-report">Download report</button>`;
    html += `</div></div>`;
    $("results").innerHTML = html;
    $("copy-rw").addEventListener("click", () => { const t = $("rw").value; if (navigator.clipboard) navigator.clipboard.writeText(t); flash("Rewrite copied"); });
    if (lastCheckId) $("dl-report").addEventListener("click", () => { window.location.href = `/api/checks/${lastCheckId}/report`; });
  }

  async function runCheck() {
    const text = $("draft").value.trim();
    if (!text) { flash("Enter some text first"); return; }
    $("upgrade-banner").hidden = true;
    $("check").disabled = true; $("check").textContent = "Checking...";
    $("results").innerHTML = '<div class="empty">Checking your post... (the first check after a quiet spell can take up to a minute while the server wakes)</div>';
    try {
      const data = await api("POST", "/api/check", { text, platform: $("platform").value, brandProfileId: $("profile").value || undefined });
      renderResult(data.result, data.checkId);
      loadUsage(); loadHistory();
    } catch (e) {
      if (e.status === 402) {
        const b = $("upgrade-banner");
        b.hidden = false;
        b.innerHTML = `You have used your free checks for this month. <button class="btn btn-primary" id="up2" style="margin-left:8px">Upgrade</button>`;
        $("up2").addEventListener("click", startUpgrade);
      } else { flash(e.message || "Check failed"); }
    } finally { $("check").disabled = false; $("check").textContent = "Check post"; }
  }

  async function loadUsage() {
    try {
      const u = await api("GET", "/api/usage");
      const parts = [];
      parts.push(u.ai ? "AI on" : "Rules only");
      if (u.unlimited) parts.push(u.plan === "pro" ? "Pro plan" : "Unlimited");
      else parts.push(`${u.used}/${u.limit} checks this month`);
      $("usage").textContent = parts.join(" · ");
      const showUpgrade = u.billing && !u.unlimited;
      $("upgrade").hidden = !showUpgrade;
      $("manage").hidden = !(u.billing && u.plan === "pro");
    } catch (e) { /* ignore */ }
  }

  async function loadProfiles() {
    try {
      const { profiles } = await api("GET", "/api/brand-profiles");
      const sel = $("profile");
      sel.innerHTML = '<option value="">None</option>' + profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
      $("profiles-list").innerHTML = profiles.length
        ? profiles.map((p) => `<li><span class="grow">${esc(p.name)}${p.readingAgeTarget ? ` · age ${esc(p.readingAgeTarget)}` : ""}${p.bannedWords && p.bannedWords.length ? ` · ${p.bannedWords.length} banned` : ""}</span><button class="link" data-del="${esc(p.id)}">remove</button></li>`).join("")
        : '<li class="muted">No profiles yet. Add one below.</li>';
      document.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => removeProfile(b.getAttribute("data-del"))));
    } catch (e) { /* ignore */ }
  }

  async function removeProfile(id) {
    try { await api("DELETE", "/api/brand-profiles/" + id); loadProfiles(); flash("Profile removed"); } catch (e) { flash(e.message); }
  }

  async function loadHistory() {
    try {
      const { checks } = await api("GET", "/api/history");
      $("history").innerHTML = checks.length
        ? checks.map((ch) => {
            const col = ch.score >= 80 ? "var(--good)" : ch.score >= 60 ? "var(--warn)" : "var(--issue)";
            const when = new Date(ch.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            return `<li><span class="s" style="color:${col}">${esc(ch.score)}</span><span class="grow"><button class="link" data-check="${esc(ch.id)}">${esc(ch.platform)} · ${when}</button></span>${ch.ai_used ? '<span class="pill">AI</span>' : ""}</li>`;
          }).join("")
        : '<li class="muted">No checks yet.</li>';
      document.querySelectorAll("[data-check]").forEach((b) => b.addEventListener("click", () => openCheck(b.getAttribute("data-check"))));
    } catch (e) { /* ignore */ }
  }

  async function openCheck(id) {
    try {
      const { check } = await api("GET", "/api/checks/" + id);
      $("draft").value = check.inputText || "";
      if (check.platform) $("platform").value = check.platform;
      updateCount();
      renderResult(check.result, check.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { flash(e.message); }
  }

  async function startUpgrade() {
    try {
      const { url } = await api("POST", "/api/billing/checkout");
      window.location.href = url;
    } catch (e) { flash(e.message || "Billing is not configured on this server."); }
  }
  async function manageBilling() {
    try { const { url } = await api("POST", "/api/billing/portal"); window.location.href = url; }
    catch (e) { flash(e.message || "Could not open billing."); }
  }

  function updateCount() { $("count").textContent = $("draft").value.length + " characters"; }

  // ---- AI key setup ----
  async function loadSettings() {
    try {
      const s = await api("GET", "/api/settings");
      window.__settings = s;
      if (!s.aiConfigured && s.isOwner) openSetup();   // first-run popup
    } catch (e) { /* ignore */ }
  }
  function openSetup() {
    const dlg = $("setup-dialog"); if (!dlg) return;
    const env = !!(window.__settings && window.__settings.envManaged);
    $("set-key").value = "";
    $("set-error").textContent = "";
    $("set-key").disabled = env;
    $("set-envnote").hidden = !env;
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function closeSetup() { const dlg = $("setup-dialog"); if (dlg && dlg.open) dlg.close(); }

  // ---- wire up ----
  $("draft").addEventListener("input", updateCount);
  $("check").addEventListener("click", runCheck);
  $("logout").addEventListener("click", async () => { await api("POST", "/api/auth/logout").catch(() => {}); window.location.href = "/"; });
  $("upgrade").addEventListener("click", startUpgrade);
  $("manage").addEventListener("click", manageBilling);
  document.querySelectorAll("[data-sample]").forEach((b) => b.addEventListener("click", () => {
    const s = SAMPLES[Number(b.getAttribute("data-sample"))];
    $("draft").value = s.text; $("platform").value = s.platform; updateCount();
  }));
  $("bp-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("bp-error").textContent = "";
    try {
      await api("POST", "/api/brand-profiles", {
        name: $("bp-name").value, tone: $("bp-tone").value,
        bannedWords: $("bp-banned").value, readingAgeTarget: $("bp-age").value,
      });
      $("bp-form").reset(); loadProfiles(); flash("Profile added");
    } catch (err) { $("bp-error").textContent = err.message; }
  });

  $("settings-btn").addEventListener("click", openSetup);
  $("setup-skip").addEventListener("click", closeSetup);
  $("setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("set-error").textContent = "";
    try {
      await api("POST", "/api/settings/anthropic-key", { apiKey: $("set-key").value, model: $("set-model").value });
      closeSetup();
      flash("AI is on");
      loadUsage(); loadSettings();
    } catch (err) { $("set-error").textContent = err.message; }
  });

  // ---- init (guard auth) ----
  (async function init() {
    try {
      const me = await fetch("/api/auth/me").then((r) => r.json());
      if (!me.user) { window.location.href = "/"; return; }
      $("who").textContent = me.user.org.name;
    } catch (e) { window.location.href = "/"; return; }
    updateCount(); loadUsage(); loadProfiles(); loadHistory(); loadSettings();
  })();
})();
