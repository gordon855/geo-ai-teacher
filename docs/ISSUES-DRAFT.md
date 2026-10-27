# Local issue drafts — not created on GitHub

These are proposed follow-up issues, not claims of completed 21.8 features.
Publish them only after the repository exists and the maintainer wants them.

## Broaden real browser acceptance

Scope: roster import, assignment publication/submission/feedback, chapter-test
completion, grade visibility, multiple classes and complex licensed PPT files.
Acceptance: repeatable browser evidence using fictional accounts; record precise
failures without replacing missing workflows with mocked success.

## Student notes and browsing history

Status: complete persistent user-facing implementation not established.
Acceptance: authenticated per-user storage, enrollment/authorization checks,
logout/re-login and container-restart persistence, cross-user isolation and
documented retention/deletion policy. Preserve existing practice history.

## Persistent context-translation history

Status: existing translation-practice records are not this feature.
Acceptance: explicit save/history UI, user isolation, input/provider provenance,
safe output rendering, retention policy and regression coverage.

## Teacher student-password recovery

Status: single/batch reset and new-password-table workflow not implemented as a
complete accepted feature. Initial roster import and first-login self-change exist.
Acceptance: teacher authority and enrollment guards, single/batch confirmation,
secure one-time password export, no plaintext stored in logs/database, session
revocation policy and forced first-change tests. Do not overwrite real accounts
during development.

## Complete external map / avatar / voice validation

Status: interfaces retained; intermittent map request failure observed; real
providers, GPU, microphone and RTC have not been accepted.
Acceptance: operator supplies legal assets/accounts/devices; test service failures,
permissions, browser behavior and network configuration; report actual hardware.

## Release rights, notices and history

Status: owner declarations recorded; Apache-2.0 approved for project-owned work,
Copyright 2026 郭沛高. The maintainer confirms no original Git history. Selected
upstream notices are retained. Remaining scope: review any newly introduced
assets/history and complete bundled/native notices before future distribution
of compiled websites, images or installers. Source-only publication does not
authorize excluded book illustrations or model weights.

## Dependency and test-runtime maintenance

The 2026-10-27 clean install still reports deprecated transitives (including
inflight, lodash.isequal, rimraf, glob and fstream). Node 24 test mocking emits
experimental/deprecation warnings; npm 11 reports an unapproved unrs-resolver
postinstall. Current lint/tests/build pass and npm audits report zero, but those
results are not a complete review of embedded SDK components. Follow upstream
maintenance and preserve Node 22.13 compatibility; do not suppress security
checks, automatically approve install scripts or force incompatible upgrades.

