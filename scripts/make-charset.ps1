# MCPI v1: six-byte header, ordered (screen code + eight rows) records,
# then a little-endian 16-bit sum of all record bytes. No ROM data included.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bitmap = [Drawing.Bitmap]::new((Join-Path $PSScriptRoot '../cga.png'))
try {
    if ($bitmap.Width -ne 256 -or $bitmap.Height -ne 64) { throw 'Expected a 256x64 CGA atlas' }
    $mapping = @{}
    $mapping[0] = 64
    $mapping[27] = 91
    $mapping[29] = 93
    $mapping[96] = 92
    foreach ($code in 1..26) { $mapping[$code] = $code + 96 }
    foreach ($code in 32..63) { $mapping[$code] = $code }
    foreach ($code in 65..90) { $mapping[$code] = $code }
    $data = [Collections.Generic.List[byte]]::new()
    $data.AddRange([byte[]](77,67,80,73,1,$mapping.Count))
    $checksum = 0
    foreach ($code in ($mapping.Keys | Sort-Object)) {
        $data.Add([byte]$code)
        $checksum += $code
        $glyph = $mapping[$code]
        for ($row = 0; $row -lt 8; $row++) {
            $bits = 0
            for ($col = 0; $col -lt 8; $col++) {
                $pixel = $bitmap.GetPixel(($glyph % 32)*8+$col, [int][math]::Floor($glyph/32)*8+$row)
                if ($pixel.A -ne 255 -or $pixel.R -ne $pixel.G -or $pixel.R -ne $pixel.B -or $pixel.R -notin 0,255) {
                    throw 'Expected opaque black-and-white pixels'
                }
                if ($pixel.R -eq 0) { $bits = $bits -bor (128 -shr $col) }
            }
            $data.Add([byte]$bits)
            $checksum += $bits
        }
    }
    $data.Add([byte]($checksum -band 255))
    $data.Add([byte](($checksum -shr 8) -band 255))
    [IO.File]::WriteAllBytes((Join-Path $PSScriptRoot '../build/CGA.CPI'), $data.ToArray())
    Write-Output "CGA.CPI: $($mapping.Count) glyphs, $($data.Count) bytes"
} finally { $bitmap.Dispose() }
