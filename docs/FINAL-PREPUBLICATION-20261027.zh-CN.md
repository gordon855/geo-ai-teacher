# 公开发布前最后检查（2026-10-27，北京时间）

对象：当前 GeoAI Teacher 21.7.0 源码候选版；Next.js 16.4.2。
保留实际已实现功能，21.8 未完成项仍见 VERSION-MAPPING.md。
本轮没有 Git 初始化/提交、远程上传、公开仓库、Release 发布或 OpenAI 申请提交。
没有连接阿里云正式环境、删除数据库卷、重置账号或恢复私有教材。

## 1. 本轮实际执行的结果

主机为 Windows，Node v24.21.0、npm 11.19.0。源码检查于北京时间
14:50–14:52 完成。构建时仅对该进程设置 SKIP_MAINLAND_RUNTIME=1 和
NEXT_TELEMETRY_DISABLED=1；没有关闭类型、Lint、测试或依赖安全检查。

| 检查 | 本轮结果 |
|---|---|
| npm ci --cache .npm-cache | 通过，安装 670 个包，exit 0 |
| npm run typecheck | 通过，exit 0 |
| npm run lint | 通过，0 错误、0 警告 |
| npm run test | 87 通过、0 失败、0 跳过 |
| npm run build | Next 生产构建通过；本轮未移动或删除构建缓存 |
| npm audit --omit=dev --json | 0 项已报告漏洞，exit 0 |
| npm audit --json | 含开发依赖共 0 项已报告漏洞，exit 0 |
| docker compose config --quiet | 通过 |
| 现有 Compose 实例 | app/postgres 均 healthy；PostgreSQL 实际为 17.11 |
| 现有实例真实 HTTP 复核 | 6 组检查通过，详见下文 |
| 本轮 Docker 镜像重建 | 通过，exit 0；容器内完整依赖安装和 Next 生产构建成功 |
| 自有内容许可 | Apache-2.0，Copyright 2026 郭沛高；根包与锁文件一致 |
| 第三方许可文本 | 22 份副本与安装包原文/哈希一致 |
| 私有原件 | 192 份哈希与保全记录一致，继续排除 |

主机完整日志留在本地忽略目录 .audit/final-checks-20261027/，不上传日志或密码文件。
机器可读汇总见 FINAL-PREPUBLICATION-20261027.json；依赖审计见 DEPENDENCY-AUDIT.json。
发布候选哈希和扫描结果以最后生成的 RELEASE-FILES.json、SECURITY-SCAN.json 为准。

## 2. 真实 HTTP 与遇到的问题

使用已有隔离实例及已保存的虚构账号，只执行验证阶段，不重新 seed 或替换课件。
本轮验证教师和两名学生登录；前端登录页及工作台 SSR；后端权限隔离和学生访问
教师页重定向；练习记录重新登录后保留及跨学生隔离；学生读取已上传课件且文件
哈希匹配；PostgreSQL 中既有成绩和考勤记录保留。

首次调用返回 401：私有浏览器改密记录使用 TEACHER_PASSWORD/STUDENT1_PASSWORD，
而测试入口需要 CLASSROOM_ADMIN_PASSWORD/DEMO_STUDENT_1_PASSWORD。已在私有复核
入口做变量映射，没有修改或公开密码。随后返回 429，表明教师账号处于登录保护期。
等待保护期自然结束后复测通过；没有清除保护记录、伪造来源或重置账号。
因此初次失败保留在日志中，不作为应用修复或所有调用第一次均通过来描述。

本轮 HTTP 复核不是浏览器 UI 验收，也没有重新停止/重启现有服务。
之前的同名 PPT 替换、容器重启持久化和 Chromium 结果仍属于
DOCKER-ACCEPTANCE-2026-10-27.md/TESTING.md 中的既有证据。

