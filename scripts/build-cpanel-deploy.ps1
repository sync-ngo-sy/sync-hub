# Manual cPanel production build (uses repo-root .env for VITE_* values).
# Usage: .\scripts\build-cpanel-deploy.ps1
#        .\scripts\build-cpanel-deploy.ps1 -Install

param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$nodeScript = Join-Path $repoRoot "scripts\build-cpanel-deploy.mjs"

$nodeArgs = @($nodeScript)
if ($Install) {
    $nodeArgs += "--install"
}

Push-Location $repoRoot
try {
    node @nodeArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
