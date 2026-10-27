# LiteAvatar 接入状态

本次默认提供浏览器数字教师。它不需要另外购买数字人推理服务器，但问答和语音仍使用你已有的云服务。

你看到的 OpenAvatarChat + LiteAvatar 视频属于另一条渲染链路，需要独立推理服务、模型和对应人物数据包。普通 PNG、当前浏览器口型图片、GLB 不能直接当作 LiteAvatar 模型使用。此次“知性女教师”选择已应用到浏览器教师；没有把她自动训练成 LiteAvatar 人物数据包。

网站21.1已有的以下文件仍保留：
- scripts/v21-1-install-oac.sh：固定上游提交的独立推理服务安装脚本。
- scripts/v21-1-configure-oac.py：网站桥接配置。已升级21.2后，仍可在21.2目录运行该兼容脚本。
- deploy/openavatarchat/configure.py：推理服务配置生成器。
- docs/v21.1/OpenAvatarChat-LiteAvatar-Setup.md：独立服务说明。阅读时将网站解压路径中的 step21.1 替换为 step21.2，脚本文件名继续使用 v21-1。

本版直接对话页在教师已登录、OAC_ENABLED=1、桥接密钥和HTTPS服务地址已配置时，显示“打开已配置的 LiteAvatar 服务”。该按钮只说明配置存在，不代表已完成运行健康检查。外部服务继续需要自己的访问认证；网站登录不会自动登录外部服务。

若目标必须是演示视频级别的 LiteAvatar，而不接受浏览器 2.5D 效果，还未完成的必要事项为：确认推理硬件、准备可访问的运行服务、选择或制作 LiteAvatar 格式人物资产、配置语音与桥接、实测跨网络媒体连接。这些不能由修改网站 ZIP 自动完成，当前未采购或开通任何收费资源。

官方核对来源（2026-09-25）：
- https://github.com/HumanAIGC-Engineering/OpenAvatarChat
- https://github.com/HumanAIGC-Engineering/OpenAvatarChat/blob/main/docs/en/reference/handlers/avatar/liteavatar.md
- https://github.com/HumanAIGC/lite-avatar

上游文档和配置会变化；本包保留21.1固定提交的安装方式，没有声称它已经在本次环境安装验证。
