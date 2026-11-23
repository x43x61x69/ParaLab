#ifndef PARAMIX_SPECIAL_FOOD_NATIVE_PROFILES_H
#define PARAMIX_SPECIAL_FOOD_NATIVE_PROFILES_H

/* Firmware-family entry points shared with Lab Invite and the native Playdate receiver. */
#if FIRMWARE == 1
#define SAVE_SETTINGS      0x18000ba0
#define CONNECTION_OBJECT  0x18014148
#define HOME_RETURN        0x18001be6
#define TAMA_OFFSET        0x104
#define FIELD_OFFSET       0x1b3
#define GROWTH_STACK       0x90
#define FOOD_ROW           4
#define POLL_LIST          0x10027200
#define ADVANCE_STATE      0x1005c164
#define MEAL_EVENT         0x1005b7b4
#define LOOKUP_ITEM        0x1001e3f8
#define LOOKUP_CHARACTER   0x1001f218
#define PALETTE_SETTINGS   0xe3
#define SET_PALETTE        0x1005c0cc
#define REBUILD_CHARACTER  0x1005668c
#define PLAY_OBJECT       0x1801414cu
#define LINK_OBJECT       0x18013fbcu
#define LEGACY_MODE_WORD  0x10acu
#define NATIVE_SPECIES    0x18000ca4u
#define ALLOCATE_SCENE    0x10016358u
#define LINK_INIT         0x10054ec4u
#define LINK_TRANSMIT     0x10055094u
#define LINK_RECEIVE      0x10055428u
#define LINK_BUSY         0x10054fd4u
#define LINK_RESULT       0x10054f90u
#define PLAY_CALLBACK     0x10076420u
#define TICKS             0x100793eau
#define FLASH_ERASE       0x100788acu
#define FLASH_WRITE       0x10078830u
#define BUTTON_PRESSED    0x10004d98u
#define CLEAR_LAYER       0x10008688u
#define DRAW_PROMPT       0x10020098u
#define REQUEST_SCENE     0x10079430u
#define EXIT_SCENE        0x1005c134u
#define CONNECTION_SCENE  0x70u
#elif FIRMWARE == 4
#define SAVE_SETTINGS      0x18000ba0
#define CONNECTION_OBJECT  0x18014148
#define HOME_RETURN        0x18001be6
#define TAMA_OFFSET        0x108
#define FIELD_OFFSET       0x1b7
#define GROWTH_STACK       0xc0
#define FOOD_ROW           4
#define POLL_LIST          0x10029020
#define ADVANCE_STATE      0x1005f5d0
#define MEAL_EVENT         0x1005ec0c
#define LOOKUP_ITEM        0x1001f73c
#define LOOKUP_CHARACTER   0x1002055c
#define PALETTE_SETTINGS   0xe3
#define SET_PALETTE        0x1005f538
#define REBUILD_CHARACTER  0x10059a08
#define PLAY_OBJECT       0x1801414cu
#define LINK_OBJECT       0x18013fbcu
#define LEGACY_MODE_WORD  0x10acu
#define ALLOCATE_SCENE    0x10016658u
#define LINK_INIT         0x100581e4u
#define LINK_TRANSMIT     0x100583b4u
#define LINK_RECEIVE      0x10058748u
#define LINK_BUSY         0x100582f4u
#define LINK_RESULT       0x100582b0u
#define PLAY_CALLBACK     0x1007a87cu
#define TICKS             0x1007d902u
#define FLASH_ERASE       0x1007cd4cu
#define FLASH_WRITE       0x1007ccd0u
#define BUTTON_PRESSED    0x10004ea4u
#define CLEAR_LAYER       0x10008844u
#define DRAW_PROMPT       0x100213dcu
#define REQUEST_SCENE     0x1007d948u
#define EXIT_SCENE        0x1005f5a0u
#define CONNECTION_SCENE  0x73u
#elif FIRMWARE == 5
#define SAVE_SETTINGS      0x18000be8
#define CONNECTION_OBJECT  0x18014210
#define HOME_RETURN        0x18001c6a
#define TAMA_OFFSET        0x114
#define FIELD_OFFSET       0x1ef
#define GROWTH_STACK       0xc8
#define FOOD_ROW           5
#define POLL_LIST          0x1002d654
#define ADVANCE_STATE      0x1006956c
#define MEAL_EVENT         0x10068aa0
#define LOOKUP_ITEM        0x10022ff0
#define LOOKUP_CHARACTER   0x10023e10
#define PALETTE_SETTINGS   0xef
#define SET_PALETTE        0x100694d4
#define REBUILD_CHARACTER  0x10062678
#define PLAY_OBJECT       0x18014214u
#define LINK_OBJECT       0x1801407cu
#define ALLOCATE_SCENE    0x10018f28u
#define LINK_INIT         0x10060888u
#define LINK_TRANSMIT     0x10060c70u
#define LINK_RECEIVE      0x100610bcu
#define LINK_BUSY         0x100609c8u
#define LINK_RESULT       0x10060984u
#define PLAY_CALLBACK     0x1008d7b0u
#define TICKS             0x10018e2cu
#define FLASH_ERASE       0x100900a0u
#define FLASH_WRITE       0x10090024u
#define BUTTON_PRESSED    0x10005ea8u
#define CLEAR_LAYER       0x1000a084u
#define DRAW_PROMPT       0x1002505cu
#define REQUEST_SCENE     0x100028ccu
#define EXIT_SCENE        0x1006953cu
#define CONNECTION_SCENE  0x77u
#else
#error Unsupported firmware family
#endif

#endif
