/* RAM-only gates: the tape decoder and buffer reads must see RAM underneath
 * both cartridge windows. FS indexes occupy $C200..$C2FF; never touch them.
 * Parameters at $C600: start word, end word, carry result, copy count.
 * The copy gate transfers up to 120 bytes into the filesystem mailbox. */
#pragma section(startup, 0)
#pragma region(startup,0xc300,0xc600,,, {startup})
#pragma optimize(noasm)
__asm startup {
 jmp read
 jmp copy
 jmp finish
read:
 lda #4
 sta 0xde02
 lda #0x36
 sta 1
play:
 lda #16
 bit 1
 beq ready
 jsr 0xffe1
 bne play
 lda #1
 sta 0xc604
 jmp mapped
ready:
 lda #0
 sta 0x90
 sta 0x93
 sta 0x9d
 lda 0xc600
 sta 0xc1
 lda 0xc601
 sta 0xc2
 lda 0xc602
 sta 0xae
 lda 0xc603
 sta 0xaf
 jsr 0xf84a
 lda #0
 rol
 sta 0xc604
 jmp mapped
copy:
 php
 sei
 lda 0xfb
 pha
 lda 0xfc
 pha
 lda #4
 sta 0xde02
 lda 0xc600
 sta 0xfb
 lda 0xc601
 sta 0xfc
 ldy #0
bytes:
 lda (0xfb),y
 sta 0x0808,y
 iny
 cpy 0xc605
 bne bytes
 pla
 sta 0xfc
 pla
 sta 0xfb
 jsr mapped
 plp
 rts
mapped:
 lda #11
 sta 0xde00
 lda #7
 sta 0xde02
 lda #0x36
 sta 1
 rts
finish:
 sei
 cld
 ldx #0xff
 txs
 lda #0x54
 sta 0xc1e0
 jsr 0xffcc
 jsr 0xffe7
 jsr 0xff84
 jsr 0xff8a
 jsr 0xff81
 lda #0x37
 sta 1
 lda #0
 sta 0xde00
 lda #7
 sta 0xde02
 ldx #0
loader:
 lda 0x9000,x
 sta 0x0334,x
 inx
 cpx 0x90ff
 bne loader
 jmp 0x0334
}
#pragma startup(startup)
