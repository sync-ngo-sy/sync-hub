# Build + upload to cPanel in one step (local manual deploy).
# Usage: .\scripts\publish-cpanel-local.ps1 -Install

param(
    [switch]$Install,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$nodeScript = Join-Path $repoRoot "scripts\publish-cpanel-local.mjs"

$nodeArgs = @($nodeScript)
if ($Install) { $nodeArgs += "--install" }
if ($DryRun) { $nodeArgs += "--dry-run" }

Push-Location $repoRoot
try {
    node @nodeArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
