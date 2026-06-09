# Upload deploy/cpanel/ to cPanel over FTPS (.env.local for FTP credentials).
# Usage: .\scripts\upload-cpanel-deploy.ps1
#        .\scripts\upload-cpanel-deploy.ps1 -Install -DryRun

param(
    [switch]$Install,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$nodeScript = Join-Path $repoRoot "scripts\upload-cpanel-deploy.mjs"

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
