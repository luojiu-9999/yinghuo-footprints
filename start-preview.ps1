$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodeCommand = (Get-Command node -ErrorAction Stop).Source
$viteScript = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $viteScript)) { throw 'Install dependencies first: run setup.ps1.' }
function Test-Preview {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173/' -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content.Contains('content="yinghuo-footprints"')
    } catch { return $false }
}
if (Test-Preview) { Write-Output 'Yinghuo is ready: http://127.0.0.1:4173/'; exit 0 }
$logRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('yinghuo-preview-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $logRoot | Out-Null
$process = Start-Process -FilePath $nodeCommand -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173', '--strictPort') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'stdout.log') -RedirectStandardError (Join-Path $logRoot 'stderr.log') -PassThru
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (Test-Preview) { Write-Output 'Yinghuo is ready: http://127.0.0.1:4173/'; exit 0 }
    if ($process.HasExited) { throw ('Preview exited. Check logs: ' + $logRoot) }
    Start-Sleep -Milliseconds 400
}
throw ('Preview did not become ready. Check port 4173 and logs: ' + $logRoot)
