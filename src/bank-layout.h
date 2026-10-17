/* ROMH-only window: 16K cartridge mode with $01=$36 leaves $8000 RAM.
 * Include once, from the main translation unit. See EASYFLASH.md. */
#pragma section(edit_code, 0)
#pragma section(edit_data, 0)
#pragma region(edit_bank, 0xa000, 0xc000, , 5, {edit_code, edit_data})
#pragma section(fileutil_code, 0)
#pragma section(fileutil_data, 0)
#pragma region(fileutil_bank, 0xa000, 0xc000, , 6, {fileutil_code, fileutil_data})
#pragma section(filemgmt_code, 0)
#pragma section(filemgmt_data, 0)
#pragma region(filemgmt_bank, 0xa000, 0xc000, , 7, {filemgmt_code, filemgmt_data})
#pragma section(disk_code, 0)
#pragma section(disk_data, 0)
#pragma region(disk_bank, 0xa000, 0xc000, , 8, {disk_code, disk_data})
#pragma section(boot_code, 0)
#pragma section(boot_data, 0)
#pragma region(boot_bank, 0xa000, 0xc000, , 9, {boot_code, boot_data})

#pragma section(storage_code, 0)
#pragma section(storage_data, 0)
#pragma region(storage_bank, 0xa000, 0xc000, , 12, {storage_code, storage_data})

#pragma section(nav_code, 0)
#pragma section(nav_data, 0)
#pragma region(nav_bank, 0xa000, 0xc000, , 13, {nav_code, nav_data})

#pragma section(transfer_code, 0)
#pragma section(transfer_data, 0)
#pragma region(transfer_bank, 0xa000, 0xc000, , 14, {transfer_code, transfer_data})
