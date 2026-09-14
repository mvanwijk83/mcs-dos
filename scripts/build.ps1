param([string]$Cc65 = $env:CC65_HOME, [string]$Vice = $env:VICE_HOME,
      [string]$Oscar64 = $env:OSCAR64_HOME, [switch]$Release)
# Public builds always use disk-content/. -Release remains accepted for compatibility.
$ErrorActionPreference = 'Stop'
$previous = @{}
foreach ($name in @('CC65_HOME', 'VICE_HOME', 'OSCAR64_HOME')) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    if ($Cc65) { $env:CC65_HOME = (Resolve-Path -LiteralPath $Cc65).Path }
    if ($Vice) { $env:VICE_HOME = (Resolve-Path -LiteralPath $Vice).Path }
    if ($Oscar64) { $env:OSCAR64_HOME = (Resolve-Path -LiteralPath $Oscar64).Path }
    node "$PSScriptRoot/build.js"
    if ($LASTEXITCODE -ne 0) { throw 'Build failed; see output and build/oscar64/build.log' }
} finally {
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
}
