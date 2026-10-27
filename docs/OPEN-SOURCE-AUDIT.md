# 21.7 Open Source Preparation Audit

Status: **Apache-2.0 source release candidate; publication not authorized**. Scope is the local working
copy only. No production database, school OSS or cloud VM was accessed. No
repository was published, no application submitted and no paid resource created.

Final rerun: installation, typecheck, lint, all 87 tests, Windows production
build, full/production npm audits, Docker image rebuild and existing-demo HTTP
verification passed. See [the dated final report](FINAL-PREPUBLICATION-20261027.zh-CN.md)
for the corrected credential mapping, natural login cooldown, artifact scope
and remaining manual/remote checks. No browser or restart rerun is implied.

## Source and retained behavior

The original inventory covered 653 files, including app, components, lib,
scripts, tests, deployment, configuration and documents. Files were inventoried
and scanned; key runtime, data, migration and test paths were inspected. This is
not a claim of a formal line-by-line security proof for the entire application.
The original package is 21.7.0 with Next.js 16.3.0. Security maintenance updates
Next to 16.4.2 while keeping the application version 21.7.0. Existing implemented
functionality is retained; VERSION-MAPPING.md distinguishes it from unverified
or absent requested 21.8 capabilities.
See FEATURES.md for teacher/student, PPT, question, translation, assessment,
attendance, messaging, map and optional avatar capabilities retained in source.

## Data and resources

The five specified data bundles contained textbook paragraphs, translations,
PPT extracted text or derived questions without accompanying redistribution
permission. They were replaced with original demo material. Definition excerpts,
classroom cold-call data, listening/translation examples and external reading
excerpts were also replaced or withheld. The 54 demo slots repeat a small
concept set; 17 formal-unit slots retain the existing assessment policy and 68
demo definitions. No claim of equivalent curriculum coverage is made.

Uncertain avatar/training/image media, preview MP4 and launcher ZIPs were moved
out of public paths. Original SVG placeholders preserve image rendering. The
file-by-file list (192 preserved originals) is RESOURCE-CHANGES.json; the local original tree
preserves replaced files under .private-originals and is excluded from Git and
Docker. Additional legacy document originals are withheld there as well.
MapLibre vendor files carry their upstream BSD license and are regenerated from
the locked package by prebuild. PPT test fixtures contain no embedded media;
their provenance still belongs in the owner's final source review.

## Privacy, configuration and history

Production domain references in release text were removed. The default Compose
deployment uses a new random project namespace, PostgreSQL 17 database volume,
local storage, fictional accounts and generated passwords. Secrets are supplied
at runtime. Original-looking demo names/numbers were changed to explicit Demo
labels. No database, student roster spreadsheet or production .env was found in
the supplied source inventory. Pattern results are in SECURITY-SCAN.json;
absence of a pattern match is not proof that all personal data is absent.
After local deployment, release candidate bytes were also compared with the
actual generated demo password/encryption values: zero matches. The private .env,
.audit credentials, .playwright-cli session files and output screenshots were
confirmed ignored. They must never be packaged as release artifacts.

Thirty-four historical upgrade, rollback and public-exposure shell entry points
now exit before performing operations. Their source remains for review, but their
old volume/domain/version assumptions are incompatible with the fresh demo.
Use docs/INSTALL.md. Historical root JSON manifests are labeled as input records;
their old hashes and validation assertions are not evidence for this candidate.

There was no .git directory in the input. Consequently no real development
history was available to audit. A temporary bare repository under .audit is
used only to verify ignore rules, with no commits or remote. If history exists
elsewhere, it must be scanned before publication, including deleted secrets,
binary assets, tags and branches. Do not import unreviewed history or force-push.

## Licenses, owner declarations and distribution scope

The maintainer has confirmed a source-only initial release (source, Docker
configuration and compliant demo resources), excluding models and prebuilt
images. Apache-2.0 is approved for project-owned work, Copyright 2026 郭沛高. The source-only
notice set is now in [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md), with
22 verbatim files from 21 packages indexed in THIRD-PARTY-NOTICE-FILES.json.
Four default SVGs match the official pinned Next template exactly; globe.svg
has one coordinate-character difference. Their MIT text and provenance are
retained. The maintainer subsequently confirmed personal AI-assisted creation,
no employer/institutional agreement, self-made PPTs and favicon, and AI-assisted
local adapters. LICENSE now contains Apache-2.0 and both root package license
fields agree. These are owner declarations, not independent legal adjudication.
The two public PPT fixtures contain only short text and no media, embedded
fonts/attachments or external resource relationships. Book illustrations in
other PPTs remain private. See RIGHTS-CONFIRMATION.md for the exact scope.

THIRD-PARTY-LICENSES.json records lockfile declarations, not a complete legal
approval. Direct dependencies declare MIT, ISC, BSD-3-Clause or Apache-2.0.
Transitives include sharp/libvips LGPL-3.0-or-later binaries, MPL-2.0 files,
caniuse-lite CC-BY-4.0 data and buffers@0.1.1 with missing package license metadata.
The 2026-10-27 follow-up found a preserved buffers MIT/X11 licensing commit and
verified byte-identical main source; see UPSTREAM-LICENSE-EVIDENCE.json. It also
identified missing standalone notices for lm-avatar-chat-sdk/server-only and
additional licenses inside the actual libvips binary package. Detailed evidence,
distribution boundaries and owner questions are in LICENSE-AUDIT-2026-10-27.md
and RIGHTS-CONFIRMATION.md. Third-party notices retain their original licenses.
Review actual source/binary notices and source-offer/relinking obligations before
shipping images. A permissive project license does not replace these obligations.
No blanket compatibility determination has been made. Review source attribution
and all deployment dependencies, model and media terms separately.

Reference: [GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

## Verification and remaining acceptance

See TESTING.md and DOCKER-ACCEPTANCE-2026-10-27.md. Actual Compose startup,
PostgreSQL 17.11 migrations, HTTP authorization, PPT replacement and restart
persistence passed. Chromium verified teacher/student first password changes,
student re-login, PPT display and student-to-teacher redirect. PGlite and mocked
speech tests remain distinct evidence. Full browser assignment/chapter workflows,
cross-class manual trials, provider translation, external maps, GPU/RTC/TURN,
microphone/ASR/TTS and classroom hardware still require further verification.

The patched source passes npm ci, typecheck, lint (zero warnings), all 87 Node
tests and the production build. On 2026-10-27 both production and full npm audits
report zero findings after the Zod 4.6.7 patch. The previously reported braces
chain no longer appears in the registry response; no forced downgrade was used.
See DEPENDENCY-AUDIT.json. The owner confirms this is a file copy with no
original Git history: historical scanning is inapplicable, not a passed test.
Future imported history requires review. Publication authorization, final
candidate review and the stated optional/manual acceptance remain separate.

## Deliverables and publishing

RELEASE-FILES.json is the generated candidate file inventory; inspect it again
after every change. GITHUB-PUBLISH.md contains manual private repository setup
and upload commands. RELEASE-NOTES-21.7.md and CODEX-OSS-APPLICATION.md are drafts.
The owner approved licensing; public release still requires separate permission. Nothing in this
audit authorizes automatic publication or submission.
