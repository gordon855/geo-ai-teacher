# 后续完整操作步骤（2026-10-27）

此文替代旧截图中的操作顺序。代码修复与本机 Docker 验收已有结果，不需要
重建项目或重新生成 .env。最后复查已重新运行安装、类型检查、Lint、87 项测试、
构建和两种依赖审计；具体范围与剩余事项见 FINAL-PREPUBLICATION-20261027.zh-CN.md。
没有执行 Git 初始化、提交、远程上传、公开仓库、发布 Release 或提交申请。

## 1. 查看现有实例，不重置数据

在 PowerShell 中：

```powershell
Set-Location 'D:\GeoAI-Teacher-OSS\geo-ai-teacher'
docker compose config --quiet
docker compose ps
```

若旧终端找不到 Docker，先重新打开终端；本机还可在当前进程使用：

```powershell
$dockerBin='C:\Program Files\Docker\Docker\resources\bin'
if (Test-Path (Join-Path $dockerBin 'docker.exe')) {
  $env:PATH=$dockerBin+';'+$env:PATH
}
docker compose ps
```

本次复查 app/postgres 均为 healthy。若之后主动停止了服务，执行
`docker compose up --wait --wait-timeout 180` 恢复。
访问 http://localhost:3000/teacher/login 和 /student/login。
教师 demo_teacher、学生 demo_student_1 已改密，新密码只在本地
.audit/browser-credentials.env；学生 2/3 的初始密码仍在 .env。
可用本地编辑器查看，勿截图或粘贴到公开说明。

停止使用 `docker compose stop`。不要重新运行 demo:setup、删除卷、修改项目名，
也不要对当前有课件的数据实例重复 seed。截图中的 .env.demo 和
docker-compose.demo.yml 不适用于当前副本。

## 2. 权属声明与项目许可已确认

2026-10-27 更新：你已确认本人 AI 辅助开发、个人独立项目无相关权利约定，
署名郭沛高（2026），并批准自有内容采用 Apache-2.0。LICENSE、NOTICE 和
两个包配置的根许可字段已同步。RIGHTS-CONFIRMATION.md 记录声明和适用范围。
第三方通知见 THIRD-PARTY-NOTICES.md，原文见 licenses/third-party/，来源和
哈希见 docs/THIRD-PARTY-NOTICE-FILES.json，不被项目 Apache-2.0 覆盖替换。

你说明部分自制 PPT 含书籍图片。这不构成书籍图片的再分发授权。两份公开测试
PPT 已复核只有简短文字、无图片或外部资源；192 份私有原件继续排除，不恢复。
favicon 已另行确认本人自行或 AI 辅助制作，第三方默认 SVG 保留原许可。

你已确认不存在原 Git 历史，原来就是文件副本。历史扫描记为“不适用”，
不补造历史或写成扫描通过。以后如引入其他仓库历史，先另行审计。
许可定稿不等于批准上传或公开；后续命令仍为手动操作说明，本轮没有执行。

## 3. 按已确认首发范围做教学试用

首发提供源码、Docker 构建/Compose 配置和合规演示资源。用户可自行构建；
不上传模型、node_modules、.next、成品镜像或预制启动 ZIP。源码内现有
MapLibre vendor 文件仍保留完整第三方通知。以后扩大发行范围需重新审查。

当前发行名称仍为 GeoAI Teacher 21.7，package 21.7.0。
全部已有功能保留；未实现的笔记/浏览历史/教师批量密码重置等只列为计划，
不标为 21.8 已实现。对照 VERSION-MAPPING.md 与 ISSUES-DRAFT.md。

按 TEACHING-CASE.md 用教师、学生两个浏览器配置文件进行原创 PPT 演示。
扩展试用作业、章节测试、名单导入、多班级和复杂课件；每一项记录实际结果。
模型服务未配置时，不宣称已验证生成式翻译。
GPU/数字人/语音可明确列为未验收的可选能力，不得宣传为完整即开即用。
若将完整教学或数字人流程作为首发承诺，就先完成对应实测再发布。

