# Third-party notices — source-only release candidate

Reviewed 2026-10-27. This document records third-party provenance and retained
notices; it does not relicense third-party components or certify the entire
candidate for publication. The maintainer approved Apache-2.0 for project-owned
work; see [LICENSE](LICENSE), [NOTICE](NOTICE) and the ownership declaration in
[RIGHTS-CONFIRMATION.md](docs/RIGHTS-CONFIRMATION.md).

The confirmed initial scope is application source, documentation, lockfiles,
Docker build/Compose configuration and compliant demo resources. No models,
prebuilt images, node_modules, .next output, launcher ZIPs or private originals
are included. The vendor files below are an explicit exception to the exclusion
of dependency implementations: they are already shipped inside the repository
and require their own notices even in a source-only release.

## Third-party files included in the repository

### MapLibre GL JS 6.7.0

Files: `public/vendor/maplibre/6.7.0/maplibre-gl-shared.mjs` and
`maplibre-gl-worker.mjs`. Both files and their adjacent
[LICENSE.txt](public/vendor/maplibre/6.7.0/LICENSE.txt) byte-match the installed
maplibre-gl 6.7.0 package. No modification was found in that comparison.

The complete adjacent license text retains the MapLibre contributors' 2023
copyright, the Mapbox 2020 notice for earlier Mapbox GL JS code, and the further
component notices supplied by the package. Preserve the entire text, including
its BSD-3-Clause conditions and bundled component notices. Do not reduce it to
the npm package's single license label. The local `probe.mjs` helper is not
covered by this byte-match evidence.

Source and integrity: [resource evidence](docs/RESOURCE-RIGHTS-EVIDENCE.json),
[package archive and copied-text index](docs/THIRD-PARTY-NOTICE-FILES.json).
Map tiles, terrain, styles and remote services have separate terms; this code
license is not a grant to redistribute those resources.

### Next.js template SVGs

`public/next.svg`, `public/vercel.svg`, `public/file.svg` and `public/window.svg`
exactly match the official create-next-app template at Next.js commit
`2864b1772c37242a9b40ab4d366eb7d368c2a070` (v16.4.2).
`public/globe.svg` differs by one coordinate character: local `M10.27 14.2`
versus upstream `M10.27 14.1`; the remaining bytes match. The date and author of
that local change have not been established. This records the change without
attributing it to a person or claiming these assets are project originals.

The repository's MIT text, Copyright (c) 2025 Vercel, Inc., is preserved in
[licenses/third-party/next-16.4.2/license.md](licenses/third-party/next-16.4.2/license.md).
It also byte-matches the installed Next.js license. Exact source URLs, Git blob
IDs and comparison hashes are in [the SVG evidence](docs/TEMPLATE-SVG-LICENSE-EVIDENCE.json).
Matching a later official snapshot establishes a matching source, not the
historical date on which the files entered this project.

