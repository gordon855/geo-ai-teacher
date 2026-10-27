# GeoAI Teacher 21.7.0 — draft first public release

An independently configurable edition of the existing surveying English virtual
teacher application. Teacher and student workspaces, PPT interaction, retrieval,
translation, practice, assessment and classroom management code are retained.

This candidate introduces original demo content, fictional account seeding,
fresh PostgreSQL 17 volumes, private local storage, generated credentials,
deployment documentation and automated release checks. Third-party textbook
extracts, uncertain media and prebuilt launcher archives are withheld. No model
weights are distributed. The demonstration question sets intentionally reuse a
small concept set and do not substitute for a full teaching curriculum.

The confirmed first-release scope is source code, Docker configuration and
compliant demo resources, excluding prebuilt images and compiled application
bundles. Third-party notices and exact selected upstream texts are collected in
THIRD-PARTY-NOTICES.md and licenses/third-party/. Project-owned work is now
licensed under Apache-2.0, Copyright 2026 郭沛高, on the maintainer's declaration
and approval. Book illustrations and excluded private resources are not
covered by that grant. This draft does not announce publication.

Security maintenance updates Next.js from 16.3.0 to 16.4.2, fflate to 0.8.3,
undici to 7.30.1 and compatible transitive dependencies. The application version
remains 21.7.0. Zod was patched to 4.6.7. Both production and full dependency
audits report zero findings on 2026-10-27 (see DEPENDENCY-AUDIT.json).

Fixed demo-highlight dashboard SSR, demo-only student ID validation and flaky PPT
fixture timestamps. The 87-test suite, warning-free lint and production build pass.
Real Compose/PostgreSQL 17 startup, migration, role checks, PPT replacement and
restart persistence passed. Chromium login/first-password changes and student
PPT navigation were exercised; full provider/hardware acceptance remains pending.

The final 2026-10-27 recheck reran installation, typecheck, lint, all 87 tests,
Windows build and both npm audits successfully; Docker image rebuild and the
existing demo's HTTP verification also passed. See FINAL-PREPUBLICATION-20261027.zh-CN.md
for failures encountered during credential mapping/cooldown and their resolution.
This does not expand the earlier browser or hardware evidence.

Do not publish these notes as a completed release until public release is
explicitly authorized and the applicable checks in OPEN-SOURCE-AUDIT.md are reviewed. Actual test results belong in
TESTING.md. Version claims and preserved capabilities are mapped in VERSION-MAPPING.md.
