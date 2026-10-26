param([string]$NpmCli)
$ErrorActionPreference = 'Stop'
$nodeCommand = (Get-Command node -ErrorAction Stop).Source
$nodeVersion = [version](& $nodeCommand -p 'process.versions.node')
if ($nodeVersion -lt [version]'22.12.0') {
    throw 'Please install Node.js 22.12+ with npm. This package was verified with Node.js 24.'
}
if ($NpmCli) {
    $NpmCli = (Resolve-Path -LiteralPath $NpmCli -ErrorAction Stop).Path
} else {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) { $npmCommand = Get-Command npm -ErrorAction SilentlyContinue }
    if (-not $npmCommand) { throw 'npm was not found. Install Node.js with npm, or pass -NpmCli with an existing npm-cli.js path.' }
}
function Invoke-ProjectNpm([string[]]$NpmArguments) {
    if ($NpmCli) { & $nodeCommand $NpmCli @NpmArguments } else { & $npmCommand.Source @NpmArguments }
    if ($LASTEXITCODE -ne 0) { throw ('npm ' + ($NpmArguments -join ' ') + ' failed. Check the output above.') }
}
Push-Location $PSScriptRoot
try {
    Invoke-ProjectNpm -NpmArguments @('ci')
    Invoke-ProjectNpm -NpmArguments @('run', 'build')
    & $nodeCommand --test tests/backup-domain.test.mjs tests/reliability.test.mjs tests/sites-worker.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
    Write-Output 'Setup complete. Start the local preview with: powershell -ExecutionPolicy Bypass -File .\start-preview.ps1'
} finally {
    Pop-Location
}
