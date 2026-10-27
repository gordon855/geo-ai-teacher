#!/usr/bin/env bash
set -Eeuo pipefail
cd "$HOME/OpenAvatarChat"
[[ -f start_teacher_tunnel.sh ]] || { echo '找不到原SSH隧道脚本，请核对之前的接入安装。';exit 1; }
echo '正在启动原SSH隧道；无报错且不返回提示符通常表示连接保持中。请保留窗口。'
exec bash ./start_teacher_tunnel.sh
