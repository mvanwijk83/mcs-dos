# EasyAPI vendor files

`eapi-am29f040.s` and `eapi_defs.s` are unmodified EasyFlash EasySDK sources,
copyright 2009–2010 Thomas 'skoe' Giesel. Their permissive license notices are
included in the files and must be retained. They are not MCS-DOS-authored code.

Source retrieval (2026-09-24):
- https://github.com/KimJorgensen/easyflash/tree/master/EasySDK/eapi
- https://raw.githubusercontent.com/KimJorgensen/easyflash/master/EasySDK/eapi/eapi-am29f040.s
- https://raw.githubusercontent.com/KimJorgensen/easyflash/master/EasySDK/eapi/eapi_defs.s

`eapi.bin` is the 768-byte preassembled AM29F040 EasyAPI image, extracted from
the `eapiam29f040` array in VICE's EasyFlash implementation on the same date:
https://github.com/VICE-Team/svn-mirror/blob/main/vice/src/c64/cart/easyflash.c

SHA-256 of `eapi.bin`:
`032f3f21f2299e2fd96b28dc1a901a6ed19a04f600d446c7a362781b4592f432`

The binary is vendored so normal builds do not need ACME or a network download.
The build places it at bank 0 ROMH offset $1800, copies it to $0400, and invokes
its initialization entry at $0414. EasyAPI uses $DF80–$DFFF for RAM routines.
See the [EasyFlash programmer reference](https://skoe.de/easyflash/files/devdocs/EasyFlash-ProgRef.pdf).

The C files in this directory are the MCS-DOS-specific bootstrap, filesystem,
and banking implementation; see ../../EASYFLASH.md for their layout.
