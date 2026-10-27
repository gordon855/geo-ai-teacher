# Verification of the release candidate

Final recheck: see [the pre-publication report](FINAL-PREPUBLICATION-20261027.zh-CN.md)
for the newly executed 2026-10-27 install/typecheck/lint/87-test/build/audit results,
existing-container recheck and explicit runtime limitations. Earlier Docker
restart and browser results below remain dated evidence, not newly repeated UI tests.

Observed on 2026-10-27 in the existing Windows working copy. Application 21.7.0;
Next.js 16.4.2; host Node 24.21.0/npm 11.19.0; container Node 22.23.4.
The complete 87-test suite and Next production build also passed with exact
Node 22.13.0. Test-only alias resolution now uses the older async loader API and
an explicit type-stripping flag; the previous registerHooks API was unavailable
on 22.13. No global Node installation was changed.
See [Docker acceptance](DOCKER-ACCEPTANCE-2026-10-27.md) for actual service evidence.

| Check | Observed result |
|---|---|
| npm ci | Passed; 670 packages. npm 11 reports deprecated transitives and an unapproved unrs-resolver postinstall; lint/build work without approving it |
| npm run typecheck | Passed, exit 0 |
| npm run lint | Passed; 0 errors, 0 warnings |
| npm run test | Passed; 87 tests, 0 failed, 0 skipped |
| npm run build | Passed on Windows with a fresh generated cache; also passed in Docker |
| npm audit --omit=dev | 0 reported vulnerabilities, exit 0 |
| npm audit | 0 reported vulnerabilities including development, exit 0 |
| Docker Compose | Configuration, image build, startup and both health checks passed |
| PostgreSQL 17 | Actual 17.11 server, 56 public tables; initialization and migration chain completed |
| Restart persistence | Records, PPT bytes and changed password hashes retained |
| Browser | Chromium teacher/student login, first password changes, student re-login, PPT display/page navigation and student-to-teacher redirect passed |
| Git history | No .git in supplied working copy; cannot certify another repository's history |

The 87 Node tests include unit, source-wiring, mocked-provider and isolated
PGlite regressions. They are distinct from the real PostgreSQL/HTTP checks in
scripts/demo-integration.mjs. No provider credentials, microphone, RTC, TURN,
GPU inference or live classroom devices were used.

Failures investigated and corrected:

- Three lint warnings: two image elements now use Next Image; an unused variable
  was removed from the retained browser harness.
- A PPT test generated ZIP timestamps using the clock, causing byte mismatch
  across a second boundary. Fixed timestamps make the fixture deterministic.
- Dashboard SSR crashed for demo Units 9/27; lesson mappings and a regression
  test were added.
- UUID-only classroom validators rejected existing demo student IDs. A demo-only
  allowlist fixes writes without widening production validation. Existing
  enrollment guards remain; a real HTTP nonmember write is rejected.
- The fresh registry audit no longer returned the previously reported five
  braces-chain development findings. It reported a high Zod collection-validation
  memory-exhaustion advisory. Zod was patched to 4.6.7; final audits report zero.
  This is a dated registry result, not proof of security.
- Windows Turbopack exited before connecting to its PostCSS child process. A
  permissions-only retry also failed. Moving only generated .next into ignored
  .audit and repeating the unchanged build succeeded. No bundler switch, ignored
  type errors or disabled security check was used.

Browser limitations: two MapLibre quality warnings were observed; one map-proxy
request returned ERR_EMPTY_RESPONSE during the session. External map availability
and geographic visual accuracy are not accepted by login/PPT checks. Full
assignment, chapter-test and provider-backed translation browser workflows remain
unverified. Persistent notes, browsing history, context-translation history and
teacher password-reset tools must not be inferred from practice history; see
[version mapping](VERSION-MAPPING.md).

Reproduce source checks:

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
```

Compile-only SKIP_MAINLAND_RUNTIME must not be used for live deployment.
For a new isolated demo, follow DOCKER-ACCEPTANCE-2026-10-27.md.
CI now includes seed/restart/verify checks; a configured workflow is not a passed
GitHub run. Raw logs, credentials and browser artifacts remain ignored.

