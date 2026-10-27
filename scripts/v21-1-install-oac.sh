#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
target="${1:-$PWD/OpenAvatarChat-surveying}"
for c in git uv npm nvidia-smi;do command -v "$c" >/dev/null || { echo "缺少 $c；请先阅读独立服务安装说明。";exit 1; };done
git lfs version >/dev/null
[[ ! -e "$target" ]] || { echo '目标目录已存在，停止以免覆盖。';exit 1; }
target="$(realpath -m "$target")"
git clone --no-checkout https://github.com/HumanAIGC-Engineering/OpenAvatarChat.git "$target"
cd "$target"
git checkout 8b7b3b45bca28ae9ab5fa72ee31bc03c5a99b08b
git lfs install --local
git submodule update --init --recursive --depth 1
uv run install.py --config config/chat_with_openai_compatible_bailian_cosyvoice.yaml
uv run scripts/download_models.py --config config/chat_with_openai_compatible_bailian_cosyvoice.yaml --source modelscope
cd src/service/frontend_service/frontend
if [[ -f pnpm-lock.yaml ]];then
 command -v corepack >/dev/null
 corepack pnpm install --frozen-lockfile
 corepack pnpm run build
elif [[ -f package-lock.json ]];then npm ci; npm run build
else npm install; npm run build
fi
cd "$target"
cp "$source_root/deploy/openavatarchat/configure.py" configure-surveying.py
cp "$source_root/deploy/openavatarchat/trial.env.example" trial.env
chmod 600 trial.env
echo '依赖和模型准备完成。请填写 trial.env，再按安装说明生成配置和启动；此脚本尚未启动付费服务。'
