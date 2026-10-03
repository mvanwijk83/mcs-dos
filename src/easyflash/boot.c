#pragma section(startup, 0)
#pragma region(startup, 0xe000, 0xfffa, , , {startup})
#pragma optimize(noasm)
__asm startup {
// $E000 is an RTI for the early interrupt vectors; reset enters at $E001.
interrupt:
 rti
boot:
 sei
 cld
 ldx #0xff
 txs
 lda #0x37
 sta 1
 lda #0x2f
 sta 0
 ldx #0
copy:
 lda bytes,x
 sta 0x0334,x
 inx
 cpx #8
 bne copy
 jmp 0x0334
bytes:
 byt 0xa9,7,0x8d,2,0xde,0x4c,0,0x80
}
#pragma startup(startup)
#pragma section(vectors, 0)
#pragma region(vectors, 0xfffa, 0x10000, , , {vectors})
#pragma data(vectors)
__export const unsigned char vectors[] = {0, 0xe0, 1, 0xe0, 0, 0xe0};
