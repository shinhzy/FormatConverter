param(
    [string]$Version = '1.0.0'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherDir = Join-Path $projectRoot 'launcher'
$releaseDir = Join-Path $projectRoot 'release'
$buildDir = Join-Path $projectRoot 'build\release'
$assetZip = Join-Path $buildDir 'FormatDrop.Assets.zip'
$releaseExe = Join-Path $releaseDir ("FormatDrop-{0}.exe" -f $Version)
$stagingDir = Join-Path $buildDir ("FormatDrop-{0}-windows" -f $Version)
$releaseZip = Join-Path $releaseDir ("FormatDrop-{0}-windows.zip" -f $Version)
$checksumFile = Join-Path $releaseDir 'SHA256SUMS.txt'
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $compiler)) {
    throw "C# compiler not found: $compiler"
}

foreach ($requiredFile in @('index.html', 'app.js', 'styles.css')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $requiredFile))) {
        throw "Required file not found: $requiredFile"
    }
}

if (Test-Path -LiteralPath $buildDir) {
    $resolvedBuildDir = (Resolve-Path -LiteralPath $buildDir).Path
    if (-not $resolvedBuildDir.StartsWith($projectRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe build directory: $resolvedBuildDir"
    }
    Remove-Item -LiteralPath $resolvedBuildDir -Recurse -Force
}

New-Item -ItemType Directory -Path $buildDir, $releaseDir, $stagingDir -Force | Out-Null

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($assetZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $assetFiles = @(
        Get-Item -LiteralPath (Join-Path $projectRoot 'index.html'), (Join-Path $projectRoot 'app.js'), (Join-Path $projectRoot 'styles.css')
        Get-ChildItem -LiteralPath (Join-Path $projectRoot 'vendor') -Recurse -File
    )
    foreach ($file in $assetFiles) {
        $entryName = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $file.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
}
finally {
    $archive.Dispose()
}

$compilerArguments = @(
    '/nologo',
    '/target:winexe',
    '/optimize+',
    '/platform:anycpu',
    ("/out:{0}" -f $releaseExe),
    ("/resource:{0},FormatDrop.Assets.zip" -f $assetZip),
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.IO.Compression.dll',
    '/reference:System.IO.Compression.FileSystem.dll',
    (Join-Path $launcherDir 'Program.cs')
)

& $compiler $compilerArguments
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $releaseExe)) {
    throw "Release compilation failed with exit code $LASTEXITCODE"
}

$smokeProcess = Start-Process -FilePath $releaseExe -ArgumentList '--smoke-test' -WindowStyle Hidden -Wait -PassThru
if ($smokeProcess.ExitCode -ne 0) {
    throw "Release smoke test failed with exit code $($smokeProcess.ExitCode)"
}

Copy-Item -LiteralPath $releaseExe -Destination (Join-Path $stagingDir (Split-Path -Leaf $releaseExe))
Copy-Item -LiteralPath (Join-Path $launcherDir 'README.txt') -Destination (Join-Path $stagingDir 'README.txt')

$licensesDir = Join-Path $stagingDir 'licenses'
New-Item -ItemType Directory -Path (Join-Path $licensesDir 'pdfjs'), (Join-Path $licensesDir 'jspdf'), (Join-Path $licensesDir 'jszip') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'vendor\pdfjs\LICENSE') -Destination (Join-Path $licensesDir 'pdfjs\LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $projectRoot 'vendor\jspdf\LICENSE') -Destination (Join-Path $licensesDir 'jspdf\LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $projectRoot 'vendor\jszip\LICENSE.markdown') -Destination (Join-Path $licensesDir 'jszip\LICENSE.txt')

if (Test-Path -LiteralPath $releaseZip) {
    Remove-Item -LiteralPath $releaseZip -Force
}
Compress-Archive -LiteralPath $stagingDir -DestinationPath $releaseZip -CompressionLevel Optimal

$checksumLines = foreach ($artifact in @($releaseExe, $releaseZip)) {
    $hash = Get-FileHash -LiteralPath $artifact -Algorithm SHA256
    "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), (Split-Path -Leaf $artifact)
}
Set-Content -LiteralPath $checksumFile -Value $checksumLines -Encoding ASCII

Write-Output "EXE=$releaseExe"
Write-Output "ZIP=$releaseZip"
Write-Output "CHECKSUMS=$checksumFile"
