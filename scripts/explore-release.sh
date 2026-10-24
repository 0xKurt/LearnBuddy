#!/usr/bin/env sh
# Mandatory before producing an APK. Fixed regressions, rotating exploration, device + audio.
set -eu
. scripts/test-lock.sh
pnpm eval:explore --owner
pnpm eval:explore --smoke
sh scripts/explore-device.sh
