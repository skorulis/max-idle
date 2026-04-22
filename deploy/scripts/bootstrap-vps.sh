#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/scripts/bootstrap-vps.sh"
  exit 1
fi

APP_USER="${SUDO_USER:-}"
if [[ -z "${APP_USER}" ]]; then
  APP_USER="$(logname 2>/dev/null || true)"
fi

if [[ -z "${APP_USER}" ]]; then
  echo "Could not determine non-root user. Set APP_USER manually in script."
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release ufw

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi
chmod a+r /etc/apt/keyrings/docker.gpg

ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable
EOF

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

usermod -aG docker "${APP_USER}"

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p /opt/maxidle/deploy
chown -R "${APP_USER}:${APP_USER}" /opt/maxidle

echo "Bootstrap complete."
echo "Next:"
echo "1) Re-login so docker group applies to ${APP_USER}"
echo "2) Copy deploy files to /opt/maxidle/deploy"
echo "3) Create /opt/maxidle/deploy/.env.production from .env.production.example"