## 4. 最终修改后重新检查

2026-10-27 最后复查已重跑下列源码检查。若源码、依赖或配置再发生变更，
按下面命令检查，每条成功再执行下一条；不要因旧报告通过就跳过新的失败：

```powershell
npm ci
npm run typecheck
npm run lint
npm run test
$env:SKIP_MAINLAND_RUNTIME='1'
$env:NEXT_TELEMETRY_DISABLED='1'
npm run build
Remove-Item Env:SKIP_MAINLAND_RUNTIME
npm audit --omit=dev
npm audit
node scripts/audit-release.mjs
```

本轮基线为 87 项测试通过、lint 无警告、构建通过、全量审计 0 已知漏洞。
依赖审计结果随注册表改变，不能保证未来永远为零。不要使用强制修复或关闭检查
掩盖新问题。截图中的 Docker 重启流程已实测；源码若再影响部署，应重测。

审阅 docs/RELEASE-FILES.json、SECURITY-SCAN.json 和实际待提交文件。
扫描是辅助检查，不替代人工隐私/版权审查。

## 5. 在 GitHub 网页创建私有空仓库（用户执行）

先登录正确的 GitHub 账号并检查目标仓库是否已存在。本轮没有查询或修改远程仓库。
若不存在，在 GitHub 的 New repository 页面设置：

- Owner：gordon855
- Repository name：geo-ai-teacher
- Description：Self-hosted AI-assisted teaching for surveying and geospatial English.
- Visibility：Private
- 不初始化 README、.gitignore 或 LICENSE，使用已审阅的本地文件。

若仓库已经存在且有提交，不要重新初始化覆盖；先核对其分支和历史。
本机未识别 gh 命令，网页流程不依赖 GitHub CLI。

参考：[导入现有源码](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)。

## 6. 初始化、审查并提交本地源码（前述确认完成后执行）

只有确认没有需要先保留/审计的原仓库历史，且根目录仍无 .git 时执行：

```powershell
Set-Location 'D:\GeoAI-Teacher-OSS\geo-ai-teacher'
git init -b main
git config --local user.name '郭沛高'
git config --local user.email '你在 GitHub 设置中确认的邮箱'
```

先替换邮箱占位文字；可使用 GitHub 提供的 noreply 邮箱，不需要公开私人邮箱。
这些命令只设置当前仓库身份，不修改全局配置。

```powershell
git add .
git status --short
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
git ls-files .env .private-originals .audit .playwright-cli output .data node_modules .next
git ls-files backups
git ls-files '*.env*' '*.key' '*.pem' '*.dump' '*.db' '*.sqlite*' '*.log'
```

第一组私有路径查询必须没有输出；backups 最多只有有意保留的空 .gitkeep。
通配查询允许已审阅的 *.env.example 模板，不能出现真实环境文件、私钥或备份。
审阅文件内容而非只看文件名。若有不该提交的文件，先从暂存区撤下并修复规则；
不要直接删除本地原件，也不要提交后再期待 .gitignore 擦除历史。

```powershell
git commit -m 'chore: prepare GeoAI Teacher 21.7 open source candidate'
git remote -v
```

只有 origin 不存在时添加：

```powershell
git remote add origin https://github.com/gordon855/geo-ai-teacher.git
git push -u origin main
```

通过 Git 的安全登录流程认证，不把 Token 放入 URL、脚本或聊天。推送报拒绝时，
先检查远程分支/历史，不使用 force push。此处是私有上传，仍是用户主动操作。

## 7. 检查远程源码和 GitHub Actions

在网页确认 app、components、lib、scripts、tests、public、deploy、锁文件、
Dockerfile、Compose、.github/workflows/ci.yml 和文档齐全，私有文件未出现。
在 Actions 等待 Verify 21.7 完成：Node 22.13/22/24 检查与 Docker 作业均应通过。
本机通过不代表 GitHub 上已经运行通过。失败时保留日志并修复后重新运行。
不需要为当前 CI 填入模型 API Key 或生产数据库凭据。

