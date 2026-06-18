"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let ME = "";
  let USERS = [];

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (res.status === 401) { window.location.href = "/"; throw new Error("Not signed in"); }
    if (res.status === 403) { window.location.href = "/app"; throw new Error("Not an admin"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || "Request failed"); e.status = res.status; throw e; }
    return data;
  }

  function flash(msg) { const f = $("flash"); f.textContent = msg; f.style.opacity = "1"; setTimeout(() => { f.style.opacity = "0"; }, 1600); }
  function when(s) { return s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"; }
  function ago(s) {
    if (!s) return "Never";
    const d = (Date.now() - new Date(s).getTime()) / 86400000;
    if (d < 1) return "Today";
    if (d < 2) return "Yesterday";
    if (d < 31) return Math.floor(d) + " days ago";
    return when(s);
  }

  function statCard(label, value, sub) {
    return `<div class="stat"><div class="stat-v">${esc(value)}</div><div class="stat-l">${esc(label)}</div>${sub ? `<div class="stat-s">${esc(sub)}</div>` : ""}</div>`;
  }

  function renderStats(d) {
    const s = d.stats;
    const cards = [
      statCard("Organisations", s.orgs, s.proOrgs + " on Pro"),
      statCard("People", s.users, s.suspended ? s.suspended + " suspended" : "All active"),
      statCard("Checks all time", s.checks, s.aiChecks + " with AI"),
      statCard("Checks this month", s.checksThisMonth, ""),
      statCard("New sign-ups", s.signups7d, "last 7 days"),
      statCard("AI engine", d.ai ? "On" : "Off", d.ai ? "Claude connected" : "Add a key in the app"),
      statCard("Billing", d.billing ? "On" : "Off", d.billing ? "Stripe connected" : "Not configured"),
    ];
    $("stats").innerHTML = cards.join("");
  }

  function planBadge(plan) {
    const pro = plan === "pro";
    return `<span class="badge ${pro ? "badge-pro" : "badge-free"}">${pro ? "Pro" : "Free"}</span>`;
  }

  function renderOrgs(orgs) {
    $("org-count").textContent = "(" + orgs.length + ")";
    $("org-body").innerHTML = orgs.map((o) => {
      const pro = o.plan === "pro";
      const toggle = `<button class="link" data-plan="${esc(o.id)}" data-to="${pro ? "free" : "pro"}">${pro ? "Make Free" : "Make Pro"}</button>`;
      const del = `<button class="link danger" data-delorg="${esc(o.id)}" data-name="${esc(o.name)}">Delete</button>`;
      return `<tr>
        <td><b>${esc(o.name)}</b></td>
        <td>${planBadge(o.plan)}</td>
        <td>${esc(o.users)}</td>
        <td>${esc(o.checks)}</td>
        <td class="muted">${esc(ago(o.last_check))}</td>
        <td class="muted">${esc(when(o.created_at))}</td>
        <td class="ar">${toggle} <span class="sep">·</span> ${del}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="7" class="muted">No organisations yet.</td></tr>`;

    document.querySelectorAll("[data-plan]").forEach((b) => b.addEventListener("click", () => changePlan(b.getAttribute("data-plan"), b.getAttribute("data-to"))));
    document.querySelectorAll("[data-delorg]").forEach((b) => b.addEventListener("click", () => deleteOrg(b.getAttribute("data-delorg"), b.getAttribute("data-name"))));
  }

  function statusBadge(status) {
    return status === "suspended"
      ? '<span class="badge badge-susp">Suspended</span>'
      : '<span class="badge badge-active">Active</span>';
  }

  function renderUsers(users) {
    const q = ($("user-search").value || "").trim().toLowerCase();
    const rows = users.filter((u) => !q || u.email.toLowerCase().includes(q) || (u.org_name || "").toLowerCase().includes(q));
    $("user-count").textContent = "(" + users.length + ")";
    $("user-body").innerHTML = rows.map((u) => {
      const isMe = u.email === ME;
      const tag = isMe ? '<span class="badge badge-admin">Admin · you</span>' : "";
      let actions;
      if (isMe) {
        actions = '<span class="muted">—</span>';
      } else {
        const susp = u.status === "suspended"
          ? `<button class="link" data-activate="${esc(u.id)}">Reactivate</button>`
          : `<button class="link" data-suspend="${esc(u.id)}">Suspend</button>`;
        const del = `<button class="link danger" data-deluser="${esc(u.id)}" data-email="${esc(u.email)}">Delete</button>`;
        actions = `${susp} <span class="sep">·</span> ${del}`;
      }
      return `<tr>
        <td><b>${esc(u.email)}</b> ${tag}</td>
        <td>${esc(u.org_name)} ${planBadge(u.plan)}</td>
        <td class="muted">${esc(u.role)}</td>
        <td>${statusBadge(u.status)}</td>
        <td>${esc(u.checks)}</td>
        <td class="muted">${esc(when(u.created_at))}</td>
        <td class="ar">${actions}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="7" class="muted">No matching people.</td></tr>`;

    document.querySelectorAll("[data-suspend]").forEach((b) => b.addEventListener("click", () => act("POST", "/api/admin/users/" + b.getAttribute("data-suspend") + "/suspend", "Suspended")));
    document.querySelectorAll("[data-activate]").forEach((b) => b.addEventListener("click", () => act("POST", "/api/admin/users/" + b.getAttribute("data-activate") + "/activate", "Reactivated")));
    document.querySelectorAll("[data-deluser]").forEach((b) => b.addEventListener("click", () => deleteUser(b.getAttribute("data-deluser"), b.getAttribute("data-email"))));
  }

  async function load() {
    try {
      const d = await api("GET", "/api/admin/overview");
      ME = d.me.email;
      $("who").textContent = d.me.email;
      renderStats(d);
      renderOrgs(d.orgs);
      USERS = d.users;
      renderUsers(USERS);
    } catch (e) { /* redirected on 401/403 */ }
  }

  async function act(method, url, word) {
    try { await api(method, url); flash(word); load(); }
    catch (e) { flash(e.message); }
  }
  async function changePlan(id, to) {
    try { await api("POST", "/api/admin/orgs/" + id + "/plan", { plan: to }); flash("Plan updated"); load(); }
    catch (e) { flash(e.message); }
  }
  async function deleteOrg(id, name) {
    if (!window.confirm(`Delete "${name}" and every person, check and profile in it? This cannot be undone.`)) return;
    try { await api("DELETE", "/api/admin/orgs/" + id); flash("Organisation deleted"); load(); }
    catch (e) { flash(e.message); }
  }
  async function deleteUser(id, email) {
    if (!window.confirm(`Delete ${email}? This removes their account and check history and cannot be undone.`)) return;
    try { await api("DELETE", "/api/admin/users/" + id); flash("Person deleted"); load(); }
    catch (e) { flash(e.message); }
  }

  $("refresh").addEventListener("click", load);
  $("user-search").addEventListener("input", () => renderUsers(USERS));
  $("logout").addEventListener("click", async () => { await api("POST", "/api/auth/logout").catch(() => {}); window.location.href = "/"; });

  (async function init() {
    try {
      const me = await fetch("/api/auth/me").then((r) => r.json());
      if (!me.user) { window.location.href = "/"; return; }
      if (!me.user.isAdmin) { window.location.href = "/app"; return; }
    } catch (e) { window.location.href = "/"; return; }
    load();
  })();
})();
