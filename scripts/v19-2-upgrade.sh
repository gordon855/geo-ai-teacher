#!/usr/bin/env bash
# GEOAI_OSS_LEGACY_DISABLED: historical deployment source retained for review.
echo "This legacy in-place deployment script is disabled in the OSS edition. Use docs/INSTALL.md with a fresh demo volume." >&2
exit 2
set -Eeuo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec bash "$root/v19-upgrade.sh" "$@"
