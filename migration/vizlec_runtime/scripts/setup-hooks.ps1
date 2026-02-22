$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

git config core.hooksPath .githooks

Write-Host "[hooks] core.hooksPath configured to .githooks"
Write-Host "[hooks] pre-push will run: pnpm run verify:critical"
