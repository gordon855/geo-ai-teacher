import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

// Collect exact upstream texts, without granting a license to this application.
// Run audit-license-files.mjs first. This is a selected notice collection, not
// a complete bundle/image SBOM or legal compatibility determination.
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const evidence = JSON.parse(await readFile('docs/THIRD-PARTY-LICENSE-EVIDENCE.json', 'utf8'));
const lockBytes = await readFile('package-lock.json');
assert.equal(sha256(lockBytes), evidence.lockfileSha256, 'Refresh license evidence for this lockfile first');
const lock = JSON.parse(lockBytes);
const additional = new Set(['jszip', 'caniuse-lite', 'lightningcss', 'axe-core', 'sharp']);
const copies = [];
const missing = [];

for (const entry of evidence.packages) {
  if (!entry.installed || !(entry.directRuntime || additional.has(entry.name))) continue;
  if (!entry.licenseFiles.length) {
    missing.push({ package: entry.name, version: entry.version, declaredLicense: entry.declaredLicense });
    continue;
  }
  const slug = `${entry.name.replaceAll('@', '').replaceAll('/', '__')}-${entry.version}`;
  assert.match(slug, /^[a-zA-Z0-9_.+-]+$/, 'Unexpected package path');
  const directory = `licenses/third-party/${slug}`;
  await mkdir(directory, { recursive: true });
  for (const file of entry.licenseFiles) {
    const bytes = await readFile(file.path);
    assert.equal(sha256(bytes), file.sha256, `Installed text changed: ${file.path}`);
    const destination = `${directory}/${path.basename(file.path)}`;
    await writeFile(destination, bytes);
    copies.push({
      package: entry.name, version: entry.version, declaredLicense: entry.declaredLicense,
      category: entry.directRuntime ? 'direct-runtime-dependency' : 'selected-transitive-dependency',
      originalPath: file.path, path: destination, bytes: bytes.length, sha256: file.sha256,
      resolved: lock.packages[entry.path].resolved ?? null,
      integrity: lock.packages[entry.path].integrity ?? null,
      scope: entry.name === 'maplibre-gl'
        ? 'Also covers the matching vendor files already present in public/vendor/maplibre/6.7.0; retain their adjacent LICENSE.txt.'
        : entry.name === 'next'
          ? 'Dependency text also byte-matches the pinned Next.js repository license recorded for template SVG provenance.'
          : 'Reference notice text only; dependency implementation is installed at build/run time and excluded from the source-only release.',
    });
  }
}

await writeFile('docs/THIRD-PARTY-NOTICE-FILES.json', JSON.stringify({
  checkedAt: new Date().toISOString(), lockfileSha256: sha256(lockBytes),
  scope: 'Exact local license/notice texts from direct runtime dependencies and five selected transitives. Not a complete dependency or bundled-component notice set. Does not change the project LICENSE.',
  selection: { directRuntime: true, additionalPackages: [...additional] },
  copies, missingTopLevelTexts: missing,
}, null, 2) + '\n');
console.log(`Collected ${copies.length} exact notice files; ${missing.length} selected packages lack top-level texts. Root LICENSE unchanged.`);
