# Deploy ClearComms to your IONOS VPS

Tailored to your actual setup, read from your IONOS account:

- VPS "My VPS", IP **77.68.29.64**, **AlmaLinux 9**, UK data centre.
- Domain **divacreative.agency** managed at IONOS.
- Target address: **https://clearcomms.divacreative.agency**

This uses Docker and Caddy, so HTTPS is obtained and renewed automatically and there is no nginx or SELinux fiddling. Budget about 15 minutes.

Three steps need you specifically, for security: pointing the DNS, pasting your secrets, and running the deploy. Everything is copy and paste.

---

## Step 1: Point the subdomain at the server (IONOS DNS)

1. IONOS → **Domains & SSL** → **divacreative.agency** → **DNS**.
2. Add a record: Type **A**, Host name **clearcomms**, Points to **77.68.29.64**, TTL 1 hour.
3. Save. DNS usually goes live within a few minutes, sometimes up to an hour.

---

## Step 2: Connect to the server

From your Mac Terminal:

```
ssh root@77.68.29.64
```

Use the root password you set for the VPS (or your SSH key). If you would rather not use Terminal, IONOS Cloud Panel → your server → **Remote Console** gives you a browser terminal.

---

## Step 3: Install Docker (one time)

On the server, paste:

```
dnf -y install dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
firewall-cmd --permanent --add-service=http --add-service=https && firewall-cmd --reload
```

(That is exactly what the bundled `deploy/almalinux-setup.sh` does, if you prefer to run the script.)

---

## Step 4: Put the app on the server

From your Mac, in the folder that has `ClearComms-app.zip`:

```
scp ClearComms-app.zip root@77.68.29.64:/root/
```

Back on the server:

```
dnf -y install unzip
unzip -o /root/ClearComms-app.zip -d /root/
cd /root/clearcomms
```

---

## Step 5: Create the config file (no secrets to edit)

```
cp .env.production.example .env
```

That is all. `DOMAIN`, `APP_URL` and `ACME_EMAIL` are already filled in, and the app generates its own session secret on first run. **You add your Anthropic key inside the app at Step 7**, through a popup, so there is no file to edit and no command line for the key.

(If you would rather set the key on the server instead, run `nano .env`, paste it after `ANTHROPIC_API_KEY=`, and save with `Ctrl+O`, `Enter`, `Ctrl+X`.)

---

## Step 6: Launch

```
docker compose up -d --build
```

The first build takes a few minutes. Once DNS from Step 1 is live, Caddy fetches the HTTPS certificate automatically.

---

## Step 7: Open it and add your key (in the app)

- Open **https://clearcomms.divacreative.agency**.
- Create your account. The first account is the owner.
- A **Connect Claude** popup appears. Paste your Anthropic API key and save. That switches on AI checks and natural rewrites. The key is stored encrypted on your server and never shown again. (You can reopen it any time from the **Settings** button.)
- Run a check. The top bar should read **AI on**.
- Watch the logs if needed: `docker compose logs -f`
- If HTTPS is not ready yet, wait a few minutes for DNS, then `docker compose restart caddy`.

---

## Updating later

Re-upload the zip, unzip over `/root/clearcomms`, then:

```
docker compose up -d --build
```

Accounts and history live in a Docker volume (`ccdata`) and survive updates.

Back up the data any time:

```
docker run --rm -v clearcomms_ccdata:/d -v $PWD:/b alpine tar czf /b/ccdata-backup.tgz -C /d .
```

---

## Notes for your environment

- IONOS blocks outgoing SMTP (port 25). Not needed now; there are no email features yet. You will need an email provider (for example a transactional API) when you add password reset, which is on the list in GOING-LIVE.md.
- To change your API key later: edit `.env`, then `docker compose up -d`.
- **Security:** rotate the Anthropic key you pasted into chat once this is live, since chat copies can linger. Update `.env` with the new key and `docker compose up -d`.
