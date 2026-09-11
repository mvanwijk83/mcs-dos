; Copy the loader into the cassette buffer before a PRG replaces the shell.
; /A relocates the LOAD destination and jumps there; otherwise RUN BASIC.
.export _launch, _basic_exit
.import _launchname, _launchdevice, _launchlength, _launchabsolute, _launchaddress
.import _exit
.import _charset_default

BASE = $0334
NAME = $03e0
.segment "CODE"
_launch:
    jsr display_reset
    sei
    ldx #0
@copy:
    lda loader,x
    sta BASE,x
    inx
    cpx #loader_end-loader
    bne @copy
    ldx #16
@name:
    lda _launchname,x
    sta NAME,x
    dex
    bpl @name
    lda _launchlength
    sta BASE+len-loader+1
    lda _launchdevice
    sta BASE+dev-loader+1
    lda _launchabsolute
    sta BASE+absolute-loader+1
    eor #1
    sta BASE+secondary-loader+1
    lda _launchaddress
    sta BASE+addresslo-loader+1
    sta BASE+jump-loader+1
    lda _launchaddress+1
    sta BASE+addresshi-loader+1
    sta BASE+jump-loader+2
    jmp BASE
loader:
    lda #$37
    sta $01
    cli
    jsr $ffcc
    jsr $ffe7
    jsr $e453             ; initialize BASIC vectors
    jsr $e3bf             ; initialize BASIC RAM
len: lda #0
    ldx #<NAME
    ldy #>NAME
    jsr $ffbd
    lda #1
dev: ldx #8
secondary: ldy #1
    jsr $ffba
addresslo: ldx #1
addresshi: ldy #8
    lda #0
    jsr $ffd5
    bcs error
    stx $2d
    sty $2e
absolute: lda #0
    beq basic
jump: jmp $ffff
basic:
    jsr $a659             ; CLR: initialize variables and stack
    jsr $a533             ; relink BASIC program lines
    jmp $a7ae             ; RUN
error:
    ldx #0
    jmp $a474             ; BASIC error / ready
loader_end:
.assert loader_end-loader < NAME-BASE, error, "Loader overlaps filename"

_basic_exit:
    jsr $ffcc
    jsr $ffe7
    jsr display_reset
    ; Let crt0 restore its saved zero page, CPU stack and memory mapping,
    ; and run library destructors before returning to BASIC's SYS caller.
    ; Do not initialize BASIC RAM here: it overlaps the live C zero page.
    lda #0
    tax
    jmp _exit
display_reset:
    jsr _charset_default
    lda #0
    sta $0291
    lda $d015
    and #$fe
    sta $d015            ; no shell caret in BASIC
    lda #$8e
    jsr $ffd2            ; standard uppercase/graphics character set
    lda #$93
    jsr $ffd2            ; clear screen and home before READY
    rts
