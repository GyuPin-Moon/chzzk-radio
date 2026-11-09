#!/usr/bin/env bash
# Builds dist/chzzk-radio-v<version>.zip from the committed extension/ folder and prints its path.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./extension/manifest.json').version")
name="chzzk-radio-v${version}"

rm -rf dist
mkdir -p dist/chzzk-radio
git archive HEAD:extension | tar -x -C dist/chzzk-radio
git show HEAD:LICENSE > dist/chzzk-radio/LICENSE

cd dist
find chzzk-radio -exec touch -t 202601010000 {} +
find chzzk-radio -type f | LC_ALL=C sort | zip -qX "${name}.zip" -@
shasum -a 256 "${name}.zip" > SHA256SUMS.txt
echo "dist/${name}.zip"
