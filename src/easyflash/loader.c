#pragma section(startup, 0)
#pragma region(startup, 0x0334, 0x03e0, , , {startup})
#pragma optimize(noasm)
__asm startup {
 sei
 lda #0
 sta 0xba
 lda #1
 sta 0xfb
 lda #8
 sta 0xfc
 lda #0
 sta 0xfd
 lda #0x80
 sta 0xfe
 lda #1
 sta 0xde00
 sta 0x02
 lda #7
 sta 0xde02
 ldx #PAYLOAD_PAGES
 ldy #0
copy:
 lda (0xfd),y
 sta (0xfb),y
 iny
 bne copy
 inc 0xfc
 inc 0xfe
 lda 0xfe
 cmp #0xc0
 bne next
 lda #0x80
 sta 0xfe
 inc 0x02
 lda 0x02
 sta 0xde00
next:
 dex
 bne copy
 lda #0
 sta 0xde00
 ldx #0
bridge:
 lda 0xb000,x
 sta 0x0880,x
 inx
 cpx #BRIDGE_LENGTH
 bne bridge
 lda #4
 sta 0xde02
 lda #0x36
 sta 1
 // RAMTAS ran with cartridge ROM visible at $8000. Once it is hidden,
 // BASIC has its normal RAM up to $A000, including on a later handoff.
 lda #0
 sta 0x0283
 lda #0xa0
 sta 0x0284
 cli
 jsr PAYLOAD_ENTRY
 lda #0x37
 sta 1
 jmp 0xa474
}
#pragma startup(startup)
