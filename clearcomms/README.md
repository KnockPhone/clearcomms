# ClearComms

Clear, accessible and inclusive checks for public sector, health and charity communications.

Paste a social post and ClearComms scores it for plain English (reading age), flags non-stigmatising language on sensitive health topics, checks accessibility (hashtags, capitals, emoji, link text, alt-text prompts) and tone, and returns a natural rewrite plus an exportable report. It is multi-tenant, with accounts, brand profiles, saved history and subscription billing.

This is a real, runnable application. It is an early-stage foundation, not a finished live service. See **GOING-LIVE.md** for the honest checklist of what to complete before launching to real users and real public-sector data.

## Features

- Deterministic rules engine for instant structural and accessibility checks (runs with no API key).
- Optional Claude review for nuanced judgement and a fluent rewrite (set an API key).
- Accounts and sessions (secure password hashing, signed session cookies).
- Per-organisation brand profiles: tone, banned words and reading-age target.
- Saved check history and a downloadable HTML audit report.
- Stripe subscription billing with a free monthly allowance and plan gating.
- Security basics: Helmet headers, a content security policy, rate limiting and a same-origin check.

## Quick start

Requires Node 18 or newer (developed on Node 22).

```bash
npm install
cp .env.example .env        # then edit .env
npm start                   # http://localhost:3000
```

The database (SQLite) is created automatically on first boot. To create it explicitly: `npm run init-db`.

The app runs out of the box with no keys: checks use the built-in rules engine and billing is disabled (unlimited). Add keys to unlock the full experience.

### Turn on Claude (natural rewrites and nuanced checks)

In `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6
```

Restart. Checks will now use Claude, with the rules engine as an automatic fallback if a call fails.

### Turn on billing (Stripe)

In `.env`, add your test-mode keys and a subscription Price ID:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

Point a Stripe webhook at `POST /api/billing/webhook`. With the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

## Tests

```bash
npm test
```

Covers the engine (scoring, flags, rewrite behaviour) and the API (signup, auth guard, check, history, brand profiles, logout) against a temporary database.

## Project structure

```
src/
  server.js              Express app and route wiring
  config.js              Environment configuration
  rules/
    ruleLibrary.js       Single source of truth: word banks, thresholds
    engine.js            Deterministic checks, scoring and fallback rewrite
    prompt.js            Builds the Claude system prompt from the library
  services/
    anthropic.js         Claude client wrapper (structured JSON)
    checker.js           Orchestrates engine + Claude and merges results
    report.js            Builds the downloadable HTML report
  db/
    schema.sql, index.js, repo.js, init.js
  auth/auth.js           Password hashing, sessions, middleware
  billing/stripe.js      Checkout, portal, webhook handling
  routes/                auth, api and billing routers
  middleware/security.js Helmet, CSP, rate limits, origin check
  public/                Frontend (index.html, app.html, styles.css, app.js, auth.js)
test/                    Engine and API tests
```

## Tech stack

Node and Express, SQLite via better-sqlite3 (swappable for Postgres), the Anthropic SDK, Stripe, and a dependency-light vanilla-JS frontend.

## A note on responsible use

ClearComms is assistive. It does not replace a human reviewer. Keep a person in the loop before anything is published, especially on sensitive health topics.
