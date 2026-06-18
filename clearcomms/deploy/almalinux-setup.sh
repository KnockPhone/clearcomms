#!/usr/bin/env bash
# One-time setup for an IONOS AlmaLinux 9 VPS: installs Docker and opens the
# web ports. Run as root:  bash almalinux-setup.sh
set -euo pipefail

echo "==> Installing Docker on AlmaLinux 9"
dnf -y install dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

echo "==> Opening firewall ports 80 and 443"
if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
else
  echo "firewalld not active; skipping (check your IONOS firewall policy allows 80/443)."
fi

echo "==> Done."
docker --version
docker compose version
echo "Next: create your .env file, then run: docker compose up -d --build"
