# 权属与许可证核查报告（2026-10-27）

> 后续决定已更新：维护者随后确认本人 AI 辅助开发、个人独立项目无相关约定，
> 批准 Apache-2.0，署名郭沛高（2026），并确认无原 Git 历史及 favicon 自制。
> 根 LICENSE、NOTICE 和两个根包许可字段现已定稿。两份公开 PPT 复核无图片、
> 嵌入附件/字体或外部资源；其他 PPT 内的书籍图片继续排除。
> 当前有效范围见 [权属确认记录](RIGHTS-CONFIRMATION.md)。公开操作仍未授权。
> 以下保留先前核查过程及当时的待决结论，不代表当前仍在等待 Q1–Q8 答复。

## 历史核查记录（许可批准之前）

结论：可以继续以 Apache-2.0 作为自有代码的候选许可，但现有文件不足以确认
本项目全部自有代码的权利人。根 LICENSE 保持待决，package.json/锁文件
保持 UNLICENSED。本报告区分已查到的文件事实、技术许可缺口和必须由权利人
回答的问题，不把“有 license 字段”当成完整的再分发合规结论。

本日补充：维护者已确认首发仅源码、Docker 配置和合规演示资源，不发布模型或
成品镜像；Apache-2.0 仅为倾向，其他权属仍待确认。新增 THIRD-PARTY-NOTICES.md
与 21 个包的 22 份原始许可/通知文本，哈希和包来源见 THIRD-PARTY-NOTICE-FILES.json。
本次补充没有替项目授予许可，也没有把源码发行等同于模型/镜像发行。

## 1. 核查范围与结果

- 检查根 LICENSE、package.json、package-lock.json、CONTRIBUTING、审计和资源清单。
- 盘点 752 个锁文件包条目；本机安装 670 个，其余条目包括未安装的平台可选包。
- 检查已安装包根目录 LICENSE/LICENCE/COPYING/NOTICE/COPYRIGHT 文件，记录 SHA-256。
  37 个已安装包没有这种根目录文件；这不等于它们没有许可，README、嵌套目录
  或上游仍可能提供证据。该自动检查不覆盖所有内嵌组件。
- 18 个直接运行依赖：16 个附有独立许可文本；lm-avatar-chat-sdk、server-only
  只有包元数据声明。逐项见 THIRD-PARTY-LICENSE-EVIDENCE.json。
- 对实际 Linux 容器作只读检查，区分真实安装的 libvips 与 Windows 锁文件条目。
- 对两个 PPT 夹具解包，核对 MapLibre 发布文件与包文件，复核 192 份私有原件哈希。
- 检索工作副本文件名，未找到授权书、合同、著作权证或贡献者协议类命名文件。
  没有查用户其他目录；文件名检索不能证明现实中不存在这些文件。
- 根目录没有 .git，不能从此副本证明谁在哪次提交创作了代码。
- 未更改业务代码、生产系统、依赖版本、根 LICENSE 或公开状态。

## 2. 现有文件能证明什么

| 对象 | 核实事实 | 不能据此认定 |
|---|---|---|
| 项目本体 | package 21.7.0；private=true；license=UNLICENSED；根 LICENSE 明示待决 | GitHub 账号等于著作权人；private=true 等于禁止 GitHub 开源 |
| 自有业务源码 | 教师/学生/教学接口和适配代码存在，当前无完整贡献归属清单 | 仅凭文件在本机，就属于个人且无学校/雇主权利 |
| 开源演示替换 | 私有生成脚本 .audit/prepare.py、demo-content-finish.py 含示例词句和几何 SVG 的生成逻辑；五个指定数据包已有替换 | “原创示例”标注本身就是法律授权或所有内容可不经来源审核 |
| 被隔离的资料 | RESOURCE-CHANGES 中 192 份原件的当前哈希均与记录一致；仍被 Git/Docker 排除 | 教材/PPT/视频因此取得再分发许可；原件应恢复到公开目录 |
| 两个 PPT 测试夹具 | 各 2 页，无 ppt/media、无嵌入字体；作者字段空；Application 写 Microsoft Macintosh PowerPoint | 作者身份、生成方法或许可。Application 字段不是所有权证据 |
| MapLibre 6.7.0 | 两个分发 mjs 与 LICENSE.txt 均逐字匹配已安装包；许可证含 MapLibre/Mapbox 及其他组件通知 | 所有线上地图瓦片/地形数据也使用同一许可 |
| 公共 SVG | 四个初始 SVG 与官方 Next.js 固定提交逐字匹配；globe.svg 仅一个坐标字符不同；演示人像为几何图；favicon 来源待决 | 官方来源能证明本项目原创或授予一般商标权；无引用就无需来源审查 |
| 模型与数字人 | 候选清单未发现常见权重格式；保留接口/启动/配置代码，未附完整模型包 | SDK 代码许可同时授权声音、肖像、模型或云服务 |

