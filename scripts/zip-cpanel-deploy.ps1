# Create deploy/cpanel.zip for cPanel File Manager upload.
# Usage: .\scripts\zip-cpanel-deploy.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$nodeScript = Join-Path $repoRoot "scripts\zip-cpanel-deploy.mjs"

Push-Location $repoRoot
try {
    node $nodeScript
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
