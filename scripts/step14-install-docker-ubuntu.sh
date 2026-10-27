#!/usr/bin/env bash
set -euo pipefail

[[ "${EUID}" -eq 0 ]] || { echo "请使用sudo运行：sudo ./scripts/step14-install-docker-ubuntu.sh" >&2; exit 77; }
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || { echo "该脚本只支持Ubuntu；当前系统：${ID:-unknown}" >&2; exit 65; }

apt-get update
apt-get install -y ca-certificates curl unzip
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker --version
docker compose version
echo "Docker安装完成。若使用普通用户登录，可按需执行：sudo usermod -aG docker <用户名>，然后重新登录。"

