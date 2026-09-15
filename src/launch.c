// Cassette-buffer launch code, assembled without a C runtime.
// /A loads at the requested address and jumps; otherwise prepare BASIC and RUN.
#pragma section(startup, 0)
#pragma optimize(noasm)
__asm startup {
loader:
    lda #0x37
    sta 0x01
    cli
    jsr 0xffcc
    jsr 0xffe7
    jsr 0xe453 // initialize BASIC vectors
    jsr 0xe3bf // initialize BASIC RAM
len: lda #0
    ldx #0xe0
    ldy #0x03
    jsr 0xffbd
    lda #1
dev: ldx #8
secondary: ldy #1
    jsr 0xffba
addresslo: ldx #1
addresshi: ldy #8
    lda #0
    jsr 0xffd5
    bcs error
    stx 0x2d
    sty 0x2e
absolute: lda #0
    beq basic
jump: jmp 0xffff
basic:
    jsr 0xa659 // CLR: initialize variables and stack
    jsr 0xa533 // relink BASIC program lines
    jmp 0xa7ae // RUN
error:
    ldx #0
    jmp 0xa474 // BASIC error / ready
loader_end:
}
#pragma startup(startup)
#pragma region(startup, 0x0334, 0x03e0, , , {startup})
// Build metadata only: make-hardware.js reads these addresses and discards
// this table and the padding. Only loader through loader_end reaches the C64.
#pragma section(patches, 0)
#pragma data(patches)
#pragma region(patches, 0x0400, 0x0420, , , {patches})
__export const void * const patches[] = {
 startup.loader_end, startup.len, startup.dev, startup.absolute,
 startup.secondary, startup.addresslo, startup.addresshi, startup.jump
};
