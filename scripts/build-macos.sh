#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo '請先安裝 Node.js 22+'; exit 1; }
command -v npm >/dev/null || { echo '請先安裝 npm'; exit 1; }
npm install --no-audit --no-fund
npm test
npm run dist:mac
echo '請到 dist 資料夾尋找 Intel/Apple Silicon 版本的 .dmg 與 .zip'
