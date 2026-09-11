param(
    [string]$Oscar64 = "$PSScriptRoot/tools/oscar64/oscar64",
    [string]$Cc65 = "$PSScriptRoot/tools/cc65",
    [switch]$IncludeO3
)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $extra = @()
    if ($IncludeO3) { $extra += '--o3' }
    node scripts/compare-oscar64.js $Oscar64 $Cc65 @extra
    if ($LASTEXITCODE -ne 0) { throw 'Compiler comparison failed' }
} finally { Pop-Location }