The Next.js and Vercel marks remain third-party marks. They must not imply
endorsement or identify GeoAI Teacher as a Vercel product; consult the
[official brand guidelines](https://vercel.com/geist/brands) for intended usage.
No business-code references to these five default SVGs were found in the prior
app/components/lib scan. `public/favicon.svg` is a different asset and its
origin is now declared by the maintainer as personal/AI-assisted creation; it
is included in the project-owned license scope.

## Dependencies installed by recipients

The selected [verbatim notice collection](licenses/third-party/README.md)
contains 22 upstream files from 21 packages, with original paths, npm archive
URLs, lockfile integrity values and SHA-256 hashes in
[THIRD-PARTY-NOTICE-FILES.json](docs/THIRD-PARTY-NOTICE-FILES.json).
The complete lockfile declaration inventory and broader local file inventory
are [separate evidence](docs/THIRD-PARTY-LICENSE-EVIDENCE.json), not a complete
SBOM for compiled output.

| Group | Evidence and handling |
|---|---|
| Direct MIT packages | HeyGen SDK, Phosphor, three-vrm, ali-oss, ExcelJS, fflate, Next, pg, qrcode, React, React DOM, Three.js, undici and Zod: exact installed texts retained |
| PPTX renderer | @aiden0z/pptx-renderer 1.2.4: exact Apache-2.0 text retained; does not change the project license |
| MapLibre | Full package notice retained both next to vendor files and in the reference collection |
| JSZip 3.10.1 | Upstream expressly offers MIT **or** GPLv3. Use the MIT option for the planned distribution; the original full dual-license document is preserved |
| caniuse-lite, lightningcss, axe-core | CC-BY-4.0 and MPL-2.0 texts retained, including axe-core's separate third-party notice; implementation is not part of this source-only release |
| sharp | Its Apache-2.0 text is retained as reference; it does not replace libvips or other binary component licenses |

### Evidence supplemented without inventing missing notices

- **buffers 0.1.1:** the installed package lacks license metadata/text. A
  [preserved upstream commit](https://github.com/bitpay/node-buffers/commit/1b745ee35d33eb166e15ef1866073a07c6d7de87)
  declares MIT/X11, and its main `index.js` exactly matches the installed file.
  The declaration, scope and hash are in [upstream evidence](docs/UPSTREAM-LICENSE-EVIDENCE.json).
  This does not authenticate all ancillary files or supply a missing complete
  copyright notice. The npm metadata is unchanged; no implementation is added
  to the source release.
- **lm-avatar-chat-sdk 1.1.4:** declares ISC, but supplies no standalone
  LICENSE/NOTICE. Six installed JavaScript bundles were hashed; observed
  Three.js/Google license markers and axios 0.21.4 metadata are recorded in
  [SDK evidence](docs/AVATAR-SDK-LICENSE-EVIDENCE.json). Markers are incomplete
  component evidence, not permission to label the whole bundle ISC. A complete
  publisher notice set is still needed before distributing compiled output.
  A clean npm audit does not assess every embedded component.
- **server-only 0.0.1:** declares MIT but has no standalone notice in the
  installed package. No author name or replacement notice has been guessed.
  The dependency reference is retained; its implementation is not vendored.

## Optional digital-human integrations

The OpenAvatarChat installer pins commit
`8b7b3b45bca28ae9ab5fa72ee31bc03c5a99b08b`; its
[upstream LICENSE](https://github.com/HumanAIGC-Engineering/OpenAvatarChat/blob/8b7b3b45bca28ae9ab5fa72ee31bc03c5a99b08b/LICENSE)
was verified as Apache-2.0. The source release supplies integration/configuration
code, not that upstream checkout or its models. The maintainer declares local
adapters to be personal AI-assisted development. This declaration does not
authorize third-party implementation or services. Models,
sample media, likenesses, voices, cloud services and SDK account rights must
be evaluated separately. No models or launchers were downloaded in this audit.

## Unresolved release gates and later artifact reviews

The maintainer has declared personal AI-assisted development, no institutional
or commissioned rights agreement, Copyright 2026 郭沛高, and approved Apache-2.0
for project-owned work. The two self-made PPT fixtures were rechecked: no
embedded images, fonts, attachments or external resource links were found.
Book illustrations in other private PPTs remain excluded. Favicon creation was
confirmed separately. No original Git history exists according to the
maintainer; history scanning is inapplicable for this file copy. See
[the confirmation record](docs/RIGHTS-CONFIRMATION.md). Public upload/release
still requires separate authorization.

Before any later distribution of built websites, images or installers, review
the actual artifact's embedded JavaScript, native binaries and base image:
libvips includes additional LGPL, MPL-1.1 and other terms not summarized by
sharp's own license. Obtain complete notices and satisfy applicable source and
other distribution obligations for those artifacts. That additional artifact
review is deferred because such artifacts are excluded from the first release;
it does not authorize publication or expand the project license to private
book illustrations or other excluded third-party material.
