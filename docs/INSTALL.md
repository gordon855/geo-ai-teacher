# Installation — 21.7 demo

Install Node.js >=22.13, npm, Git and Docker Compose with --wait support.
Windows Node 24.21.0 and container Node 22.23.4 were exercised. Exact minimum
Node 22.13 tests also passed; see TESTING.md. The input used Next 16.3.0;
the candidate pins Next 16.4.2
to address dependency security advisories. The application remains version 21.7.0.

```sh
npm ci
npm run demo:setup
docker compose config --quiet
docker compose up --build --wait --wait-timeout 300
docker compose ps
```

The setup script refuses to overwrite .env. Keep its random COMPOSE_PROJECT_NAME
stable between restarts. A new value creates distinct volumes. Never point this
deployment at existing school data, external volumes or OSS. The database is
not exposed to the host; the app listens only on host loopback port 3000.

Visit `/teacher/login` as `demo_teacher`, or `/student/login` as one of
`demo_student_1`, `demo_student_2`, `demo_student_3`. Read the generated passwords
from .env locally. Change the password when prompted. Use fictional files only.
Startup creates the base schema before running the inherited additive migrations;
student seeds are insert-only and do not reset changed passwords on restart.

Pause with `docker compose stop` and resume with `docker compose up --wait`.
Do not use volume removal commands. Back up your own deployment
before upgrading. Historical upgrade/rollback/public-exposure shell scripts are
disabled in this edition; their source is retained for review. They are not the
demo installation procedure. Use the root .env.example, not historical config
templates for older releases.

For remote hosting, configure your own HTTPS reverse proxy and
CLASSROOM_PUBLIC_ORIGIN, ROOT_DOMAIN and WWW_DOMAIN. Do not expose a classroom
database to the Internet. Storage defaults to the private local upload volume.
AI provider keys are optional; retrieval fallback is not equivalent to generative
translation or voice recognition. Add your own API credentials only at runtime.

Optional avatar integration: inspect deploy/liteavatar217 source and provider
documentation, obtain models separately under their licenses, set
CLASSROOM_PUBLIC_ORIGIN and OAC_LITEAVATAR_URL, then configure your own gateway,
WSL/GPU and TURN. No preconfigured school gateway or model weights are supplied.
The legacy launcher requires an existing OpenAvatarChat installation and is not
an automatic clean-machine installer. Hardware acceptance remains outstanding.

For development, provide DATABASE_URL for a new local database, STORAGE_DRIVER=local,
APP_ENCRYPTION_KEY and credentials in your process environment before `npm run dev`.
For compile-only verification use SKIP_MAINLAND_RUNTIME=1; never use this switch
to claim that database-backed functionality works.

The 2026-10-27 Compose/PostgreSQL acceptance is recorded in
[DOCKER-ACCEPTANCE-2026-10-27.md](DOCKER-ACCEPTANCE-2026-10-27.md).
See [Windows](WINDOWS.md), [PostgreSQL operations](POSTGRESQL.md),
[teacher/student usage](TEACHER-STUDENT-GUIDE.md) and the
[manual server upgrade plan](ALIYUN-DEPLOYMENT-PLAN.md).
Existing .env and changed passwords must be preserved; do not regenerate setup
to recover a changed account password.
