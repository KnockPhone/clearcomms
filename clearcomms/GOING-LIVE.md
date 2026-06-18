# Going live: the honest checklist

This app is a genuine, working foundation. It is not yet a service you should put public-sector data through. "Production ready" is a destination, and this is the start of the road. Here is what stands between here and a safe public launch, roughly in priority order.

## 1. Hosting and HTTPS

- Deploy to a managed host (Render, Railway, Fly.io or a VPS). Node 18+.
- Serve over HTTPS only. Session cookies are marked Secure when `NODE_ENV=production`, so they will not work over plain HTTP.
- Set `APP_URL` to your real https domain and set `NODE_ENV=production`. The app already trusts one proxy hop in production.
- Set a strong `SESSION_SECRET` (for example `openssl rand -hex 32`). Never commit `.env`.

## 2. Database

- SQLite (the default) is fine for a single instance and early customers. For scale or multiple instances, move to managed Postgres. The data layer is isolated in `src/db/repo.js`, so this is a contained change.
- Back up the database regularly and test a restore.

## 3. Claude (Anthropic)

- Add `ANTHROPIC_API_KEY` and choose a model. Sonnet is a good balance; Haiku is cheaper for high volume.
- Set spend limits in the Anthropic console and monitor cost per check.
- Confirm Anthropic's data-handling terms for the API, including any zero-retention options, and reflect them in your privacy notice.

## 4. Stripe billing

- Create your product and a recurring Price (test mode first, then live).
- Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET`.
- Register the webhook at `POST /api/billing/webhook` and test it with the Stripe CLI.
- Decide on trials, proration and cancellation behaviour. The customer portal is already wired up.

## 5. Data protection (this matters most for your buyers)

You will handle communications content for public bodies, so procurement will ask about all of this.

- Complete a Data Protection Impact Assessment (DPIA).
- Publish a privacy notice and offer customers a Data Processing Agreement.
- Document where data is stored and processed, and keep it in a UK or EU region.
- Set a data-retention policy and build deletion and export on request (see gaps below).
- Keep a register of subprocessors (your host, Anthropic, Stripe).

## 6. Security hardening

Already in place: password hashing (scrypt), signed httpOnly session cookies, Helmet headers, a content security policy, rate limiting and a same-origin check.

Still to add before launch:

- Email verification and password reset.
- Brute-force and account-lockout protection beyond basic rate limiting.
- Optional two-factor authentication.
- Dependency and secret scanning in CI, plus a third-party penetration test.
- Centralised logging, error monitoring (for example Sentry) and alerting.

## 7. Practise what you sell: accessibility

You are selling accessibility, so the app itself must pass. The frontend is built with labels, focus styles, skip links and live regions, but commission a full WCAG 2.1 AA audit covering keyboard use, screen readers, contrast and focus order, and publish an accessibility statement.

## 8. Legal and trust pages

- Terms of service, privacy policy and an accessibility statement.
- The session cookie is strictly necessary, so a consent banner is likely not required, but confirm for your jurisdiction.

## What is deliberately not built yet

Being straight with you, these are the obvious next build items, none of them large:

- Email verification, password reset and team invitations (only the first user per organisation exists today).
- Self-service data export and account deletion endpoints.
- A Postgres adapter for scale.
- An admin view and basic usage analytics.
- Automated CI running the test suite on every change.

Tackling sections 1, 5 and 6 first will get you to a safe pilot with friendly customers. The rest can follow as you grow.
