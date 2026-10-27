# 20版直接升级到21.1：Workbench操作手册

适用实际运行版本：20.0.0、20.1.0、20.2.0、20.3.0、21.0.0。无需先逐次部署中间版本。网站完整源码包，数字人模型另在独立推理服务器安装。请先阅读到“验收与回退”，然后逐块执行；某块失败就停止，不要跳过校验。

本次保留原课程数据、账号、成绩、上传资料、密钥、数据卷和 LiveAvatar。新增教师数字人试验台、20条中英双语问题、课程问答桥接、试验记录及CSV导出；未配置数字人时，原网站仍可用。不会自动购买GPU、语音额度或套餐。

## 1. 上传和校验
在Workbench文件管理把同一批 `surveying-ai-teacher-v21.1.zip` 和 `.zip.sha256` 上传到 `/home/admin/`。不要混用旧校验文件，不用 `mv -n` 覆盖不成功后继续执行。

```bash
cd /home/admin
sha256sum -c surveying-ai-teacher-v21.1.zip.sha256
unzip -t surveying-ai-teacher-v21.1.zip
```
必须显示 `OK`，并通过ZIP完整性检查。ZIP大小本身不能判断是否完整。本包不带 node_modules、构建缓存和数字人大模型，因此不应拿它与模型包体积比较。

## 2. 查实际线上版本与目录

```bash
sudo docker exec sxie_ai_teacher-app-1 node -p 'require("./package.json").version'
sudo docker inspect sxie_ai_teacher-app-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
df -h /opt
```
应找到主项目 `sxie_ai_teacher` 的健康 app、postgres 和现有公网入口。若运行版本不是上述范围，停止并核对。预留足够空间容纳数据库、上传目录的完整备份及新旧镜像；不能只按ZIP大小预留。

## 3. 解压到新目录

```bash
sudo python3 - <<'CHECK'
from pathlib import Path
from zipfile import ZipFile
p=Path('/opt/surveying-ai-teacher-step21.1')
assert not p.exists(), '新目录已存在，请核对先前操作，不要覆盖'
with ZipFile('/home/admin/surveying-ai-teacher-v21.1.zip') as z:
    for name in z.namelist():
        path=Path(name)
        assert not path.is_absolute() and '..' not in path.parts
        assert path.parts[0]=='surveying-ai-teacher-step21.1'
    z.extractall('/opt')
CHECK
cd /opt/surveying-ai-teacher-step21.1
sudo bash scripts/v21-1-preflight.sh
```

## 4. 从实际旧目录升级
下面自动读取正在运行容器的工作目录，避免把 `/opt/step20` 等示例名称当成你的实际目录。

```bash
cd /opt/surveying-ai-teacher-step21.1
actual_old_dir="$(sudo docker inspect sxie_ai_teacher-app-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')"
printf '实际旧目录：%s\n' "$actual_old_dir"
sudo bash scripts/v21-1-upgrade.sh "$actual_old_dir"
```
脚本核对旧配置及实际数据卷；先构建镜像，并用独立临时数据库验证迁移。切换前暂停应用，备份数据库和本地上传目录，再启动21.1；校验旧表记录未减少、版本及后台任务。触发错误时尝试恢复旧应用，数据库不会自动倒退。切换期间短暂不可访问属于维护窗口。镜像构建时间由服务器和网络决定。

**不要执行 `docker compose down -v`、删除数据卷、手工把数据库换成新空库、跳过测试门槛，或覆盖旧 `.env`。**

## 5. 验收

```bash
cd /opt/surveying-ai-teacher-step21.1
sudo cat V211_UPGRADE_SUCCESS
sudo bash scripts/v21-1-verify.sh https://localhost
sudo docker exec sxie_ai_teacher-app-1 node -p 'require("./package.json").version'
```
应显示 `21.1.0`、`avatar_trial_schema_version=211`（健康接口中），并保留原知识库数量。没有成功标记说明升级没有完成，请先看日志；不要手工创建成功文件。

浏览器Ctrl+F5后：

- 教师登录后访问 `https://localhost/teacher/avatar-lab`，看到20题、服务说明、空记录表；录入一条实际试验并导出CSV。
- 学生账号和未登录窗口不能进入试验台、不能调用试验记录接口。教师原LiveAvatar入口仍保留。
- 抽查原三班账号、三次作业、正式重交次数、成绩、补练与复测历史、PPT上传及六大学习工作台。
- 检查原3D场景实际渲染。数字人版本不应被当成3D地图已通过现场验收的证明。

## 6. 接通独立LiteAvatar服务
先按同目录《OpenAvatarChat-LiteAvatar-Setup.md》准备推理服务器、HTTPS地址与访问密码。网站服务器只负责课程问答，不在现有教学容器里装大模型。

```bash
cd /opt/surveying-ai-teacher-step21.1
sudo python3 scripts/v21-1-configure-oac.py
sudo docker compose --env-file .env -p sxie_ai_teacher up -d --no-deps --force-recreate app
```
交互输入你的真实数字人服务地址，例如 `https://avatar.你的域名/ui/index.html`。脚本把桥接密钥放在 `backups/oac-bridge-key.txt`；仅私下复制到独立推理服务器的 `trial.env`，不要发送到聊天或公开截图。重新进入教师试验台，新窗口打开LiteAvatar；允许麦克风；先用Q01试运行。网站显示“已配置”不代表GPU、语音、WebRTC已通过实测。

关闭试验：把 `.env` 中 `OAC_ENABLED=0`，同样重建 app；已有试验记录保留，LiveAvatar不受此开关影响。独立GPU服务需要另行停止，避免继续计费。

## 7. 回退

```bash
cd /opt/surveying-ai-teacher-step21.1
backup_dir="$(sudo cat LAST_BACKUP)"
sudo bash scripts/v21-1-rollback.sh "$backup_dir"
```
回退恢复升级前实际镜像及后台任务，保留数据库新增记录。不要删除旧目录、旧镜像、备份。若原版本健康检查未恢复，查看 `sudo docker logs --tail 120 sxie_ai_teacher-app-1`，不要盲目重装。数据库全量恢复属于独立人工恢复操作，不包含在这个应用回退里。
