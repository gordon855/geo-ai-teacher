# 独立 OpenAvatarChat + LiteAvatar 试验服务

## 已完成与未完成
网站端21.1已包含教师入口、课程问答桥接、固定答案、记录及导出。这里提供固定上游提交的安装和配置脚本。未在你的GPU、国内校园网或付费账号运行：真实口型、语音打断、并发与费用都需试验，不能当作已验收。

选择独立NVIDIA GPU Linux服务器，先单会话试验；官方快速开始要求驱动支持CUDA 12.8以上。8GB显存、16GB内存可作为询价起点，并非本项目实测最低配置。先用官方样例形象验证，再谈同一教师定制。LiteAvatar单独CPU推理能力不等于完整OpenAvatarChat链路在你的轻量服务器上能稳定运行。

准备：有权限的人像、GPU服务器、可解析到该服务器的独立子域名及有效HTTPS证书、百炼CosyVoice服务及额度、Node.js22与Corepack、Python/uv、git-lfs、FFmpeg。校园网跨NAT时可能还需要带认证的TURN服务。按量机器用完停止；本脚本不会自动购买。

## 1. 在推理服务器准备源码
把本21.1ZIP解压到推理服务器，例如 `/home/admin/surveying-ai-teacher-step21.1`。下面命令在**推理服务器**执行，不是现有教学容器。

```bash
sudo apt-get update
sudo apt-get install -y git git-lfs ffmpeg build-essential python3-venv libgl1 libglib2.0-0 nginx apache2-utils
python3 -m venv "$HOME/oac-tools"
"$HOME/oac-tools/bin/pip" install uv
export PATH="$HOME/oac-tools/bin:$PATH"
node --version
corepack --version
nvidia-smi
bash /home/admin/surveying-ai-teacher-step21.1/scripts/v21-1-install-oac.sh /home/admin/OpenAvatarChat-surveying
```
缺少Node22或Corepack时先按对应官方安装方式补齐，不要忽略失败。固定OpenAvatarChat提交：`8b7b3b45bca28ae9ab5fa72ee31bc03c5a99b08b`。脚本安装后端、拉取子模块和模型、构建独立前端。下载模型可能较大；GitHub/ModelScope任一不可达会停止，保留日志后解决网络，不要强行往下运行。

## 2. 配置课程桥接与语音
在网站先运行Workbench说明第6步生成桥接密钥。然后推理服务器执行：

```bash
cd /home/admin/OpenAvatarChat-surveying
chmod 600 trial.env
nano trial.env
```

- `COURSE_ORIGIN=https://localhost`。
- `OAC_BRIDGE_KEY`：网站生成的私有桥接密钥，不是百炼密钥。
- `DASHSCOPE_API_KEY`：有CosyVoice权限的百炼密钥。语音费用由此账号产生；网站课程大模型仍用原网站配置。
- `LITEAVATAR_NAME=20250408/sample_data`：先用官方样例，不把原教师图片路径直接填进这里。
- `OAC_VOICE`、`OAC_TTS_MODEL`：默认longxiaochun/cosyvoice-v1；中英发音是否满足课程要求须用20题听测。
- `TURN_URLS`、`TURN_USERNAME`、`TURN_PASSWORD`：需要时填真实认证TURN服务。空值不能保证国内各网络都能连通。

```bash
set -a
. ./trial.env
set +a
uv run --with pyyaml python configure-surveying.py
uv run src/demo.py --config config/surveying-v211.yaml
```
保持该终端运行，Ctrl+C停止。先单会话、不自动开机自启。生成的YAML含私钥，权限600；不要上传仓库。配置把后端绑定127.0.0.1:8282，仅通过HTTPS反向代理访问；单会话最长300秒、25fps。

适配器把上游LLM请求超时从5秒改为60秒，初始化取消标记以覆盖请求异常。网站桥接发送保活并设55秒回答超时。网络、知识检索、ASR、TTS仍会影响实际首声，不保证固定时延。

## 3. HTTPS、访问限制与WebRTC
复制 `deploy/openavatarchat/nginx-avatar.conf.example` 到推理机Nginx站点配置，替换独立域名与真实证书路径。不要覆盖教学服务器的Nginx配置。

```bash
sudo htpasswd -c /etc/nginx/avatar-trial.htpasswd trialteacher
sudo nginx -t
sudo systemctl reload nginx
```
只首次创建密码文件用 `-c`；已有账号文件时去掉 `-c`。只在 `nginx -t` 成功后reload。云防火墙开放该服务HTTPS443；TURN端口及媒体中继范围按你实际TURN部署设置，不凭示例盲目开放所有UDP端口。

访问 `https://你的数字人域名/ui/index.html`，输入试验访问密码，允许麦克风。网站使用新窗口，避免iframe与麦克风权限限制。页面能打开但无音视频时，检查浏览器WebRTC连接状态/ICE，服务器输出、TURN凭证和防火墙。HTTP200不能证明RTC成功。

## 4. 两轮验收

A. 固定答案：教师试验台复制 `[[BENCH:Q01:zh]]` 到数字人文本输入，桥接返回同一参考答案；确认能听到并看见同步说话。对LiveAvatar/LAM也使用同一参考文本，可用各自文字/音频驱动入口；不支持时记录条件不一致。

B. 课程问答：实际说“Precision和Accuracy有什么区别”，确认ASR文本正确、课程回答完整、教材实际页码正常、不朗读内部P1/P2来源编号。用按钮打断，再单独测试语音打断：若所选上游配置未启用双工，不可把按钮成功记作语音打断成功。当前提供的标准配置首先验收手动打断；语音打断结果如实记为未测或不支持，后续按上游双工配置单独试验。

最后从国内校园网和手机热点各测一轮。服务断开时，教学网站问答仍应工作。测试记录只在教师主动保存后进入网站；不伪装成跨窗口自动测量。

## 5. 形象与许可证
OpenAvatarChat是编排服务，LiteAvatar需要对应头像数据包。普通照片、GLB、LAM资产和LiveAvatarID不能直接替换。LAM可以基于照片走自身重建流程，但不是这次自动安装的组件。先用默认样例预览，后续同一授权人物分别准备三个平台资产，并记录分辨率、裁切、光照与声音差异。

本发行包不打包开源模型权重和第三方人物资产。使用前核对上游代码、权重、声音和肖像各自许可证与授权。

官方参考（核对日期2026-09-23）：
- https://github.com/HumanAIGC-Engineering/OpenAvatarChat
- https://humanaigc-engineering.github.io/OpenAvatarChat/getting-started/
- https://github.com/HumanAIGC/lite-avatar
- https://github.com/aigc3d/LAM
