param(
    [string]$Oscar64 = "$PSScriptRoot/tools/oscar64/oscar64",
    [string]$Cc65 = "$PSScriptRoot/tools/cc65"
)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Force build/oscar64 | Out-Null
    & "$Cc65/bin/cl65.exe" -t c64 -O -Wl -D__HIMEM__=53248 -m build/oscar64/cc65.map -o build/oscar64/cc65.prg src/mcsdos.c src/launch.s src/reu.s src/charset.s
    if ($LASTEXITCODE -ne 0) { throw 'cc65 baseline compilation failed' }
    node scripts/prepare-oscar64.js $Cc65
    if ($LASTEXITCODE -ne 0) { throw 'Oscar64 source preparation failed' }
    $baseline = (Get-Item build/oscar64/cc65.prg).Length
    $results = @([pscustomobject]@{ Compiler='cc65 -O'; Bytes=$baseline; SavedBytes=0; SavedPercent=0 })
    foreach ($level in @('O0','O1','O2','Os')) {
        & "$Oscar64/bin/oscar64.exe" -n "-$level" -psci "-o=build/oscar64/MCS-DOS-$level.prg" build/oscar64/mcsdos.c *> "build/oscar64/$level.log"
        if ($LASTEXITCODE -ne 0) { throw "Oscar64 $level failed; see build/oscar64/$level.log" }
        $length = (Get-Item "build/oscar64/MCS-DOS-$level.prg").Length
        $results += [pscustomobject]@{ Compiler="Oscar64 -$level"; Bytes=$length; SavedBytes=$baseline-$length; SavedPercent=[math]::Round(100*($baseline-$length)/$baseline,2) }
    }
    $results | ConvertTo-Json | Set-Content build/oscar64/sizes.json
    Get-FileHash build/oscar64/*.prg -Algorithm SHA256 | ForEach-Object { $_.Hash+'  '+[IO.Path]::GetFileName($_.Path) } | Set-Content build/oscar64/SHA256SUMS.txt
    $results | Format-Table -AutoSize
    Write-Host 'Experimental builds only: compilation success does not imply runtime correctness. See OSCAR64.md.'
} finally { Pop-Location }
