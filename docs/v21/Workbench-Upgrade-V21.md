# 第21版：从线上20.3直接升级（Workbench）

适用于目前实际运行版本为20.3.0、Compose项目为sxie_ai_teacher的既有网站。升级脚本会从容器标签核对真实目录，保留原数据库、上传文件卷、账号、AI配置和正式成绩；不需要先安装20.1或20.2。

## 1. 上传同一批次的两个文件

在阿里云Workbench选择 **Shell**。把 `surveying-ai-teacher-v21.zip` 和 `surveying-ai-teacher-v21.zip.sha256` 都上传到 `/home/admin`。不要沿用旧校验文件，不要以下载大小判断文件完整性。

逐块执行下面命令。只复制代码，不复制终端前面的用户名或 `$`。

```bash
cd /home/admin
ls -lh surveying-ai-teacher-v21.zip surveying-ai-teacher-v21.zip.sha256
sha256sum -c surveying-ai-teacher-v21.zip.sha256
```

必须显示 `surveying-ai-teacher-v21.zip: OK`。如果出现FAILED，重新下载本次两个文件并覆盖上传到同一个目录，再校验。不能重新生成校验码掩盖不一致。

## 2. 查看实际运行版本和目录

```bash
sudo docker exec sxie_ai_teacher-app-1 node -p 'require("./package.json").version'
sudo docker inspect sxie_ai_teacher-app-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

第一条应为20.3.0；第二条才是实际旧目录，不要凭目录名猜测。如果实际版本不同，本脚本会在停服务前停止，不会强行继续。此前误建的其他Compose项目不要用 `down -v` 清理。

## 3. 解压到新的独立目录

```bash
sudo python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile
archive=Path('/home/admin/surveying-ai-teacher-v21.zip')
target=Path('/opt/surveying-ai-teacher-step21')
if target.exists():
    raise SystemExit('第21版目录已经存在：请先检查其中的UPGRADE_SUCCESS和LAST_BACKUP，不要覆盖运行中的目录。')
with ZipFile(archive) as z:
    assert z.testzip() is None, 'ZIP损坏'
    for item in z.infolist():
        p=Path(item.filename)
        assert not p.is_absolute() and '..' not in p.parts and p.parts[0]=='surveying-ai-teacher-step21', '压缩包目录不合法'
    z.extractall('/opt')
print('已解压到', target)
PY
```

如果第21版目录是之前失败升级留下的，请先读取其中 `LAST_BACKUP`、确认实际容器仍指向旧目录，再将该失败目录改名保存；不要删除备份。文件解压后，即使目录由root持有也可正常部署，后续统一使用sudo执行脚本。

## 4. 执行预检与升级

```bash
sudo bash /opt/surveying-ai-teacher-step21/scripts/v21-preflight.sh
```

预检通过后，执行下面整块。它自动读取真实线上目录并传给升级脚本。

```bash
sudo bash <<'BASH'
set -Eeuo pipefail
release_old_dir="$(docker inspect sxie_ai_teacher-app-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')"
[[ -d "$release_old_dir" ]] || { echo '未找到实际旧目录'; exit 1; }
bash /opt/surveying-ai-teacher-step21/scripts/v21-upgrade.sh "$release_old_dir"
BASH
```

脚本依次完成：

1. 核对线上20.3.0、Compose项目、数据库地址、加密密钥和实际数据卷。
2. 保存原配置及原镜像标签，构建21版镜像，此时旧站继续运行。
3. 在独立临时数据库执行19到21版的迁移与功能检查。
4. 暂停旧app，备份数据库及上传文件，再启动新app。
5. 检查版本、813条内置知识块、旧表记录数，更新已有Nginx及后台任务入口。
6. 成功后写入 `UPGRADE_SUCCESS`；切换中失败则尝试恢复原镜像，并保留增量数据库。

构建可能需要数分钟。不要并行运行第二次升级，也不要把构建日志通过 `tail` 管道后把管道退出码当成构建结果。刚启动时短暂curl连接重置会被脚本重试；持续失败则看备份记录和容器日志。

## 5. 核验线上结果

```bash
sudo cat /opt/surveying-ai-teacher-step21/UPGRADE_SUCCESS
sudo bash /opt/surveying-ai-teacher-step21/scripts/v21-verify.sh https://localhost
sudo docker exec sxie_ai_teacher-app-1 node -p 'require("./package.json").version'
```

应显示21.0.0以及工作台schema21。地图静态模块检查通过，只说明文件可获取，不代表实际地图或外部瓦片已经渲染成功。

随后用浏览器Ctrl+Shift+R刷新，并分别登录教师和学生验收：

- 学生首页进入专业词汇，检索reliability、收藏并自测；切换Unit后只显示对应内容。
- 教材原文切换真实PPT／教材，检查课件第19页等实际页码。
- 选择重点句，生成翻译对照、原理说明；AI服务不可用时输入和上一结果应保留。
- 智能问答输入Precision与Accuracy问题，完整回答后不能被“格式无法识别”覆盖。
- 章节测试进入现有20题模块，核对三次作业、一次重交及10/20/20/50权重。
- 教师选择三个班之一，进入“六大学习工作台”；不同班学习记录分别显示。
- 教师在“情境任务与证据”核验真实依据后发布一个试点，学生提交后查看AI初评和教师复核。
- 教师逐维度引用学生原话复核；学生看到反馈；该试点不改变课程正式总评。
- 切换华丽／轻动／静态，检查页面背景、等高线与卡片动效；静态模式停止装饰动画。
- 核对旧PPT、上传资料、历史成绩、3D和数字教师原有功能。数字人订阅到期需另行处理，此包不购买或替换服务。

后台延迟复测和情境任务恢复检查继续共用既有每分钟调度。查看：

```bash
sudo cat /etc/cron.d/surveying-v203-sxie_ai_teacher
sudo tail -n 60 /opt/surveying-ai-teacher-step21/backups/obe-stage2.log
sudo docker logs --since 10m sxie_ai_teacher-app-1
```

## 6. 需要回退时

执行以下整块，使用此次升级留下的完整备份目录：

```bash
sudo bash <<'BASH'
set -Eeuo pipefail
release_backup="$(cat /opt/surveying-ai-teacher-step21/LAST_BACKUP)"
bash /opt/surveying-ai-teacher-step21/scripts/v21-rollback.sh "$release_backup"
BASH
```

这是应用镜像和调度配置回退，不会自动把数据库恢复到旧备份，避免删除升级后的学生作答。新表仍保留。不要执行 `docker compose down -v`、`docker volume prune` 或直接覆盖数据库。保留原目录、旧镜像和备份，直至完成教学验收。

## 7. 若已经在本目录升级成功

先看 `UPGRADE_SUCCESS` 和当前容器版本。脚本拒绝重复升级是为了避免重复备份和误切换。版本已为21.0.0时只需执行第5步；版本与标记矛盾时，保留输出诊断，不要手动创建成功标记。
