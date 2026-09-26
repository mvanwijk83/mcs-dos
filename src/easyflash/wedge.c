/* BASIC-only RAM code. The shell installs it after its final flash call.
 * $C1E0..$C1FF is the handoff descriptor, outside this executable image. */
#pragma section(startup,0)
#pragma region(startup,0xc000,0xc1e0,,, {startup})
#pragma optimize(noasm)
__asm startup {
 sei
 cld
 ldx #0xff
 txs
 lda #4
 sta 0xde02
 lda #0x37
 sta 1
 jsr 0xffcc
 jsr 0xffe7
 jsr 0xff84
 // Clear the shell's zero-page/editor workspace before BASIC initializes it.
 jsr 0xff87
 jsr 0xff8a
 jsr 0xff81
 lda #0
 sta 0x0281
 sta 0x0283
 sta 0x0291
 sta 0xc6
 sta 0xcc
 sta 0xcf
 sta 0xc7
 sta 0xd015
 lda #8
 sta 0x0282
 lda #0xa0
 sta 0x0284
 jsr 0xe453
 jsr 0xe3bf
 jsr 0xa644
 lda 0x0308
 sta old
 lda 0x0309
 sta old+1
 lda #<hook
 sta 0x0308
 lda #>hook
 sta 0x0309
 lda 0xc1f0
 sta 0x0286
 lda 0xc1f1
 sta 0xd021
 lda 0xc1f2
 sta 0xd020
 lda #0x8e
 jsr 0xffd2
 lda #0x93
 jsr 0xffd2
 ldx #0
message:
 lda text,x
 beq ready
 jsr 0xffd2
 inx
 bne message
ready:
 cli
 jmp 0xa474
hook:
 php
 pha
 txa
 pha
 tya
 pha
 lda 0x3a
 cmp #0xff
 bne chain
 ldy #1
spaces:
 lda (0x7a),y
 cmp #32
 bne match
 iny
 bne spaces
match:
 ldx #0
letters:
 lda (0x7a),y
 cmp shell,x
 bne chain
 iny
 inx
 cpx #5
 bne letters
tail:
 lda (0x7a),y
 beq resume
 cmp #32
 bne chain
 iny
 bne tail
chain:
 pla
 tay
 pla
 tax
 pla
 plp
 jmp (old)
resume:
 sei
 cld
 ldx #0xff
 txs
 lda #0xa5
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
copy:
 lda 0x9000,x
 sta 0x0334,x
 inx
 cpx 0x90ff
 bne copy
 jmp 0x0334
old:
 byt 0,0
shell:
 byt 83,72,69,76,76
text:
 byt 67,79,77,77,79,68,79,82,69,32,54,52,32,66,65,83,73,67,32,86,50,13,51,56,57,49,49,32,66,65,83,73,67,32,66,89,84,69,83,32,70,82,69,69,13,13
 byt 84,89,80,69,32,39,83,72,69,76,76,39,32,84,79,32,82,69,84,85,82,78,32,84,79,32,77,67,83,45,68,79,83,13,0
}
#pragma startup(startup)
