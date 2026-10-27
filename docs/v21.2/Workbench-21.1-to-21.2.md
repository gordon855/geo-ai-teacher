# 在阿里云 Workbench 将21.1升级到21.2

适用网站：https://localhost
新目录：`/opt/surveying-ai-teacher-step21.2`
实际旧版本必须为 **21.1.0**。不要直接解压覆盖旧网站，也不要删除数据库卷。

本包是待服务器构建验收的发布候选：制作环境已通过语音逻辑测试及升级模拟，但因无法下载npm依赖，未执行完整Next.js构建和真实浏览器／云服务联调。下列升级脚本会先构建，构建失败时保持旧网站运行。

## 1. 下载这两个文件

- surveying-ai-teacher-v21.2.zip
- surveying-ai-teacher-v21.2.zip.sha256

先保存到电脑。上一次上传到服务器的是21.1，这次需要上传新的21.2。此前的 Upload.cmd 可能绑定21.1文件名，本流程直接使用Workbench上传，不要求改旧上传工具。

## 2. 打开Workbench，准备上传目录

登录阿里云轻量应用服务器控制台，找到原服务器，打开Workbench远程连接。进入后执行：

```bash
mkdir -p /home/admin/surveying-releases/v21.2
ls -ld /home/admin/surveying-releases/v21.2
```

若以admin登录且提示权限不足，可由root执行创建目录并把目录所有者设为admin：

```bash
sudo mkdir -p /home/admin/surveying-releases/v21.2
sudo chown admin:admin /home/admin/surveying-releases/v21.2
```

用Workbench的文件管理／上传文件入口，进入上述目录，将ZIP和SHA256两个文件上传进去。若你的Workbench界面没有上传入口，可从已能SSH登录的Windows PowerShell使用下面两行；先切换到电脑上保存两个文件的目录：

```powershell
scp .\surveying-ai-teacher-v21.2.zip admin@47.93.118.77:/home/admin/surveying-releases/v21.2/
scp .\surveying-ai-teacher-v21.2.zip.sha256 admin@47.93.118.77:/home/admin/surveying-releases/v21.2/
```

输入的是admin的Linux密码，输入时不显示字符。首次连接仍应核对SSH主机指纹。如果更换网络后SSH超时，重新确认来源IP白名单；已可连接时无需修改。

## 3. 校验文件，并确认线上还是21.1

回到Workbench，逐段执行：

```bash
cd /home/admin/surveying-releases/v21.2
ls -lh surveying-ai-teacher-v21.2.zip surveying-ai-teacher-v21.2.zip.sha256
sha256sum -c surveying-ai-teacher-v21.2.zip.sha256
```

应出现 `surveying-ai-teacher-v21.2.zip: OK`。没有OK就停止，不继续解压。

```bash
sudo docker exec sxie_ai_teacher-app-1 node -p 'require("./package.json").version'
sudo docker inspect sxie_ai_teacher-app-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
df -h /opt
```

版本必须显示 `21.1.0`，记录第二条输出的实际运行目录。若版本不是21.1.0，或容器不存在，停止并核对；本升级脚本不会绕过版本检查。构建镜像和备份都需要可用磁盘空间，若磁盘已接近满，不要开始升级。

## 4. 安全解压到全新目录

整段复制到Workbench。它会检查ZIP校验和、文件路径和解压目标；目标已存在时拒绝覆盖。

```bash
sudo python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile
import hashlib, stat
base = Path('/home/admin/surveying-releases/v21.2')
archive = base / 'surveying-ai-teacher-v21.2.zip'
expected = (base / 'surveying-ai-teacher-v21.2.zip.sha256').read_text().split()[0]
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected, 'SHA256不匹配，停止'
target = Path('/opt/surveying-ai-teacher-step21.2')
assert not target.exists(), '21.2目录已存在，停止；请先检查是否已解压或升级，不能直接覆盖'
with ZipFile(archive) as z:
    assert z.testzip() is None, 'ZIP完整性检查失败'
    for item in z.infolist():
        p = Path(item.filename)
        assert not p.is_absolute() and '..' not in p.parts and '\\' not in item.filename
        assert p.parts and p.parts[0] == 'surveying-ai-teacher-step21.2'
        assert not stat.S_ISLNK(item.external_attr >> 16), '不接受符号链接'
    z.extractall('/opt')
print('解压完成：', target)
PY
```

