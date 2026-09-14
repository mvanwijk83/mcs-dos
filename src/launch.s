; Relocatable cassette-buffer loader. Oscar64 patches its operands before use.
; /A jumps to the requested address; otherwise return through BASIC RUN.
BASE = $0334
NAME = $03e0
.export len, dev, absolute, secondary, addresslo, addresshi, jump
.segment "CODE"
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
