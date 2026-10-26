param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path (Split-Path -Parent $projectRoot) 'yinghuo-deliverables' }
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
if ($outputRoot.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or $outputRoot -eq $projectRoot) {
    throw 'Choose an output directory outside the application directory.'
}
[System.IO.Directory]::CreateDirectory($outputRoot) | Out-Null
$archivePath = Join-Path $outputRoot ('yinghuo-footprints-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.zip')
$rootFiles = @('AGENTS.md', 'README.md', 'design-qa.md', 'index.html', 'package.json', 'package-lock.json', '.gitignore', '.npmrc', 'vite.config.mjs', 'setup.ps1', 'start-preview.ps1')
# Locate the migration guide without relying on the shell's source-file encoding.
$rootFiles += Get-ChildItem -LiteralPath $projectRoot -File -Filter '*.md' | Where-Object { $_.Name -notin $rootFiles } | ForEach-Object { $_.Name }
$sourceDirs = @('src', 'public', 'scripts', 'tests', 'worker', '.openai', '.github', 'docs', 'qa', 'audit-2026-10-11')
$files = New-Object 'System.Collections.Generic.List[object]'
foreach ($name in $rootFiles) {
    $item = Get-Item -LiteralPath (Join-Path $projectRoot $name)
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw "Refusing link: $($item.FullName)" }
    $files.Add($item)
}
$pending = New-Object 'System.Collections.Generic.Stack[string]'
foreach ($name in $sourceDirs) { $pending.Push((Join-Path $projectRoot $name)) }
while ($pending.Count -gt 0) {
    $directory = Get-Item -LiteralPath $pending.Pop()
    if ($directory.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw "Refusing link: $($directory.FullName)" }
    foreach ($item in Get-ChildItem -LiteralPath $directory.FullName -Force) {
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw "Refusing link: $($item.FullName)" }
        if ($item.PSIsContainer) {
            if ($item.Name -notin @('node_modules', '.git', '.tools', '.npm-cache', 'dist', 'test-results', 'playwright-report')) { $pending.Push($item.FullName) }
        } elseif ($item.Name -notlike '.env*' -and $item.Extension -notin @('.pem', '.key', '.pfx', '.p12', '.yhf') -and $item.Name -notin @('.npmrc', '.DS_Store', 'Thumbs.db')) {
            $files.Add($item)
        }
    }
}
# Only the known, non-secret npm settings may travel with this project.
$npmSettings = (Get-Content -LiteralPath (Join-Path $projectRoot '.npmrc') | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') })
if ($npmSettings | Where-Object { $_ -notmatch '^\s*(fund|audit)\s*=\s*false\s*$' }) { throw 'Review .npmrc before packaging: unexpected settings may contain credentials.' }
$manifestFiles = @()
$zip = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files | Sort-Object FullName) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, 'yinghuo-footprints/' + $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $manifestFiles += [pscustomobject]@{ path = $relative; bytes = $file.Length; sha256 = $hash }
    }
    $manifest = [ordered]@{ project = 'yinghuo-footprints'; createdAt = (Get-Date).ToUniversalTime().ToString('o'); fileCount = $manifestFiles.Count; files = $manifestFiles }
    $entry = $zip.CreateEntry('yinghuo-footprints/PACKAGE-MANIFEST.json')
    $writer = New-Object System.IO.StreamWriter($entry.Open())
    try { $writer.Write(($manifest | ConvertTo-Json -Depth 5)) } finally { $writer.Dispose() }
} finally { $zip.Dispose() }
$zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    if ($zip.Entries.Count -ne ($manifestFiles.Count + 1)) { throw 'Archive file count mismatch.' }
    foreach ($file in $manifestFiles) {
        $entry = $zip.GetEntry('yinghuo-footprints/' + $file.path)
        if (-not $entry -or $entry.Length -ne $file.bytes) { throw "Archive entry mismatch: $($file.path)" }
        $stream = $entry.Open()
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { $actual = ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose(); $stream.Dispose() }
        if ($actual -ne $file.sha256) { throw "Archive checksum mismatch: $($file.path)" }
    }
} finally { $zip.Dispose() }
[pscustomobject]@{ Archive = $archivePath; FilesVerified = $manifestFiles.Count; SizeMB = [math]::Round((Get-Item -LiteralPath $archivePath).Length / 1MB, 2); SHA256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash }
