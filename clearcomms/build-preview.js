// Builds self-contained preview pages (CSS inlined) to render the new theme.
const fs = require("fs");
const path = require("path");
const css = fs.readFileSync(path.join(__dirname, "src/public/styles.css"), "utf8");

const landing = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>${css}</style></head><body>
<header class="topbar"><a class="brand" href="#"><span class="mark">C</span> ClearComms</a></header>
<main class="wrap">
<section class="hero"><span class="eyebrow">Public sector · health · charity comms</span>
<h1>Write comms that are <span class="hl">clear, kind</span> and accessible.</h1>
<p>Check any social post for plain English, accessibility and non-stigmatising language before it goes live. Built for the teams who can't afford to get the words wrong.</p>
<div class="pills"><span>Plain-English scoring</span><span>Non-stigmatising language</span><span>Accessibility checks</span><span>Natural rewrites</span></div></section>
<section class="feature-row">
<div class="feature"><div class="ic">Aa</div><b>Plain English</b><span>Reading-age scoring with specific, usable rewrites.</span></div>
<div class="feature"><div class="ic">&#9829;</div><b>Inclusive language</b><span>Catches stigmatising wording on sensitive health topics.</span></div>
<div class="feature"><div class="ic">&#10003;</div><b>Accessibility</b><span>Hashtags, capitals, emoji, link text and alt-text prompts.</span></div></section>
<section class="authcard"><div class="tabs"><button aria-selected="true">Create account</button><button aria-selected="false">Log in</button></div>
<h2>Start checking in minutes</h2>
<label>Organisation name</label><input value="Diva Creative">
<label>Work email</label><input value="simon@divacreative.com">
<label>Password (at least 8 characters)</label><input type="password" value="xxxxxxxx">
<button class="btn btn-primary btn-lg" style="width:100%;margin-top:14px">Create account</button></section>
<p class="foot">Assistive only. Keep a human in the loop before publishing.</p></main></body></html>`;

const item = (s, label, detail, extra = "") =>
  `<div class="item"><div class="ic s-${s}">${s === "good" ? "&#10003;" : s === "info" ? "i" : "!"}</div><div class="tx"><b>${label}</b>${extra}<p>${detail}</p></div></div>`;
const cat = (color, title, n, items) =>
  `<div class="cat"><h3><span class="dot" style="background:${color}"></span>${title} <span class="n">(${n})</span></h3>${items}</div>`;

const results = `<div class="scorewrap"><div class="ring" style="--p:64;--rc:var(--warn)"><div class="inner"><b>64</b><small>score</small></div></div>
<div class="scoremeta"><span class="band" style="background:var(--warn)">Needs polish</span><span class="aiflag on">AI review</span><div class="sub">Reading age about 7 · aim for 9 to 11</div><div class="sub">26 words · 4 sentences</div></div></div>
<p class="summary">Swap the stigmatising wording and ease off the capitals, and this is ready to go.</p>
${cat("#E0413A", "Inclusive language", 2,
  item("issue", "&ldquo;addict&rdquo;", "Use people-first language, not a label. Try: &ldquo;person with a dependence&rdquo;.", '<span class="pill">Addiction</span>') +
  item("issue", "&ldquo;clean&rdquo;", "&lsquo;Clean&rsquo; implies people who use are &lsquo;dirty&rsquo;.", '<span class="pill">Addiction</span><span class="manual">edit manually</span>'))}
${cat("#D98324", "Clarity and plain English", 1, item("good", "Reading age about 7", "On target. Plain health writing aims for a reading age of 9 to 11."))}
${cat("#0FA37F", "Accessibility", 3,
  item("warn", "Avoid SHOUTING in capitals", "The rewrite switches these to sentence case.") +
  item("warn", "Hashtags need CamelCase", "Capitalise each word so screen readers read them correctly.", '<span class="manual">edit manually</span>') +
  item("info", "Image alt text", "If this post has an image, add descriptive alt text."))}
