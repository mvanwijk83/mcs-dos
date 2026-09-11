; Non-destructive REU capacity probe: 128 KiB through 16 MiB.
; Save byte zero in each 64K bank, write distinct markers, observe bank
; mirroring, then restore every original byte and the writable registers.
; Returns installed KiB in A/X, or zero if no compatible REU is detected.
.export _reu_size
.bss
saved: .res 10
original: .res 256
value: .res 1
size: .res 2
.code
_reu_size:
    php
    sei
    ldx #9
@save:
    lda $df01,x
    sta saved,x
    dex
    bpl @save
    lda #$55
    sta $df02
    cmp $df02
    beq :+
    jmp absent
:
    lda #$aa
    sta $df02
    cmp $df02
    beq :+
    jmp absent
:
    lda #0
    sta $df09             ; No REU IRQ during probing
    ldy #0
@read:
    lda #$91
    jsr transfer
    lda value
    sta original,y
    iny
    bne @read
@write:
    sty value
    lda #$90
    jsr transfer
    iny
    bne @write
    lda #$91             ; The last bank mirrored onto bank zero determines size
    jsr transfer
    lda #0
    sec
    sbc value
    sta size
    lda #1
    sbc #0
    sta size+1           ; Number of 64K banks: 256 - marker
@restore:
    lda original,y
    sta value
    lda #$90
    jsr transfer
    iny
    bne @restore
    ; Valid REUs have at least two banks, and a power-of-two size.
    lda size+1
    bne @valid
    lda size
    cmp #2
    bcc @bad
    sec
    sbc #1
    and size
    beq @valid
@bad:
    lda #0
    sta size
    sta size+1
@valid:
    ldx #6
@kb:
    asl size
    rol size+1
    dex
    bne @kb
    ldx #9
@regs:
    lda saved,x
    sta $df01,x
    dex
    bne @regs
    lda saved
    and #$7f             ; Restore command mode without starting DMA
    sta $df01
    plp
    lda size
    ldx size+1
    rts
absent:
    lda saved+1
    sta $df02
    plp
    lda #0
    tax
    rts
transfer:
    pha
    lda #<value
    sta $df02
    lda #>value
    sta $df03
    lda #0
    sta $df04
    sta $df05
    sta $df08
    sta $df0a
    sty $df06
    lda #1
    sta $df07
    pla
    sta $df01
    rts

