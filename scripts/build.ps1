param([string]$Vice = $env:VICE_HOME,
      [string]$Oscar64 = $env:OSCAR64_HOME, [switch]$Release)
# Cartridge builds use disk-content/. -Release remains accepted for compatibility.
$ErrorActionPreference = 'Stop'
$previous = @{}
foreach ($name in @('VICE_HOME', 'OSCAR64_HOME')) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    if ($Vice) { $env:VICE_HOME = (Resolve-Path -LiteralPath $Vice).Path }
    if ($Oscar64) { $env:OSCAR64_HOME = (Resolve-Path -LiteralPath $Oscar64).Path }
    node "$PSScriptRoot/build.js"
    if ($LASTEXITCODE -ne 0) { throw 'Build failed; see compiler output above' }
} finally {
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
}
