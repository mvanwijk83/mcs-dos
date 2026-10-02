/* Execute a contiguous flash file after the shell itself may be overwritten.
 * Parameters: $F7/$F8 length; $FB/$FC source; $FD/$FE destination;
 * $02A0 bank, $02A1 source base high, $02A2 absolute flag, $02A3/4 entry. */
#pragma section(startup, 0)
#pragma region(startup,0x0334,0x03e0,,, {startup})
#pragma optimize(noasm)
__asm startup {
 sei
 lda #0x37
 sta 1
 jsr 0xc003 // initialize BASIC and install automatic shell return
 lda 0x02a0
 sta 0xde00
 lda #7
 sta 0xde02
 ldy #0
copy:
 lda 0xf7
 ora 0xf8
 beq finish
 lda (0xfb),y
 // Destination writes must reach RAM even when crossing $D000-$DFFF.
 // Read the cartridge with ROM/I/O visible, hide both for the store.
 tax
 lda #0x34
 sta 1
 txa
 sta (0xfd),y
 lda #0x37
 sta 1
 inc 0xfd
 bne source
 inc 0xfe
source:
 inc 0xfb
 bne length
 inc 0xfc
 lda 0xfc
 and #31
 bne length
 inc 0x02a0
 lda 0x02a0
 sta 0xde00
 lda 0x02a1
 sta 0xfc
length:
 lda 0xf7
 bne low
 dec 0xf8
low:
 dec 0xf7
 jmp copy
finish:
 lda #4
 sta 0xde02
 lda 0xfd
 sta 0x2d
 lda 0xfe
 sta 0x2e
 cli
 lda 0x02a2
 beq basic
 jmp (0x02a3)
basic:
 jsr 0xa659
 jsr 0xa533
 jmp 0xa7ae
}
#pragma startup(startup)
