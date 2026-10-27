#!/usr/bin/env bash
# Run in Ubuntu, as the existing OpenAvatarChat user (not sudo).
set -Eeuo pipefail
mode="${1:-public}"
case "$mode" in
  public) config=config/local_liteavatar_public.yaml ;;
  classroom) config=config/local_liteavatar_classroom213.yaml ;;
  *) echo '用法：bash start-service.sh public 或 bash start-service.sh classroom'; exit 2 ;;
esac
cd "$HOME/OpenAvatarChat"
[[ -f .venv/bin/activate && -f "$config" ]] || { echo "找不到虚拟环境或配置：$config。课堂模式需先执行扩展包的install.py。";exit 1; }
if curl --max-time 3 -s -o /dev/null http://127.0.0.1:8282/; then
  echo '8282端口已有HTTP服务响应。请先使用当前服务；如需切换模式，在原运行窗口按Ctrl+C停止后再运行。'
  exit 0
fi
source .venv/bin/activate
if [[ -z "${DASHSCOPE_API_KEY:-}" ]]; then
  read -rsp '请输入百炼API Key（输入不显示）：' DASHSCOPE_API_KEY
  printf '\n'
fi
[[ -n "${DASHSCOPE_API_KEY:-}" ]] || { echo '未输入密钥，未启动。';exit 1; }
export DASHSCOPE_API_KEY
printf '启动%s模式；保持此窗口运行，结束时按Ctrl+C。\n' "$mode"
exec python src/demo.py --config "$config"
