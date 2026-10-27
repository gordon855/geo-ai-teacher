#!/usr/bin/env bash
set -uo pipefail
printf '本机数字人HTTP检查：\n'
curl --max-time 8 -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8282/ || true
printf '\n相关进程（不输出密钥或配置文件内容）：\n'
ps -eo pid,comm | awk 'NR==1 || $2 == "python" || $2 == "python3" || $2 == "ssh"'
printf '\n200/302/307只说明网页服务有响应。还需在教师页面测试人物、声音与口型。\n'
