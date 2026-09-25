/* Fixed low-RAM jump table. Installed after the shell payload is copied.
 * Save Oscar64's register workspace across the separately linked ROM driver. */
#pragma section(startup, 0)
#pragma region(startup, 0x0880, 0x0a00, , , {startup})
#pragma optimize(noasm)
__asm startup {
 jmp dispatch
 jmp read
 jmp write
 jmp erase
 jmp init
dispatch:
 php
 sei
 cld
 ldx #2
save:
 lda 0,x
 pha
 inx
 cpx #0x90
 bne save
 lda #0
 sta 0x23
 lda #0xc7
 sta 0x24
 lda #0x37
 sta 1
 lda #7
 sta 0xde02
 lda #4
 sta 0xde00
 jsr 0x8000
 lda 0x07f5
 cmp #0xff
 beq unbanked
 sta 0xde00
 lda #0x36
 sta 1
 jmp registers
unbanked:
 lda #4
 sta 0xde02
 lda #0x36
 sta 1
registers:
 ldx #0x8f
restore:
 pla
 sta 0,x
 dex
 cpx #1
 bne restore
 plp
 rts
read:
 lda 0x07f0
 sta 0xde00
 lda 0xfb
 pha
 lda 0xfc
 pha
 lda 0x07f1
 sta 0xfb
 lda 0x07f2
 sta 0xfc
 ldy #0
 lda (0xfb),y
 sta 0x07f3
 pla
 sta 0xfc
 pla
 sta 0xfb
 jmp done
write:
 lda 0x07f0
 jsr 0xdf86
 lda 0x07f2
 cmp #0xa0
 bcc low
 clc
 adc #0x40
low:
 tay
 ldx 0x07f1
 lda 0x07f3
 jsr 0xdf80
 jmp result
erase:
 lda #56
 ldy 0x07f2
 jsr 0xdf83
 jmp result
init:
 lda #0
 sta 0xde00
 ldx #0
copy:
 lda 0xb800,x
 sta 0x0400,x
 lda 0xb900,x
 sta 0x0500,x
 lda 0xba00,x
 sta 0x0600,x
 inx
 bne copy
 jsr 0x0414
result:
 lda #0
 rol
 sta 0x07f4
done:
 lda #4
 sta 0xde00
 rts
}
#pragma startup(startup)