本轮镜像重建用时主要在容器依赖安装：生产依赖约 583 秒，完整依赖约 1103 秒；
随后 Next 生产构建约 13 秒成功。沿用同一次构建，没有因耗时而启动重复任务。
BuildKit 原始日志已保存在私有检查目录。新镜像已生成，但未替换现有运行容器，
因此“新镜像构建通过”和“现有实例 HTTP 复核通过”是两项不同证据。

## 3. 未关闭或不能夸大的事项

- npm 安装仍提示部分传递依赖弃用及 unrs-resolver postinstall 未批准；本轮未
  自动批准它。Node 24 测试模拟接口有实验性/弃用提示；它们不是 ESLint 警告。
  当前安装、测试和构建仍通过，后续维护见 ISSUES-DRAFT.md。
- npm audit 的 0 不代表不存在漏洞，尤其不覆盖 SDK 内嵌而未单列于锁文件的
  所有组件。lm-avatar-chat-sdk 的内嵌库/完整通知、server-only 独立通知、原生库
  及基础镜像义务仍需在未来分发成品时完成审查。
- 首发范围为源码、Docker 配置和合规演示资源，排除模型、成品镜像、编译网站
  产物、私有教材、书籍图片、真实学生资料和运行凭据。源码内 MapLibre vendor
  文件仍保留完整第三方通知。此范围不等于可以发布任意成品。
- 完整作业/章节测试浏览器流程、多班级/复杂课件、外部地图服务、真实翻译提供商、
  GPU、RTC、麦克风及真实课堂场景尚无完整验收；不能写为已通过。
- 持久化电子笔记、浏览历史、独立语境翻译历史、教师单个/批量密码重置及密码表
  尚未形成完整已验收实现；不得作为 21.8 已完成能力宣传。
- 维护者声明原来是文件副本、无 Git 历史；本目录也无根 .git。历史扫描“不适用”，
  不写成扫描通过。以后导入旧仓库必须另审。
- 远程 GitHub 仓库状态、写入权限、Actions 结果及 OpenAI 申请资格未在本地验证。
  这些不由本机测试通过自动成立。

## 4. 发布决策与操作顺序

源码安装/测试/主机构建及 Docker 镜像重建均通过；自有内容许可已经定稿。
本轮本地复核未发现阻止上述限定范围源码 Preview 进入私有上传审阅的新问题。
这不是全部功能、安全或第三方权利的无条件保证。最终上传前检查候选
清单与暂存内容；公开前检查私有仓库的远程 CI 和日志，并由维护者亲自决定。
不要把本报告作为“全功能生产系统已验收”或“OpenAI 已批准”的证明。

完整可复制命令与网页流程见 [NEXT-STEPS.zh-CN.md](NEXT-STEPS.zh-CN.md)：

1. 保留现有 .env、项目名、数据卷及改密记录，查看本地测试证据。
2. 在 GitHub 检查目标仓库；不存在时创建 gordon855/geo-ai-teacher 私有空仓库。
3. 本地初始化 main，设置仓库级署名/已验证或 noreply 邮箱，暂存并审查文件。
4. 手动提交并推送到私有仓库；认证走安全登录，不把 Token 写入 URL。
5. 等待 Actions 的 Node 22.13/22/24 与 Docker 作业成功，审阅日志和制品。
6. 由维护者切换 Public；公开后用无痕窗口验证源码、许可证和安装说明可访问。
7. 选已通过 CI 的提交，创建 v21.7.0-oss.1 的 Pre-release，使用真实 Release Notes。
8. 从官方 Codex for Open Source 页面进入申请，核对实际表单及条款，使用
   CODEX-OSS-APPLICATION.md 草稿，填真实维护角色/使用情况后亲自提交。

官方操作依据（2026-10-27 已复核）：

- [GitHub 导入源码](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
- [GitHub 可见性及公开日志影响](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
- [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
- [Codex for Open Source](https://developers.openai.com/community/codex-for-oss)
- [申请条款](https://learn.chatgpt.com/docs/codex-for-oss-terms)
