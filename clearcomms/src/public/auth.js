"use strict";
(function () {
  const $ = (id) => document.getElementById(id);

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function showTab(which) {
    const signup = which === "signup";
    $("tab-signup").setAttribute("aria-selected", String(signup));
    $("tab-login").setAttribute("aria-selected", String(!signup));
    $("form-signup").hidden = !signup;
    $("form-login").hidden = signup;
  }

  $("tab-signup").addEventListener("click", () => showTab("signup"));
  $("tab-login").addEventListener("click", () => showTab("login"));

  $("form-signup").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("su-error").textContent = "";
    try {
      await postJSON("/api/auth/signup", {
        orgName: $("su-org").value, email: $("su-email").value, password: $("su-pass").value,
      });
      window.location.href = "/app";
    } catch (err) { $("su-error").textContent = err.message; }
  });

  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("li-error").textContent = "";
    try {
      await postJSON("/api/auth/login", { email: $("li-email").value, password: $("li-pass").value });
      window.location.href = "/app";
    } catch (err) { $("li-error").textContent = err.message; }
  });

  // If already signed in, go straight to the app.
  fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.user) window.location.href = "/app"; }).catch(() => {});
})();
