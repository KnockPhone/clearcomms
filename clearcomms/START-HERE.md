# ClearComms — start here

This is your live-ready app, redesigned, with Claude wired in and a deployment kit tailored to your IONOS server.

## What I did while you were out

- **Redesigned the whole interface.** Bold new theme: warm paper background, a coral brand accent, a dark hero, a proper score dial and cleaner result cards. (Open `preview-app.html` to see it without running anything.)
- **Wired up Claude with an in-app setup popup.** On first use, the owner pastes the Anthropic key into a popup inside the app (stored encrypted on your server), so there is no config file or command line for the key. The rules engine is the automatic fallback.
- **Built a deploy kit for your exact setup** (IONOS VPS, AlmaLinux 9, 77.68.29.64): Docker + Caddy, so HTTPS is automatic. No nginx or SELinux wrangling.
- **Re-ran the tests** (15 passing) and confirmed the redesigned app serves and works end to end.

## To go live (about 15 minutes)

1. **Point the DNS:** add an A record `clearcomms` → `77.68.29.64` in IONOS.
2. **Get it running:** copy the app to your server and run `docker compose up -d --build`. No config files or secrets to edit; the app generates its own.
3. **Open the site and paste your Anthropic key into the first-run popup.** That is the only secret, it goes in through the app (encrypted), not a file or the command line.

Full copy-and-paste steps are in **DEPLOY-IONOS.md**. The one part that still needs a server is getting Docker running on the VPS; if you can't use the command line at all, tell me and we'll find the simplest way through it together.

## The files

- `DEPLOY-IONOS.md` — the step-by-step go-live guide for your VPS.
- `README.md` — how the app works and how to run it locally.
- `GOING-LIVE.md` — the broader production checklist (security, data protection, the features still to build).
- `preview-app.html`, `preview-landing.html` — the new look, openable in any browser.

## One security note

Please regenerate the Anthropic API key you pasted into chat once the app is running, since copies in chat can linger. Swap the new key into the server's `.env` and run `docker compose up -d`.
