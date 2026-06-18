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
  let currentPlatform = "LinkedIn";

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

  function setPlatform(p) {
    currentPlatform = p;
    document.querySelectorAll("#platforms button").forEach((b) => {
      const on = b.getAttribute("data-platform") === p;
      b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on));
    });
  }

  function itemsHtml(arr, aiUsed) {
    if (!arr || !arr.length) return "";
    return arr.map((it) => {
      const manual = !aiUsed && it.auto === false && (it.status === "warn" || it.status === "issue");
      return `<div class="item"><div class="ic s-${esc(it.status)}"></div><div class="tx"><b>${esc(it.label)}</b>${it.topic ? `<span class="pill">${esc(it.topic)}</span>` : ""}${manual ? '<span class="manual">edit manually</span>' : ""}<p>${esc(it.detail)}</p></div></div>`;
    }).join("");
  }
  function catBlock(title, arr, aiUsed) {
    return `<div class="cat"><h3>${title} <span class="n">${arr.length}</span></h3>${itemsHtml(arr, aiUsed)}</div>`;
  }

  // ---- Inline highlighting: mark the exact words behind each finding ----
  function collectTerms(c) {
    const terms = [];
    for (const arr of [c.inclusive, c.clarity, c.accessibility, c.tone]) {
      if (!arr) continue;
      for (const it of arr) {
        if (it.status !== "issue" && it.status !== "warn") continue;
        const sev = it.status === "issue" ? "issue" : "warn";
        if (it.match) terms.push({ t: String(it.match), sev, why: it.detail || "" });
        if (Array.isArray(it.matches)) for (const m of it.matches) terms.push({ t: String(m), sev, why: it.detail || "" });
      }
    }
    return terms;
  }
  function buildMarkup(text, c) {
    if (!text) return { html: "", count: 0 };
    const terms = collectTerms(c).filter((x) => x.t && x.t.length >= 2);
    const low = text.toLowerCase();
    const ranges = [];
    for (const { t, sev, why } of terms) {
      const needle = t.toLowerCase(); let i = 0;
      while ((i = low.indexOf(needle, i)) !== -1) { ranges.push({ s: i, e: i + needle.length, sev, why }); i += needle.length; }
    }
    if (!ranges.length) return { html: "", count: 0 };
    ranges.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
    const picked = []; let lastEnd = -1;
    for (const r of ranges) { if (r.s >= lastEnd) { picked.push(r); lastEnd = r.e; } }
    let html = ""; let pos = 0;
    for (const r of picked) {
      if (r.s > pos) html += esc(text.slice(pos, r.s));
      html += `<mark class="hl ${r.sev === "issue" ? "hl-issue" : "hl-warn"}" title="${esc(r.why)}">${esc(text.slice(r.s, r.e))}</mark>`;
      pos = r.e;
    }
    if (pos < text.length) html += esc(text.slice(pos));
    return { html, count: picked.length };
  }

  // The reasoning behind this specific rewrite.
  function changesBlock(r) {
    const c = r.categories || {};
    const all = [].concat(c.inclusive || [], c.clarity || [], c.accessibility || [], c.tone || []);
    const applied = all.filter((it) => (it.status === "warn" || it.status === "issue") && (r.aiUsed || it.auto !== false));
    let body;
    if (!applied.length) {
      body = `<p class="changes-empty">Nothing needed changing. This draft already reads clearly, kindly and accessibly.</p>`;
    } else {
      body = `<ul class="changes-list">` + applied.slice(0, 8).map((it) =>
        `<li><span class="changes-what">${esc(it.label)}</span><span class="changes-why">${esc(it.detail)}</span></li>`
      ).join("") + `</ul>`;
      if (applied.length > 8) body += `<p class="muted" style="font-size:12.5px;margin:8px 0 0">and ${applied.length - 8} more in the findings above.</p>`;
    }
    return `<div class="changes"><h3>What changed, and why</h3>${body}</div>`;
  }

  function renderResult(r, checkId, text) {
    lastCheckId = checkId || null;
    const c = r.categories || {};
    const rc = r.score >= 80 ? "var(--ink)" : r.score >= 60 ? "var(--yellow-d)" : "var(--coral)";
    const aiFlag = r.aiUsed ? '<span class="aiflag on">AI review</span>' : '<span class="aiflag off">Rules only</span>';
    let html = `<div class="score"><div class="num" style="color:${rc}">${r.score}<span class="slash">/100</span></div>`
      + `<div class="verdict"><div class="band" style="color:${rc}">${esc(r.band)}</div>`
      + `<div class="vtext">${r.summary ? esc(r.summary) : "Reading age about " + esc(r.readingAge) + ", aim for 9 to 11."}</div>`
      + `<div class="underline-coral" style="background:${rc}"></div>${aiFlag}</div></div>`;

    const mk = buildMarkup(text, c);
    if (mk.count) html += `<div class="markup"><span class="cap ttl">Your post, marked up</span>${mk.html}</div>`;

    html += catBlock("Inclusive language", c.inclusive || [], r.aiUsed);
    html += catBlock("Clarity and plain English", c.clarity || [], r.aiUsed);
    html += catBlock("Accessibility", c.accessibility || [], r.aiUsed);
    html += catBlock("Tone and platform", c.tone || [], r.aiUsed);

    html += changesBlock(r);

    const up = r.rewriteScore != null && r.score != null && r.rewriteScore > r.score ? `, up from ${r.score}` : "";
    const rwScore = r.rewriteScore != null ? `<span class="aiflag on">Scores ${r.rewriteScore}/100${up}</span>` : "";
    html += `<div class="rewrite"><h3>Suggested rewrite ${rwScore}</h3>`;
    if (!r.aiUsed) html += `<p class="note">Items tagged “edit manually” above are context-dependent and left for you. Add a Claude API key for fluent rewrites that apply everything.</p>`;
    html += `<textarea id="rw" rows="6">${esc(r.rewrite || "")}</textarea><div class="row"><button class="btn btn-ghost btn-sm" id="copy-rw">Copy rewrite</button>`;
    if (lastCheckId) html += `<button class="btn btn-ghost btn-sm" id="dl-report">Download report</button>`;
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
    $("results").innerHTML = '<div class="empty">Checking your post... the first check after a quiet spell can take up to a minute while the server wakes.</div>';
    try {
      const data = await api("POST", "/api/check", { text, platform: currentPlatform, brandProfileId: $("profile").value || undefined });
      renderResult(data.result, data.checkId, text);
      loadUsage(); loadHistory();
    } catch (e) {
      if (e.status === 402) {
        const b = $("upgrade-banner");
        b.hidden = false;
        b.innerHTML = `You have used your free checks for this month. <button class="btn btn-primary btn-sm" id="up2" style="margin-left:8px">Upgrade</button>`;
        $("up2").addEventListener("click", startUpgrade);
      } else { flash(e.message || "Check failed"); }
    } finally { $("check").disabled = false; $("check").innerHTML = 'Check post <span class="ar">&rarr;</span>'; }
  }

  async function loadUsage() {
    try {
      const u = await api("GET", "/api/usage");
      const parts = [];
      parts.push(u.ai ? "AI on" : "Rules only");
      if (u.unlimited) parts.push(u.plan === "pro" ? "Pro plan" : "Unlimited");
      else parts.push(`${u.used}/${u.limit} checks`);
      $("usage").textContent = parts.join(" · ");
      const showUpgrade = u.billing && !u.unlimited;
      $("upgrade").hidden = !showUpgrade;
      $("manage").hidden = !(u.billing && u.plan === "pro");
      const af = $("alt-aiflag"); if (af) af.hidden = !!u.ai;
    } catch (e) { /* ignore */ }
  }

  async function loadProfiles() {
    try {
      const { profiles } = await api("GET", "/api/brand-profiles");
      const sel = $("profile");
      sel.innerHTML = '<option value="">None</option>' + profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
      $("profiles-list").innerHTML = profiles.length
        ? profiles.map((p) => `<li><span class="grow"><b style="font-weight:700;color:var(--ink)">${esc(p.name)}</b><div class="m">${p.readingAgeTarget ? `age ${esc(p.readingAgeTarget)}` : ""}${p.bannedWords && p.bannedWords.length ? ` · ${p.bannedWords.length} banned` : ""}</div></span><button class="link" data-del="${esc(p.id)}">Remove</button></li>`).join("")
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
            const when = new Date(ch.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            return `<li><span class="s ${ch.score < 70 ? "lo" : ""}">${esc(ch.score)}</span><span class="grow"><button class="link" data-check="${esc(ch.id)}">${esc(ch.platform)}</button><div class="m">${when}${ch.ai_used ? " · AI" : ""}</div></span></li>`;
          }).join("")
        : '<li class="muted">No checks yet.</li>';
      document.querySelectorAll("[data-check]").forEach((b) => b.addEventListener("click", () => openCheck(b.getAttribute("data-check"))));
    } catch (e) { /* ignore */ }
  }

  async function openCheck(id) {
    try {
      const { check } = await api("GET", "/api/checks/" + id);
      $("draft").value = check.inputText || "";
      if (check.platform) setPlatform(check.platform);
      updateCount();
      renderResult(check.result, check.id, check.inputText || "");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { flash(e.message); }
  }

  async function startUpgrade() {
    try { const { url } = await api("POST", "/api/billing/checkout"); window.location.href = url; }
    catch (e) { flash(e.message || "Billing is not configured on this server."); }
  }
  async function manageBilling() {
    try { const { url } = await api("POST", "/api/billing/portal"); window.location.href = url; }
    catch (e) { flash(e.message || "Could not open billing."); }
  }

  function updateCount() { $("count").textContent = $("draft").value.length + " characters"; }

  // ---- Image alt text ----
  let altBase64 = null, altMedia = "image/jpeg";
  function handleAltFile(file) {
    $("alt-error").textContent = "";
    if (!/^image\//.test(file.type)) { $("alt-error").textContent = "Please choose an image file."; return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1024; let w = img.width, h = img.height;
      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = cv.toDataURL("image/jpeg", 0.82);
      altBase64 = dataUrl.split(",")[1]; altMedia = "image/jpeg";
      const pv = $("alt-preview"); pv.src = dataUrl; pv.hidden = false; $("alt-droptext").hidden = true;
      $("alt-gen").disabled = false;
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { $("alt-error").textContent = "Could not read that image."; URL.revokeObjectURL(url); };
    img.src = url;
  }

  function wireAltText() {
    const dz = $("alt-dropzone"), file = $("alt-file"), gen = $("alt-gen");
    if (!dz) return;
    file.addEventListener("change", () => { if (file.files[0]) handleAltFile(file.files[0]); });
    ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.style.borderColor = "var(--ink)"; }));
    ["dragleave"].forEach((ev) => dz.addEventListener(ev, () => { dz.style.borderColor = ""; }));
    dz.addEventListener("drop", (e) => { e.preventDefault(); dz.style.borderColor = ""; if (e.dataTransfer.files[0]) handleAltFile(e.dataTransfer.files[0]); });
    gen.addEventListener("click", async () => {
      if (!altBase64) return;
      $("alt-error").textContent = ""; gen.disabled = true; gen.textContent = "Reading image...";
      try {
        const { result } = await api("POST", "/api/alt-text", { image: altBase64, mediaType: altMedia });
        $("alt-alt").textContent = result.altText || "";
        $("alt-caption").textContent = result.caption || "";
        $("alt-empty").hidden = true; $("alt-result").hidden = false;
      } catch (e) {
        $("alt-error").textContent = e.status === 503 ? "Turn on AI in Settings to generate alt text." : (e.message || "Could not generate alt text.");
      } finally { gen.disabled = false; gen.textContent = "Generate alt text"; }
    });
    $("alt-copy-alt").addEventListener("click", () => { if (navigator.clipboard) navigator.clipboard.writeText($("alt-alt").textContent); flash("Alt text copied"); });
    $("alt-copy-cap").addEventListener("click", () => { if (navigator.clipboard) navigator.clipboard.writeText($("alt-caption").textContent); flash("Caption copied"); });
  }

  // ---- AI key setup ----
  async function loadSettings() {
    try {
      const s = await api("GET", "/api/settings");
      window.__settings = s;
      if (!s.aiConfigured && s.isOwner) openSetup();
    } catch (e) { /* ignore */ }
  }
  function openSetup() {
    const dlg = $("setup-dialog"); if (!dlg) return;
    const env = !!(window.__settings && window.__settings.envManaged);
    $("set-key").value = ""; $("set-error").textContent = "";
    $("set-key").disabled = env; $("set-envnote").hidden = !env;
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function closeSetup() { const dlg = $("setup-dialog"); if (dlg && dlg.open) dlg.close(); }

  // ---- wire up ----
  $("draft").addEventListener("input", updateCount);
  $("check").addEventListener("click", runCheck);
  document.querySelectorAll("#platforms button").forEach((b) => b.addEventListener("click", () => setPlatform(b.getAttribute("data-platform"))));
  $("logout").addEventListener("click", async () => { await api("POST", "/api/auth/logout").catch(() => {}); window.location.href = "/"; });
  $("upgrade").addEventListener("click", startUpgrade);
  $("manage").addEventListener("click", manageBilling);
  document.querySelectorAll("[data-sample]").forEach((b) => b.addEventListener("click", () => {
    const s = SAMPLES[Number(b.getAttribute("data-sample"))];
    $("draft").value = s.text; setPlatform(s.platform); updateCount();
  }));
  $("bp-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("bp-error").textContent = "";
    try {
      await api("POST", "/api/brand-profiles", { name: $("bp-name").value, tone: $("bp-tone").value, bannedWords: $("bp-banned").value, readingAgeTarget: $("bp-age").value });
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
      closeSetup(); flash("AI is on"); loadUsage(); loadSettings();
    } catch (err) { $("set-error").textContent = err.message; }
  });
  wireAltText();

  // ---- init ----
  (async function init() {
    try {
      const me = await fetch("/api/auth/me").then((r) => r.json());
      if (!me.user) { window.location.href = "/"; return; }
      $("who").textContent = me.user.org.name;
      if (me.user.isAdmin) { const al = $("admin-link"); if (al) al.hidden = false; }
    } catch (e) { window.location.href = "/"; return; }
    updateCount(); loadUsage(); loadProfiles(); loadHistory(); loadSettings();
  })();
})();