再检查 Security 页面可用的安全提醒、提交历史、工作流日志和附件。
可用功能取决于账号/仓库配置；不能假定 GitHub 的扫描覆盖全部敏感信息。

## 8. 最后决定公开，先审阅再切换

只有许可范围和第三方通知已审阅、候选文件检查完成、远程 CI 通过、功能边界准确，
维护者才在 Settings → General → Danger Zone → Change repository visibility
选择 Public 并完成平台确认。私有仓库改公开也会公开 Actions 历史/日志，
所以不能把检查只限于源文件。
本副本无原 Git 历史已由维护者确认；若后来导入历史，公开前另审。

参考：[GitHub 仓库可见性](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)。

公开后用退出登录或无痕窗口确认 README、LICENSE、源码和文档可访问。
根 LICENSE 已定稿，仍须取得明确的公开操作授权后才执行这一步。

## 9. 创建 Release 和可公开的演示材料

Releases → Draft a new release，选择已通过 CI 的提交。
建议首个公开候选标签 v21.7.0-oss.1，标题
GeoAI Teacher 21.7 — Open Source Preview，并勾选 Pre-release；
若之后完成稳定版验收，另建稳定标签，不移动已有标签。

将 RELEASE-NOTES-21.7.md 中待发布措辞按真实状态更新后用于 Release。
先保存草稿，核对后由维护者 Publish release。源码由 Git 仓库提供；
不要上传整个工作目录 ZIP、.env、.audit、原始教材或模型。
保留测试限制，不能用“所有功能已通过”替代明细。

参考：[GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。

若录演示视频，使用虚构账号与原创课件。不要展示密码文件、Token、真实学生信息。
视频和截图是说明材料，不能冒充完整端到端验收或教学效果研究。

## 10. 准备并人工提交 OpenAI 申请

从 [官方 Codex for Open Source 页面](https://developers.openai.com/community/codex-for-oss)
进入 Apply today，阅读当时的条件和条款。该项目有审核，创建仓库或 Release
不代表自动符合资格或一定获批。申请字段以实际表单为准。

准备真实姓名、联系邮箱、GitHub 用户名、公开仓库链接、维护者角色、使用计划。
若表单要求 OpenAI Organization ID，从自己 API 平台账户的组织设置取得；
不是 API Key，不需要为了填写申请把密钥提交给任何人，也不要把 ID 写入公开源码。
账号、邮箱、订阅或名额的具体条件以当时页面为准，不沿用截图里的假定。

使用 CODEX-OSS-APPLICATION.md 英文草稿并核对事实：项目采用早期、
未声称大量用户或已测教学收益；API/Codex 维护自动化是拟使用方向，不能伪称
当前应用已接入 OpenAI 服务。不复制截图中未经证实的其他项目经历。
按实际需要选择支持类型，不声称能保证获得某一项资助。

提交前再次核对公开链接、许可证、测试证据与未完成项。由维护者亲自 Submit，
保存回执并按官方要求跟进；不要重复提交相同申请或把申请描述成已获批准。

2026-10-27 已复核官方项目页及[申请条款](https://learn.chatgpt.com/docs/codex-for-oss-terms)：
申请人须有有效 ChatGPT 账号，提供准确的身份、仓库和维护角色资料；项目重要性、
使用情况、活跃维护及名额等可能纳入评估，申请不保证入选。不要向申请材料中
放入保密合同、密码、原始学生资料或私有教材。表单中的个人字段由你本人填写，
本指南不预填邮箱、组织 ID 或未验证的使用量。

## 后续维护

继续通过 Issue/PR 跟踪真实问题；ISSUES-DRAFT.md 可作为手工建 Issue 的素材。
新增功能单独标注版本与测试结果，定期检查依赖和部署配置，不在已有 Release
中改写历史验收结论。阿里云升级须单独授权并先验证备份/恢复，参见
ALIYUN-DEPLOYMENT-PLAN.md。

