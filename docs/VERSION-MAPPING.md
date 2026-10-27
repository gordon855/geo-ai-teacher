# 21.7 / 21.8 implementation mapping

The checked package is 21.7.0; its framework is Next.js 16.4.2. Framework patch
numbers do not change the application version. No file or capability was removed
because it might be described elsewhere as planned for 21.8. No separate 21.8
release or complete 21.8 feature set can be established from this copy.

| Requested capability | Actual implementation / acceptance |
|---|---|
| Teacher/student workspaces | Retained; real login, first password change and role checks passed |
| Teacher PPT visible to students | Retained; real HTTP/storage and student browser display passed |
| Same-name PPT update | Current presentation replacement passed; catalog retains versions rather than erasing history |
| PPT catalog / choose active deck | Existing catalog API and UI retained; automated PGlite/API tests, not a complete browser catalog acceptance |
| Translation practice history | learning-progress records persist and are isolated; real PostgreSQL tested |
| Professional-context translation | Existing provider/fallback interfaces retained; real provider output not verified |
| Electronic notes and browsing history | No complete persistent user-facing implementation located; not accepted |
| Separate context-translation history | Not established by the practice-record test; not accepted |
| Teacher single/batch student password reset | No complete reset/download workflow located; not accepted |
| Initial roster password CSV | Existing import of new users issues temporary passwords; not equivalent to resetting existing passwords |
| First-login self-service password change | Existing flow; teacher/student browser changes and restart persistence passed |
| Assignments, chapter tests, grades | Existing modules preserved; automated regressions; real grade writes; full browser assessment flow pending |
| LiteAvatar / other avatar adapters | Source retained; model weights and unlicensed media absent; hardware/provider tests pending |

Persistent notes, reset tools or other future requests must be implemented and
tested explicitly before being added to release claims. This acceptance does not
silently relabel them as completed 21.8 features. Consult FEATURES.md for source
locations and TESTING.md for verification boundaries.

