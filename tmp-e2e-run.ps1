Set-Location frontend
$target = Join-Path $PWD '.generated-tests\e2e'
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item ..\_workspace_nonruntime\tests\frontend\tests\e2e\* -Destination $target -Recurse -Force
Copy-Item ..\_workspace_nonruntime\tests\frontend\tests\e2e\fixtures -Destination (Join-Path $target 'fixtures') -Recurse -Force
$env:PLAYWRIGHT_TEST_DIR = (Resolve-Path $target).Path
$env:CI = '1'
npx playwright test admin-wizard.spec.js --config playwright.config.js --project=chromium --reporter=line --max-failures=1 --retries=0
