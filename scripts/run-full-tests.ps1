param(
    [switch]$SkipFrontendE2E = $false
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"
$frontendRoot = Join-Path $repoRoot "frontend"
$backendTestPath = Join-Path $repoRoot "_workspace_nonruntime/tests/backend/tests"
$frontendUnitMirrorPath = Join-Path $repoRoot "_workspace_nonruntime/tests/frontend/src"
$frontendE2EPath = Join-Path $repoRoot "_workspace_nonruntime/tests/frontend/tests/e2e"

Set-Location $backendRoot

Write-Host "===== Running backend tests ====="
$python = Join-Path $backendRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    throw "Python executable not found at $python"
}
if (-not (Test-Path $backendTestPath)) {
    throw "Backend test path not found: $backendTestPath"
}

$originalEnv = @{
    PYTHONPATH = $env:PYTHONPATH
    SECRET_KEY = $env:SECRET_KEY
    DATABASE_URL = $env:DATABASE_URL
    AUTO_APPLY_MIGRATIONS = $env:AUTO_APPLY_MIGRATIONS
    PRECHECK_ALLOW_TEST_BYPASS = $env:PRECHECK_ALLOW_TEST_BYPASS
}

$env:PYTHONPATH = "$backendRoot;$backendRoot\src"
$env:SECRET_KEY = "test-secret-key-with-at-least-32-chars"
$env:DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql+psycopg://postgres:password@localhost:5432/syra_lms" }
$env:AUTO_APPLY_MIGRATIONS = "false"
$env:PRECHECK_ALLOW_TEST_BYPASS = "true"

try {
    & $python -m pytest -q $backendTestPath
}
finally {
    $env:PYTHONPATH = $originalEnv.PYTHONPATH
    $env:SECRET_KEY = $originalEnv.SECRET_KEY
    $env:DATABASE_URL = $originalEnv.DATABASE_URL
    $env:AUTO_APPLY_MIGRATIONS = $originalEnv.AUTO_APPLY_MIGRATIONS
    $env:PRECHECK_ALLOW_TEST_BYPASS = $originalEnv.PRECHECK_ALLOW_TEST_BYPASS
}

Write-Host "===== Running frontend unit tests (mirrored full suite) ====="
Set-Location $frontendRoot
if (-not (Test-Path $frontendUnitMirrorPath)) {
    throw "Frontend mirrored unit test path not found: $frontendUnitMirrorPath"
}
& npm.cmd run test -- --run

if (-not $SkipFrontendE2E) {
    Write-Host "===== Running frontend end-to-end tests (mirrored suite) ====="
    if (-not (Test-Path $frontendE2EPath)) {
        throw "Frontend mirrored E2E test path not found: $frontendE2EPath"
    }
    & npm.cmd run test:e2e
}

Write-Host "===== Full test run complete ====="
