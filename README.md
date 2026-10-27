# GeoAI Teacher 21.7 Open Source Edition

Release preparation candidate based on the existing 21.7.0 application.
Project-owned code, documentation and demo content are licensed under
[Apache-2.0](LICENSE). Copyright 2026 郭沛高; see [NOTICE](NOTICE).
Third-party components retain their own licenses. **No public release has been
authorized or performed; see the [audit](docs/OPEN-SOURCE-AUDIT.md) for evidence
and remaining acceptance limits.**

The latest local rerun is recorded in the
[pre-publication report](docs/FINAL-PREPUBLICATION-20261027.zh-CN.md).

The maintainer's confirmed initial scope is source code, Docker configuration
and compliant demo resources; no models or prebuilt images will be released.
The maintainer has approved Apache-2.0 for project-owned material. Reviewed
third-party files, retained texts and unresolved notice gaps are documented in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and the
[rights confirmation record](docs/RIGHTS-CONFIRMATION.md).

GeoAI Teacher supports surveying English teaching through teacher and student
workspaces, classroom PPT interaction, context translation, knowledge retrieval,
practice, assignments, feedback and classroom management. This edition retains
the existing application code and replaces restricted course material with
explicitly labeled original demonstration content. Demo units repeat a small
set of concepts to exercise workflows; they are not a complete textbook course.
The checked package remains 21.7.0. All implemented functionality in this copy
is retained; see [21.7/21.8 mapping](docs/VERSION-MAPPING.md) for capabilities
that cannot yet be claimed as implemented or verified.

## Run locally

Requires Node.js >=22.13 and Docker Engine/Desktop with Compose supporting --wait.

```sh
npm ci
npm run demo:setup
docker compose up --build --wait --wait-timeout 300
docker compose ps
```

Open http://localhost:3000. Teacher: `demo_teacher`; students:
`demo_student_1` through `demo_student_3`. Passwords are generated into your
private `.env`; first login requires a password change. The Compose deployment
creates PostgreSQL 17 and local file-storage volumes in a new random project
namespace. It has no production database/OSS credentials or external volumes.

Model APIs and real-time avatar providers are optional integrations requiring
your own accounts and configuration. No LiteAvatar model weights, third-party
avatar media, or prebuilt launcher ZIPs are distributed. GPU, RTC, microphone
and voice provider operation require separate on-site acceptance.

See [installation](docs/INSTALL.md), [features](docs/FEATURES.md),
[architecture](docs/ARCHITECTURE.md), [tests](docs/TESTING.md),
[security](SECURITY.md), and [release notes](docs/RELEASE-NOTES-21.7.md).
Actual Compose/PostgreSQL startup and restart tests passed on 2026-10-27; see
[Docker acceptance](docs/DOCKER-ACCEPTANCE-2026-10-27.md). Windows instructions
are in [WINDOWS.md](docs/WINDOWS.md); classroom usage is in
[the teacher/student guide](docs/TEACHER-STUDENT-GUIDE.md).
An original [teaching case](docs/TEACHING-CASE.md) explains the intended classroom
workflow and evidence limits. Maintainers should follow the
[publication and application steps](docs/NEXT-STEPS.zh-CN.md).

## 中文使用说明

这是《测绘专业外语 AI 虚拟教师》21.7 的开源整理候选版，项目名称为
GeoAI Teacher。保留既有业务代码，以原创演示数据替换未获明确授权的教材、
课件和题库。示例内容不代表原教材完整课程。保留当前副本所有已实现功能；
21.7/21.8 对应关系与尚未实现的需求见 VERSION-MAPPING.md。

按上述命令安装后，访问本机 3000 端口。教师及三名虚构学生的密码在本地
`.env` 中；不要上传该文件。首次登录需修改密码。使用全新 PostgreSQL 17
数据卷与本地文件存储，不连接学校正式数据库或 OSS。真实模型、数字人和
语音服务需自行配置，未验证的项目见验收报告。

本地 `.private-originals/` 仅用于保全原文件，禁止上传；它不进入 Git 或
Docker 上下文。维护者已确认本人 AI 辅助开发、个人独立项目，并批准自有内容
采用 Apache-2.0，署名为郭沛高（2026）。书籍图片不在该授权范围内。
尚未执行公开发布；教学和设备实测边界继续以验收报告为准。