证据分别记录于 RESOURCE-RIGHTS-EVIDENCE.json 和 UPSTREAM-LICENSE-EVIDENCE.json。
生成脚本和原件仅保存在私有目录，本次没有重跑整理脚本。
默认 SVG 的新增固定提交/哈希证据见 TEMPLATE-SVG-LICENSE-EVIDENCE.json；
官方 MIT 文本已保留，globe.svg 的差异在第三方通知中明示。六个数字人 SDK
JS 包的哈希与去重版权标记见 AVATAR-SDK-LICENSE-EVIDENCE.json，不是完整内嵌 SBOM。

## 3. 第三方许可证据与初筛

### 直接依赖

- MIT 且本地附文本：HeyGen SDK、three-vrm、Phosphor、ali-oss、ExcelJS、
  fflate、Next、pg、qrcode、React、React DOM、Three.js、undici、Zod。
- @aiden0z/pptx-renderer 1.2.4：Apache-2.0，本地 LICENSE 存在。
- maplibre-gl 6.7.0：BSD-3-Clause，实际公开 vendor 文件携带完整包许可证。
- lm-avatar-chat-sdk 1.1.4：包声明 ISC，但没有独立 LICENSE/NOTICE；
  打包 JS 含 Three.js、Google Apache 头及内嵌 axios 0.21.4 元数据。
  因此不能把整个 JS 包只按一条 ISC 声明完成归属，须补内嵌组件通知。
- server-only 0.0.1：声明 MIT，但独立包及 Next 内置副本均无独立许可文件。
  后续须补充与实际来源匹配的通知，不虚构版权署名。

包内许可证支持继续采用自有代码 Apache-2.0 的方案，但第三方代码仍保留自己的
许可证和通知。没有发现“仅因这些元数据就必须把全部自有代码改为 GPL”的依据，
也没有据此作出整个发行包完全兼容的最终结论。

### buffers：已从“只有缺失信息”推进为“有可追溯补充证据”

依赖链为 ExcelJS 4.4.0 → unzipper 0.10.14 → binary 0.3.0 → buffers 0.1.1。
本地发布包未带 license 字段或独立许可证；原仓库地址目前返回 404。

