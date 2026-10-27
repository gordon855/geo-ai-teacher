# Collected upstream license and notice texts

These are verbatim copies of files found in the installed, lockfile-pinned npm
packages. They apply to their respective components, **not to GeoAI Teacher as
a whole**. Project-owned material is separately licensed under Apache-2.0
in the root LICENSE, with attribution in NOTICE.

The collection contains 22 files from 21 packages: the 16 direct runtime
dependencies with standalone texts, plus JSZip, caniuse-lite, lightningcss,
axe-core and sharp. The two remaining direct runtime packages,
lm-avatar-chat-sdk and server-only, lack such files in their installed packages;
no copyright holder or substitute license text has been invented for them.

See [the indexed file hashes and npm archive provenance](../../docs/THIRD-PARTY-NOTICE-FILES.json)
and [distribution notices](../../THIRD-PARTY-NOTICES.md). Package archive integrity
values come from the existing lockfile; the collection does not independently
authenticate each package author or enumerate all embedded components.

Refresh after reviewing any dependency changes:

```sh
node scripts/audit-license-files.mjs
node scripts/collect-third-party-notices.mjs
```

The collector checks the lockfile and original text hashes before copying. It
does not delete old version directories: reconcile obsolete copies manually
when versions change. Neither script changes the project's license.

MapLibre's original adjacent `public/vendor/maplibre/6.7.0/LICENSE.txt` remains
in place and must accompany those vendor files. Next's copied MIT license also
matches the pinned repository license used for the template SVG comparison.
All other copies are reference materials for dependencies installed by the
recipient, not an assertion that their implementation is vendored here.

This is not a complete notice set for a compiled website, executable, launcher,
model distribution or container image. Those artifacts remain outside the
approved initial release scope.
