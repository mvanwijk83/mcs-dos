param([string]$Cc65 = "$PSScriptRoot/tools/cc65", [string]$Vice = "$PSScriptRoot/tools/vice/GTK3VICE-3.10-win64", [switch]$Release,
    [ValidateSet('oscar64','cc65')][string]$Compiler = 'oscar64',
    [string]$Oscar64 = "$PSScriptRoot/tools/oscar64/oscar64",
    [ValidateSet('Os-outline','Os','O2','O3')][string]$Optimization = 'Os-outline')
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Force build | Out-Null
    # Standard cc65 C64 RAM through $CFFF; keep its full 2 KiB C stack.
    if ($Compiler -eq 'cc65') {
        & "$Cc65/bin/cl65.exe" -t c64 -O -Wl -D__HIMEM__=53248 -m build/mcsdos.map -Ln build/mcsdos.lbl -o build/MCS-DOS.prg src/mcsdos.c src/launch.s src/reu.s src/charset.s
        if ($LASTEXITCODE -ne 0) { throw 'Compilation failed' }
    } else {
        node scripts/prepare-oscar64.js $Cc65
        if ($LASTEXITCODE -ne 0) { throw 'Oscar64 source preparation failed' }
        # Windows PowerShell treats compiler warnings on stderr as errors.
        $ErrorActionPreference = 'Continue'
        $optimizerFlags = @("-$Optimization")
        if ($Optimization -eq 'Os-outline') { $optimizerFlags = @('-Os','-Oo') }
        & "$Oscar64/bin/oscar64.exe" -n @optimizerFlags -psci '-o=build/MCS-DOS.prg' build/oscar64/mcsdos.c *> build/oscar64/build.log
        $ErrorActionPreference = 'Stop'
        if ($LASTEXITCODE -ne 0) { throw 'Compilation failed; see build/oscar64/build.log' }
    }
    node scripts/make-help.js
    if ($LASTEXITCODE -ne 0) { throw 'Help generation failed' }
    node scripts/make-examples.js
    if ($LASTEXITCODE -ne 0) { throw 'Example generation failed' }
    & "$PSScriptRoot/scripts/make-charset.ps1"
    node scripts/make-yaff-charsets.js
    if ($LASTEXITCODE -ne 0) { throw 'YAFF charset conversion failed' }
    & "$Vice/bin/c1541.exe" -format 'mcs-dos,mc' d64 build/MCS-DOS.d64 -attach build/MCS-DOS.d64 -write build/MCS-DOS.prg mcs-dos -write build/HELLO.BAT 'hello.bat,s' -write build/MANUAL.TXT 'manual.txt,s' -write build/LICENSE.TXT 'license.txt,s' -write build/CGA.CPI 'cga.cpi,s' -write build/AMIGA.CPI 'amiga.cpi,s' -write build/ATARIST.CPI 'atarist.cpi,s' -write build/PET.CPI 'pet.cpi,s' -write build/ZXSPECTRUM.CPI 'zxspectrum.cpi,s' -write build/COMMANDS.HLP 'commands.hlp,s'
    if ($LASTEXITCODE -ne 0) { throw 'Disk image creation failed' }
    if ($Release) {
        node scripts/verify-image.js --release
    } else {
        node scripts/make-dev-autoexec.js
        if ($LASTEXITCODE -ne 0) { throw 'Development AUTOEXEC generation failed' }
        & "$Vice/bin/c1541.exe" -attach build/MCS-DOS.d64 -write build/AUTOEXEC.BAT 'autoexec.bat,s'
        if ($LASTEXITCODE -ne 0) { throw 'Development AUTOEXEC insertion failed' }
        node scripts/verify-image.js
    }
    if ($LASTEXITCODE -ne 0) { throw 'Disk image verification failed' }
    if ($Release) { 'Release: no personal AUTOEXEC.BAT' | Set-Content build/BUILD-TYPE.txt }
    else { 'Development: contains personal AUTOEXEC.BAT; do not distribute' | Set-Content build/BUILD-TYPE.txt }
    Get-FileHash build/MCS-DOS.d64,build/MCS-DOS.prg -Algorithm SHA256 |
        ForEach-Object { $_.Hash + '  ' + [IO.Path]::GetFileName($_.Path) } |
        Set-Content build/SHA256SUMS.txt
    Get-Item build/MCS-DOS.prg,build/MCS-DOS.d64 | Select-Object Name,Length
} finally { Pop-Location }