若目录已存在，不要删除后盲目重试；先查看目录中的 `V212_UPGRADE_SUCCESS` 和 `LAST_BACKUP`，判断之前进行了哪一步。

## 5. 预检查

```bash
cd /opt/surveying-ai-teacher-step21.2
sudo bash scripts/v21-2-preflight.sh
```

应显示 `actual_version=21.1.0` 以及“线上基础版本核验通过”。预检查失败时保留输出，不执行下一步。

## 6. 执行升级

整段执行：

```bash
cd /opt/surveying-ai-teacher-step21.2
actual_old_dir="$(sudo docker inspect sxie_ai_teacher-app-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')"
printf '实际旧目录：%s\n' "$actual_old_dir"
sudo bash scripts/v21-2-upgrade.sh "$actual_old_dir"
```

等待出现“升级完成”和“备份目录”，不要重复点击或在构建时重复执行。

脚本依次执行：检查实际运行配置和原数据卷 → 保留旧镜像和配置 → 构建21.2 → 运行语音队列测试 → 在独立临时数据库做检查 → 暂停旧应用 → 备份课程数据库及本地上传文件 → 启动21.2 → 健康检查和数据条数检查 → 写入成功标记。

构建及前置检查期间旧站继续运行。备份和切换阶段网站会短暂不可用。构建失败不切换；切换后失败会尝试恢复旧应用，并给出备份路径。

## 7. 检查升级结果

```bash
cd /opt/surveying-ai-teacher-step21.2
sudo cat V212_UPGRADE_SUCCESS
sudo bash scripts/v21-2-verify.sh https://localhost
sudo docker exec sxie_ai_teacher-app-1 node -p 'require("./package.json").version'
```

最后必须显示 `21.2.0`。成功标记只是升级脚本的检查结果，还应完成以下实际验收。

浏览器按 Ctrl+F5 强制刷新。登录后访问：
- 问答页：https://localhost/
- 数字教师页：https://localhost/digital-teacher

逐项检查：
1. 教师登录、三个班级、学生名单、原成绩和作业正常。
2. 输入“解释水准测量的基本原理”，文字逐步显示；语音就绪后开始分句播报，字幕显示当前朗读句。核对教材来源仍显示。
3. 播放中点“停止朗读”，旧回答不继续播放；再次提问不串音。若浏览器阻止自动播放，点击答案的朗读按钮。
4. 点“智能语音提问”，允许麦克风。说完停顿后，提问文字显示并发送；录音识别阶段可点取消。
5. 点“开启连续对话”：说一句问题，等教师回答，播报结束后自动重新聆听；点“结束连续对话”停止。无声超时或服务错误会结束连续模式。当前不支持边播报边用声音打断，使用停止按钮。
6. 女教师舞台有口型变化，并可放大／收起。这里是内置2.5D动画，不是LiteAvatar视频服务。
7. 页面动效切到展示、日常、专注，检查动画强弱变化及手机页面可用性。
8. 检查知识库上传、PPT、三维地图等原功能。

如果文字正常但没有声音，先看页面明确报错，再检查原有TTS配置与额度、浏览器播放权限、系统音量。此版本没有自动开通或更换语音服务。

## 8. 出错时如何处理

先查看应用日志：

```bash
sudo docker logs --tail 120 sxie_ai_teacher-app-1
```

不要把.env、密钥或包含凭证的日志发到聊天。可以提供错误文字、最后几十行不含凭证的构建输出及当前版本号。

若升级脚本自动回退成功，网站仍是21.1。若你已升级成功但需要退回旧应用，可先核对备份路径，再执行：

```bash
cd /opt/surveying-ai-teacher-step21.2
backup_dir="$(sudo cat LAST_BACKUP)"
printf '准备使用的备份目录：%s\n' "$backup_dir"
sudo bash scripts/v21-2-rollback.sh "$backup_dir"
sudo docker exec sxie_ai_teacher-app-1 node -p 'require("./package.json").version'
```

回退脚本恢复旧应用镜像与相关任务配置，不覆盖数据库，因此保留升级后新增记录。回退后目录中的旧成功标记只代表历史升级成功，以实际容器版本和健康检查为准。需要再次升级时先核对失败／回退状态，不手工伪造成功标记。

不要执行 `docker compose down -v`，不要清空数据卷，不要直接把ZIP覆盖到21.1目录，不要删除旧目录、备份和旧镜像。
