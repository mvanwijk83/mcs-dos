# Development and release builds

Run `./build.ps1` for development. It rebuilds `build/MCS-DOS.d64` and includes
the personal startup preferences in `dev/AUTOEXEC.BAT.txt` as a PETSCII SEQ
file named AUTOEXEC.BAT. Edit that source file to retain changes across future
development builds. The preferences select DOS drive identifiers, CGA, color
preset 2, the `$p$c$h$g` prompt, and the version banner with batch echo off.

AUTOEXEC can alternatively store a startup prompt with `SET PROMPT=$p$c$h$g`.
After AUTOEXEC finishes, the shell applies that environment value, overriding
any earlier PROMPT command in the batch. With no PROMPT variable, the prompt
set by the batch is retained. Interactive SET only updates the environment;
use the PROMPT command to change the active prompt immediately. REBOOT clears
the environment and processes AUTOEXEC again, as it does for CHARSET.

Run `./build.ps1 -Release` before distributing a release. This recreates the
D64 from scratch and excludes the personal AUTOEXEC. Release verification
explicitly rejects an image containing it. Both modes write the same D64/PRG
paths and refresh SHA256SUMS.txt; BUILD-TYPE.txt identifies the last build.
The generated loose AUTOEXEC.BAT is a development artifact, not a release file.

Tests that create their own AUTOEXEC or expect a clean startup should start
from `./build.ps1 -Release`. Run `./build.ps1` afterward to restore the personal
development image. Use `node scripts/verify-image.js` for development images
and `node scripts/verify-image.js --release` for release images.

Do not ship the development D64 or the files under `dev/` as release content.