${cat("#5B7A86", "Tone and platform", 2,
  item("warn", "3 exclamation marks", "More than two can feel shouty. The rewrite keeps one.") +
  item("info", "168 characters", "The first ~125 show before &ldquo;...more&rdquo; on Instagram."))}
<div class="rewrite"><h3>Suggested rewrite</h3><textarea rows="4">Stop smoking today! Are you a person with a dependence who is desperate to quit? Our service helps smokers get clean for good. Read more about it &#128073; #quitsmoking</textarea>
<div class="row"><button class="btn btn-ghost">Copy rewrite</button><button class="btn btn-ghost">Download report</button></div></div>`;

const app = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>${css}</style></head><body>
<header class="topbar"><a class="brand" href="#"><span class="mark">C</span> ClearComms</a><div class="spacer"></div>
<span class="chip-pill">AI on · Pro plan</span><span class="who">Diva Creative</span>
<button class="btn btn-ghost">Billing</button><button class="btn btn-ghost">Settings</button><button class="btn btn-ghost">Log out</button></header>
<main class="wrap"><div class="appgrid">
<section class="panel"><h2>Your draft</h2><label>Post text</label>
<textarea rows="9">STOP SMOKING TODAY!!! Are you an addict who is desperate to quit? Our service helps smokers get clean for good. Click here to find out more &#128073;&#128073;&#128073; #quitsmoking</textarea>
<div class="row"><div><label>Platform</label><select><option>Instagram</option></select></div>
<div class="grow"><label>Brand profile</label><select><option>Council main channel</option></select></div>
<button class="btn btn-primary btn-lg">Check post</button><span class="count">168 characters</span></div>
<div class="chips"><span class="lbl">Try an example:</span><button class="chip">Mental health</button><button class="chip">Stop smoking</button><button class="chip">Sexual health</button></div></section>
<section class="panel"><h2>Results</h2><div>${results}</div></section></div>
<div class="appgrid"><section class="panel"><h2>Recent checks</h2><ul class="list">
<li><span class="s" style="color:var(--warn)">64</span><button class="link">Instagram · 18 Jun, 09:41</button><span class="pill">AI</span></li>
<li><span class="s" style="color:var(--good)">88</span><button class="link">LinkedIn · 17 Jun, 16:02</button><span class="pill">AI</span></li></ul></section>
<section class="panel"><h2>Brand profiles</h2><ul class="list"><li><span class="grow">Council main channel · age 11 · 3 banned</span><button class="link">remove</button></li></ul>
<form style="margin-top:10px"><label>Name</label><input placeholder="e.g. Council main channel"><button class="btn btn-ghost" style="margin-top:10px">Add profile</button></form></section></div>
<p class="foot">Assistive only. A human should review before publishing.</p></main></body></html>`;

const setup = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>${css}</style></head>
<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#13171E;margin:0">
<div style="background:#fff;border-radius:16px;padding:26px;max-width:460px;width:92%;box-shadow:var(--shadow-lg)">
<h2 style="margin:0 0 4px;font-size:21px">Connect Claude</h2>
<p class="muted" style="margin:0 0 14px;font-size:14px">Paste your Anthropic API key to switch on AI-powered checks and natural rewrites. It is stored encrypted on your own server and is never shown again. Without it, ClearComms still runs on the built-in rules.</p>
<label>Anthropic API key</label><input type="password" value="sk-ant-xxxxxxxxxxxxxxxxxxxx">
<label>Model</label><select><option>Claude Sonnet 4.6 (recommended)</option></select>
<div class="row" style="margin-top:14px"><button class="btn btn-primary">Save and turn on AI</button><button class="btn btn-ghost">Not now</button></div>
</div></body></html>`;

fs.writeFileSync(path.join(__dirname, "preview-landing.html"), landing);
fs.writeFileSync(path.join(__dirname, "preview-app.html"), app);
fs.writeFileSync(path.join(__dirname, "preview-setup.html"), setup);
console.log("previews written");
