/* Mailbox shared by the My Lab Flash Tool and the cold boot hook. The hook
 * consumes ARMED before attempting to load the tool, so it cannot loop. */
#define SD_RESET_BOX 0x20000FA0
#define SD_RESET_ARMED 0x44534D50
#define SD_RESET_DELIVERED 0xBBACB2AF

#define SD_PHASE_TICK 1
#define SD_PHASE_XIP 2
#define SD_PHASE_CARD 3
#define SD_PHASE_CAPACITY 4
#define SD_PHASE_FILESYSTEM 5
#define SD_PHASE_DIRECTORY 6
#define SD_PHASE_BACKUP 7
