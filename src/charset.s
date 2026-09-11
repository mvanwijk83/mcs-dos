; Shell display in VIC bank 3. CPU writes reach RAM beneath KERNAL;
; font preparation, commit and scrolling use a temporary CPU mapping.
; $e000-$e3ff screen, $e400-$e43f caret, $e800-$efff mixed-case font.
; $f000-$f7ff stages external fonts until their validation is complete.
.export _charset_prepare, _charset_commit, _charset_enable, _charset_default, _charset_scroll
.segment "CODE"

; RESTORE may arrive while the KERNAL is unmapped. No shell NMI service
; is required; return to the interrupted copy with registers unchanged.
ram_nmi:
    rti

_charset_prepare:
    lda #<ram_nmi
    sta $fffa
    lda #>ram_nmi
    sta $fffb
    php
    sei
    lda $01
    pha
    lda #$31            ; character ROM on, KERNAL and I/O off
    sta $01
    ldx #0
@font:
    .repeat 8, page
    lda $d800+page*$100,x
    sta $e800+page*$100,x
    sta $f000+page*$100,x
    .endrepeat
    inx
    bne @font
    ; Slot 96 replaces the duplicate space. Use the graphics-ROM backslash
    ; (slot 77); regular mixed-case M remains untouched. Also stage the
    ; fallback for older external fonts that omit the new slot.
    ldx #7
@backslash:
    lda $d268,x
    sta $eb00,x
    sta $f300,x
    eor #$ff
    sta $ef00,x
    sta $f700,x
    dex
    bpl @backslash
    pla
    sta $01
    plp
    rts

_charset_commit:
    php
    sei
    lda $01
    pha
    and #$fd
    sta $01
    ldx #0
@font:
    .repeat 8, page
    lda $f000+page*$100,x
    sta $e800+page*$100,x
    .endrepeat
    inx
    bne @font
    pla
    sta $01
    plp
    rts

_charset_scroll:
    php
    sei
    lda $01
    pha
    and #$fd            ; RAM beneath KERNAL, I/O remains visible
    sta $01
    .repeat 3, page
    ldx #0
:
    lda $e028+page*$100,x
    sta $e000+page*$100,x
    inx
    bne :-
    .endrepeat
@tail:
    lda $e328,x
    sta $e300,x
    inx
    cpx #$c0
    bne @tail
    pla
    sta $01
    plp
    rts

_charset_enable:
    ldx #0
@screen:
    .repeat 4, page
    lda $0400+page*$100,x
    sta $e000+page*$100,x
    .endrepeat
    inx
    bne @screen
    ; Keep the ROM cursor disabled: the shell uses its own sprite caret.
    lda #1
    sta $cc
    lda #0
    sta $cf
    lda #$e0
    sta $0288
    lda $dd00
    and #$fc
    sta $dd00
    lda #$8a            ; screen $e000, font $e800 in bank 3
    sta $d018
    rts

_charset_default:
    lda $dd00
    ora #3
    sta $dd00
    lda #4
    sta $0288
    lda #$16            ; screen $0400, mixed-case character ROM
    sta $d018
    rts