在保留的历史提交
[1b745ee](https://github.com/bitpay/node-buffers/commit/1b745ee35d33eb166e15ef1866073a07c6d7de87)
中找到给 README 和 package.json 增加 MIT/X11 声明的变更，版本仍为 0.1.1。
该提交记录作者为 James Halliday；提交未签名，不能当成身份认证材料。
本地主要运行文件 index.js 与该提交文件逐字一致，SHA-256：

97801e296ba5f3c32242f647e1daac5917e300367fed7935ab1e62f40adb1b8a

因此不再把该包描述为“完全没有授权线索”；也不修改 npm 的原始元数据。
后续通知中记录保留提交、MIT/X11 声明和比对范围，其他附带文件仍按实际发布
范围核查。此项不是让项目所有人替第三方授予许可。

### OpenAvatarChat 与模型分开

安装脚本固定到 8b7b3b45bca28ae9ab5fa72ee31bc03c5a99b08b，
该提交的 [LICENSE](https://github.com/HumanAIGC-Engineering/OpenAvatarChat/blob/8b7b3b45bca28ae9ab5fa72ee31bc03c5a99b08b/LICENSE)
确为 Apache-2.0。可用于确认这个上游代码版本的许可。
本地 teacher_echo.py、HTML、Launcher 等是否自行编写或由上游改编，
仍需要开发者说明来源。代码许可不覆盖自动下载的模型、示例形象和声音。
阿里云[官方 SDK 文档](https://help.aliyun.com/en/avatar/avatar-application/developer-reference/digital-people-conversation-client-render-websdk)
能证明 SDK 接入方式；其中资源参数 license 是资源解密公钥字段，
不是开源许可证文本，不能用于证明媒体再分发权。

### 实际分发形式决定需要补齐的材料

| 条目 | 证据/现状 | 后续动作 |
|---|---|---|
| JSZip | 本地 LICENSE.markdown 明示 MIT 或 GPLv3 二选一 | 计划选 MIT 路径并保留通知；不能仅见 GPL 字样就认定全项目必须 GPL |
| caniuse-lite | CC-BY-4.0，许可文本存在 | 保留适用的署名、许可链接和修改说明 |
| lightningcss、axe-core | MPL-2.0，当前主要属于开发依赖 | 如分发其代码/二进制，按实际覆盖文件处理通知和源码可得性 |
| sharp / libvips | 实际 Linux 镜像含 sharp 0.35.5 和 libvips 包 1.3.4；后者声明 LGPL-3.0-or-later | 在分发成品镜像前按实际二进制补齐通知和相应源码/替换机制要求 |
| libvips 内嵌依赖 | 包 README 另列 cairo MPL-1.1、多个 LGPL、BSD、字体库及专利条款，超出 npm 单行许可 | 发布镜像时不能只附 sharp 的 Apache 文本，须处理实际原生组件范围 |
| SDK 内嵌库、SWC 与基础镜像 | 锁文件许可清单不能完整描述所有打包原生/JS 组件 | 若发布编译产物/镜像，另做成品 SBOM、通知及来源核对 |

[Apache-2.0 原文](https://www.apache.org/licenses/LICENSE-2.0)要求保留适用许可、
变更和归属通知；它不自动替其他权利人授权，也不授予一般商标使用权。
[MPL 官方说明](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)解释了文件级范围；
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)说明署名等条件。
LGPL 的实际全文/二进制义务仍需在确定成品发布范围后核对，本轮未把官网抓取
超时当成已完成法律核验。

维护者已确认首次只发布已审阅源码、锁文件、Dockerfile/Compose 和合规演示资源；
不发布 node_modules、.next、现成容器镜像、模型或私有原件。仍需保留已经
随源码携带的 MapLibre 等第三方通知。源代码发行和成品镜像发行不能混为一谈。

## 4. 必须由你回答的问题

RIGHTS-CONFIRMATION.md 已记录 Q7 确认、Q4 倾向及其余事项暂不能确认。
保留这些待决事项，之后有事实依据时再补充，无需重复回答已确认的范围。
无需在聊天中贴合同全文、身份证件、私人邮箱或密钥。
当前未要求你替上游确认 buffers、MPL、LGPL 等许可证；技术证据与通知由我继续整理。

## 5. 确认后的文件修改计划

| 条件 | 文件/动作 |
|---|---|
| Q1–Q4 自有代码权利、署名及许可明确 | 将 LICENSE 待决通知换成批准的完整许可文本；按真实署名/年份增加版权说明 |
| 许可证定稿 | 同步 package.json 和 package-lock.json 根包 license；private=true 可保留，它限制 npm 发布而非 GitHub 公开 |
| 第三方归属已核实且范围明确 | THIRD-PARTY-NOTICES.md 与 licenses/third-party/ 已建立；后续按证据继续补齐，必要时提供适用 NOTICE，不把所有第三方改成 Apache |
| Q5/Q6 资源或适配来源需补充 | 在实际修改/改编文件中补来源、许可证和变更说明；若来源无法确认，另提出可审阅的替换方案，不静默删功能 |
| 对外状态更新 | README.md、CONTRIBUTING.md、docs/OPEN-SOURCE-AUDIT.md、RIGHTS-CONFIRMATION.md、ACCEPTANCE-21.7.zh-CN.md、RELEASE-NOTES-21.7.md、NEXT-STEPS.zh-CN.md、CODEX-OSS-APPLICATION.md、CHANGELOG.md、ROADMAP.md |
| 证据和清单更新 | THIRD-PARTY-LICENSES.json、THIRD-PARTY-LICENSE-EVIDENCE.json、UPSTREAM-LICENSE-EVIDENCE.json、RESOURCE-RIGHTS-EVIDENCE.json；再生成 RELEASE-FILES.json/SECURITY-SCAN.json |
| 将来改变 Q7，拟发布成品 | 当前明确排除成品镜像/模型；将来另补 Docker/前端产物中原生和内嵌依赖通知、源码提供安排及成品清单 |
| Q8 有外部历史 | 先只读扫描其历史；发现敏感项后另拟处理方案，不直接覆盖、删历史或强推 |

确认许可不等于授权上传、公开、云端修改或提交申请。那些操作仍单独由维护者
决定。本轮新增审核脚本已运行并通过语法/ESLint 检查；没有重跑业务测试或更改
已有业务验收结果。

## 6. 源码首发通知补充的实际验证

- 已运行 scripts/collect-third-party-notices.mjs，生成 21 个包的 22 份原始文本；
  每份副本与安装目录原文逐字一致，SHA-256、大小、锁文件来源均已核对。
- 新脚本语法检查和 npm run lint 通过，零警告。
- 默认 SVG：4 份逐字一致，1 份确认仅一个坐标字符差异；Next MIT 文本与固定
  官方提交及安装包一致。SDK 6 个 JS 文件的证据哈希再次核对一致。
- 已检查主要新增/修改 Markdown 文档中的 31 个本地链接，目标均存在。
- LICENSE、package.json、package-lock.json 与补充前哈希一致，仍为待决/UNLICENSED。
- 本轮未运行 npm ci、业务测试、构建、Docker 或浏览器验收；它们的既有结果
  保持原日期和验证范围。第三方通知完善不等于项目权属或公开发布获批。

当前可继续的事项是维护来源和通知证据；需要事实确认才能推进的事项仍为
RIGHTS-CONFIRMATION.md 中的权属、署名、夹具/favicon/适配来源及外部历史。
不因维护者倾向 Apache-2.0 而提前替换根许可证，也不自动上传或公开。

