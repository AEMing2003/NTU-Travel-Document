$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '請先安裝 Node.js 22 或更新版本' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw '找不到 npm' }
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install 失敗' }
npm test
if ($LASTEXITCODE -ne 0) { throw '測試失敗' }
npm run dist:win
if ($LASTEXITCODE -ne 0) { throw 'Windows 打包失敗' }
Write-Host '請到 dist 資料夾尋找 Setup.exe 與 portable.exe' -ForegroundColor Green
