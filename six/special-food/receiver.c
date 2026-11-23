/* Special Food receiver for the three legacy firmware families. */
#include <stdint.h>
#include "../my-lab/ghost_codec.h"
#include "native-profiles.h"

#define GAME(type, address) ((type)((address) | 1u))
#define ENTRY __attribute__((section(".text.entry")))
#define SCENE (*(uint8_t *volatile *)PLAY_OBJECT)
#define LINK (*(uint8_t *volatile *)LINK_OBJECT)
#define FOOD_STAGE 0x60d13000u
#define ARCHIVE_SIZE 0x4000u
#define REQUEST_SIZE 0x1b008u
#define REPLY_SIZE 0x1f002u
#define ARCHIVE_MAGIC 0x32435241u
#define FOOD_BANK_BASE 0x60eb0000u
#define FOOD_BANK_SIZE 0x20000u
#define FOOD_HEADER 0x1f000u
#define FOOD_MAGIC 0x31444653u
#define SETTINGS ((volatile uint8_t *)SAVE_SETTINGS)
#define STRING_EXPAND(x) #x
#define STRING(x) STRING_EXPAND(x)
#define RELEASE_ROW (FOOD_ROW + 1)
#define MENU_ROWS (RELEASE_ROW + 1)
#define FOOD_MODE 2
#define FEED_MODE 3

enum Phase { SENDING_REQUEST, WAITING_FOR_REPLY, RECEIVING_REPLY, CHOOSING, SENDING_DECISION };
enum LinkEvent { SEND_CHUNK = 1, RECEIVE_CHUNK = 4 };

struct Transfer {
    uint32_t due;
    uint32_t offset;
    uint32_t archive_end;
    uint32_t checksum;
    uint32_t sum;
    uint16_t species;
    uint16_t simulation;
    uint16_t decision;
    uint8_t phase;
    uint8_t pages;
    uint8_t release_buttons;
    uint8_t archive_ok;
    uint32_t bank;
    uint32_t serial;
    uint32_t ghost_length;
    uint32_t ghost_checksum;
    uint32_t ghost_sum;
};

struct Chunk {
    uint32_t flags;
    uint8_t *bytes;
    uint32_t length;
    uint32_t offset;
};

int release_initialize(unsigned mode, void *callback);
int release_send(unsigned length);
int release_poll(uint16_t *status);
void *release_draw(void *list, void *item, unsigned mode, unsigned flags, unsigned text);
int release_confirm(unsigned key);
static unsigned stage_now(void);
static uint32_t active_food_bank(void);
static const uint8_t *available_food(uint32_t bank);

// Keep the arguments already laid out on the caller's stack for the list constructor.
ENTRY __attribute__((naked)) void connection_rows(void) {
    __asm__ volatile (
        "ldr r3, [sp, #4]\n"
        "movw r2, #0x6fe3\n"
        "str r2, [r3, #(" STRING(FOOD_ROW) " * 12 + 0)]\n"
        "movs r2, #0\n"
        "str r2, [r3, #(" STRING(FOOD_ROW) " * 12 + 4)]\n"
        "str r2, [r3, #(" STRING(FOOD_ROW) " * 12 + 8)]\n"
        "movw r2, #0x6fe4\n"
        "str r2, [r3, #(" STRING(RELEASE_ROW) " * 12 + 0)]\n"
        "movs r2, #0\n"
        "str r2, [r3, #(" STRING(RELEASE_ROW) " * 12 + 4)]\n"
        "str r2, [r3, #(" STRING(RELEASE_ROW) " * 12 + 8)]\n"
        "movs r3, #" STRING(MENU_ROWS) "\n"
        "str r3, [sp]\n"
        "movs r3, #0\n"
        "b.w list_constructor\n");
}

ENTRY int connection_choice(void *menu, int16_t *choice) {
    int selected = GAME(int (*)(void *, int16_t *), POLL_LIST)(menu, choice);
    if (!selected || !choice || (*choice != FOOD_ROW && *choice != RELEASE_ROW)) return selected;
    void *connection = *(void *volatile *)CONNECTION_OBJECT;
    const unsigned stage = stage_now();
    unsigned mode = *choice == RELEASE_ROW ? 1 : FOOD_MODE;
    if (mode == FOOD_MODE && (stage == 3 || stage == 4) && available_food(active_food_bank())) mode = FEED_MODE;
    else if (stage != 5) {
        GAME(void (*)(void *, unsigned), ADVANCE_STATE)(connection, 1000);
        return 0;
    }
    SCENE = (void *)mode;
    GAME(void (*)(unsigned), REQUEST_SCENE)(CONNECTION_SCENE + 1);
    GAME(void (*)(void *, unsigned), EXIT_SCENE)(connection, 0x7fe0);
    return 0;
}

ENTRY void *food_dialog(void *list, void *item, unsigned mode, unsigned flags, unsigned text) {
    unsigned label;
    switch (SCENE[0x9c]) {
        case FOOD_MODE: __asm__ volatile ("movw %0, #0x6fe6" : "=r"(label)); break;
        case FEED_MODE: __asm__ volatile ("movw %0, #0x6fe7" : "=r"(label)); break;
        default: return release_draw(list, item, mode, flags, text);
    }
    return GAME(void *(*)(void *, void *, unsigned, unsigned, unsigned), DRAW_PROMPT)(list, item, mode, flags, label);
}


static uint16_t read16(const uint8_t *bytes) {
    return (uint16_t)(bytes[0] | (uint16_t)bytes[1] << 8);
}

static uint32_t read32(const uint8_t *bytes) {
    return read16(bytes) | (uint32_t)read16(bytes + 2) << 16;
}

struct FoodHeader {
    uint32_t magic;
    uint32_t serial;
    uint32_t serial_complement;
    uint32_t archive_length;
    uint32_t ghost_length;
    uint32_t progress;
};

enum { FED_KID = 1, FED_YOUNG = 2, RETIRED = 4 };

static const volatile struct FoodHeader *food_header(uint32_t bank) {
    return (const volatile struct FoodHeader *)(bank + FOOD_HEADER);
}

static unsigned food_valid(uint32_t bank) {
    const volatile struct FoodHeader *header = food_header(bank);
    return header->magic == FOOD_MAGIC && header->serial == ~header->serial_complement &&
        header->archive_length >= 64 && header->archive_length <= ARCHIVE_SIZE &&
        header->ghost_length >= LAB_POSES && header->ghost_length <= LAB_GHOST_SIZE;
}

static uint32_t active_food_bank(void) {
    const uint32_t first = FOOD_BANK_BASE, second = first + FOOD_BANK_SIZE;
    if (!food_valid(second)) return food_valid(first) ? first : 0;
    if (!food_valid(first)) return second;
    return (int32_t)(food_header(second)->serial - food_header(first)->serial) > 0 ? second : first;
}

static void erase_food(uint32_t address) {
    GAME(void (*)(uint32_t, unsigned), FLASH_ERASE)(address, 4096);
}

static void write_food(uint32_t address, const void *bytes, unsigned size) {
    GAME(void (*)(uint32_t, const void *, unsigned), FLASH_WRITE)(address, bytes, size);
}

static void erase_payload(uint32_t bank, unsigned archive_length, unsigned ghost_length) {
    if (bank != FOOD_BANK_BASE && bank != FOOD_BANK_BASE + FOOD_BANK_SIZE) return;
    if (archive_length > ARCHIVE_SIZE) archive_length = ARCHIVE_SIZE;
    if (ghost_length > LAB_GHOST_SIZE) ghost_length = LAB_GHOST_SIZE;
    for (unsigned i = 0; i < archive_length; i += 4096) erase_food(bank + i);
    for (unsigned i = 0; i < ghost_length; i += 4096) erase_food(bank + ARCHIVE_SIZE + i);
}

static void prepare_food(struct Transfer *transfer) {
    const uint32_t active = active_food_bank();
    transfer->bank = active == FOOD_BANK_BASE ? active + FOOD_BANK_SIZE : FOOD_BANK_BASE;
    transfer->serial = active ? food_header(active)->serial + 1u : 1u;
    erase_food(transfer->bank + FOOD_HEADER);
}

static void receive_ghost(struct Transfer *transfer, const uint8_t *bytes, unsigned offset, unsigned count) {
    if (offset == ARCHIVE_SIZE) {
        const uint32_t length = read32(bytes + 0x10c);
        const uint32_t checksum = read32(bytes);
        if (length < LAB_POSES || length > LAB_GHOST_SIZE || length % 4 || checksum + read32(bytes + 4)) return;
        transfer->ghost_length = length;
        transfer->ghost_checksum = checksum;
    }
    unsigned start = offset - ARCHIVE_SIZE;
    if (start >= transfer->ghost_length) return;
    unsigned keep = transfer->ghost_length - start;
    if (keep > count) keep = count;
    for (unsigned i = start == 0 ? 8 : 0; i < keep; i += 4) transfer->ghost_sum += read32(bytes + i);
    erase_food(transfer->bank + offset);
    write_food(transfer->bank + offset, bytes, keep);
}

static unsigned commit_food(struct Transfer *transfer) {
    const uint32_t bank = transfer->bank;
    if (bank != FOOD_BANK_BASE && bank != FOOD_BANK_BASE + FOOD_BANK_SIZE) return 0;
    const uint8_t *archive = (const uint8_t *)bank;
    const uint32_t archive_length = read32(archive + 8) + 16;
    const uint32_t ghost_length = read32(archive + ARCHIVE_SIZE + 0x10c);
    if (archive_length < 64 || archive_length > ARCHIVE_SIZE || ghost_length < LAB_POSES || ghost_length > LAB_GHOST_SIZE)
        return 0;
    const uint32_t previous = active_food_bank();
    struct FoodHeader header = {
        FOOD_MAGIC, transfer->serial, ~transfer->serial, archive_length, ghost_length, UINT32_MAX
    };
    write_food(bank + FOOD_HEADER, &header, sizeof(header));
    if (!food_valid(bank)) return 0;
    if (previous) {
        const volatile struct FoodHeader *old = food_header(previous);
        unsigned archive_length = old->archive_length, ghost_length = old->ghost_length;
        erase_food(previous + FOOD_HEADER);
        erase_payload(previous, archive_length, ghost_length);
    }
    return 1;
}

static unsigned stage_now(void) {
    return (SETTINGS[TAMA_OFFSET + 0x14] >> 2) & 7;
}

static const uint8_t *stored_food_item(uint32_t bank, unsigned archive_length) {
    const uint8_t *arc = (const uint8_t *)bank;
    const unsigned offset = read32(arc + 20), length = read32(arc + 24);
    if (offset < 64 || offset > archive_length || length < 46 || length > archive_length - offset || read32(arc + 16)) return 0;
    const uint8_t *pack = arc + offset;
    const uint32_t start = read32(pack + 40);
    if (start < 23 || start > (length - 46) / 2 || read32(pack + 44) != start + 23) return 0;
    const uint8_t *item = pack + 2 * start;
    unsigned id = read16(item);
    return id >= 0xfe80 && id < 0xff00 && read16(item + 22) == 1 && read16(item + 44) == 8 ? item : 0;
}

static const uint8_t *available_food(uint32_t bank) {
    if (!bank || !(food_header(bank)->progress & RETIRED)) return 0;
    return stored_food_item(bank, food_header(bank)->archive_length);
}

static unsigned mapped_adult(unsigned species) {
    extern const uint16_t special_food_targets[] __attribute__((visibility("hidden")));
    for (const uint16_t *entry = special_food_targets; *entry != 0xffff; entry += 2) {
        if (entry[0] == species) return entry[1];
    }
    return 0;
}

static void update_progress(uint32_t bank, uint32_t bit) {
    const volatile struct FoodHeader *header = food_header(bank);
    uint32_t progress = header->progress & ~bit;
    if (progress == header->progress) return;
    write_food((uint32_t)&header->progress, &progress, sizeof(progress));
}

ENTRY int food_confirmation(unsigned key) {
    if (SCENE[0x9c] != FEED_MODE) return release_confirm(key);
    if (!GAME(int (*)(unsigned), BUTTON_PRESSED)(key)) return 0;
    const uint32_t bank = active_food_bank();
    const uint8_t *item = available_food(bank);
    const unsigned stage = stage_now();
    if (item && (stage == 3 || stage == 4)) {
        GAME(void (*)(unsigned, unsigned), MEAL_EVENT)(4, read16(item));
        update_progress(bank, stage == 3 ? FED_KID : FED_YOUNG);
        GAME(void (*)(unsigned), REQUEST_SCENE)(28);
    } else {
        GAME(void (*)(unsigned), REQUEST_SCENE)(CONNECTION_SCENE);
    }
    GAME(void (*)(void *, unsigned), EXIT_SCENE)(SCENE, 0x7fe0);
    return 0;
}

ENTRY const uint8_t *food_item(unsigned id) {
    if (id >= 0xfe80 && id < 0xff00) {
        const uint8_t *item = available_food(active_food_bank());
        if (item && read16(item) == id) return item;
    }
    return GAME(const uint8_t *(*)(unsigned), LOOKUP_ITEM)(id);
}

unsigned special_adult(unsigned ordinary) {
    if (stage_now() != 5) return ordinary;
    const uint32_t bank = active_food_bank();
    if (!bank || food_header(bank)->progress & (FED_KID | FED_YOUNG) || !(food_header(bank)->progress & RETIRED))
        return ordinary;
    const uint8_t *ghost = (const uint8_t *)(bank + ARCHIVE_SIZE);
    const unsigned field = read16(ghost + 0x100);
    static const uint8_t habitat[] = {0xff, 0, 1, 2, 2, 0, 1, 0, 1, 2};
    if (field < 1 || field > 9 || habitat[field] != SETTINGS[FIELD_OFFSET]) return ordinary;
    const unsigned species = mapped_adult(read16(ghost + 0x10a));
    return species ? species : ordinary;
}

ENTRY __attribute__((naked)) void select_adult(void) {
    __asm__ volatile (
        "push {r0, r2, r3, lr}\n"
        "movs r0, #0\n"
        "bl special_adult\n"
        "cbz r0, 1f\n"
        "strh.w r0, [sp, #(" STRING(GROWTH_STACK) " + 16)]\n"
        "mov r1, r0\n"
        "pop {r0, r2, r3, pc}\n"
        "1: pop.w {r0, r2, r3, lr}\n"
        "b.w ordinary_growth\n");
}

ENTRY void rebuild_food_appearance(void) {
    const unsigned species = *(volatile uint16_t *)(SETTINGS + TAMA_OFFSET);
    if (special_adult(0) == species && species != 0) {
        const uint8_t *ghost = (const uint8_t *)(active_food_bank() + ARCHIVE_SIZE);
        unsigned eyes = read16(ghost + 0x0e);
        unsigned mapped_eyes = mapped_adult(eyes);
        if (mapped_eyes) eyes = mapped_eyes;
        if (eyes >= 4000 && eyes < 9000) {
            const uint8_t *character = GAME(const uint8_t *(*)(unsigned), LOOKUP_CHARACTER)(eyes);
            if (character && read16(character + 6) == 5) *(volatile uint16_t *)(SETTINGS + TAMA_OFFSET + 2) = (uint16_t)eyes;
        }
        unsigned palette = ghost[0x10] & 31;
        SETTINGS[TAMA_OFFSET + 0x15] = (SETTINGS[TAMA_OFFSET + 0x15] & 0xe0) | palette;
        if (palette < 31) GAME(void (*)(volatile uint8_t *, unsigned, unsigned), SET_PALETTE)(SETTINGS + PALETTE_SETTINGS, palette, 2);
    }
    GAME(void (*)(void), REBUILD_CHARACTER)();
}

void original_new_egg(unsigned from);

ENTRY void ordinary_new_egg(unsigned from) {
    const uint32_t bank = active_food_bank();
    if (bank) update_progress(bank, RETIRED);
    original_new_egg(from);
}

static struct Transfer *state(void) {
    return (struct Transfer *)(SCENE + 0xa0);
}

ENTRY void *allocate_probe(unsigned bytes, unsigned pool) {
    unsigned special_food = SCENE == (void *)FOOD_MODE ? FOOD_MODE : 0;
    if (SCENE == (void *)1u) special_food = 1;
    if (SCENE == (void *)FEED_MODE) special_food = FEED_MODE;
    uint8_t *scene = GAME(void *(*)(unsigned, unsigned), ALLOCATE_SCENE)(bytes + 4 + sizeof(struct Transfer), pool);
    if (scene) {
        scene[bytes] = special_food;
        scene[bytes + 1] = scene[bytes + 2] = scene[bytes + 3] = 0;
        for (unsigned i = 0; i < sizeof(struct Transfer); ++i) scene[bytes + 4 + i] = 0;
    }
    return scene;
}

static unsigned receive(struct Transfer *transfer, const struct Chunk *chunk) {
    const uint8_t *bytes = chunk->bytes;
    const unsigned offset = chunk->offset, count = chunk->length;
    if (offset != transfer->offset || offset >= REPLY_SIZE) return 3;
    const unsigned remaining = REPLY_SIZE - offset;
    if (count != (remaining < 4096 ? remaining : 4096)) return 3;
    if (offset == 0) {
        const uint32_t length = read32(bytes + 8);
        // A zero magic is the native no-food response. Consume it and decline.
        if (read32(bytes) == ARCHIVE_MAGIC && length >= 48 && length <= ARCHIVE_SIZE - 16 && read32(bytes + 12) == 3) {
            transfer->archive_end = length + 16;
            transfer->checksum = read32(bytes + 4);
            for (unsigned i = 0; i < 3; ++i) {
                const uint8_t *entry = bytes + 16 + i * 16;
                const uint32_t start = read32(entry + 4), size = read32(entry + 8);
                if (start < 64 || start > transfer->archive_end || size > transfer->archive_end - start) {
                    transfer->archive_end = 0;
                    break;
                }
            }
        }
        if (transfer->archive_end) prepare_food(transfer);
    }
    if (offset < transfer->archive_end) {
        unsigned keep = transfer->archive_end - offset;
        if (keep > count) keep = count;
        for (unsigned i = offset == 0 ? 8 : 0; i < keep; ++i) transfer->sum += bytes[i];
        erase_food(transfer->bank + offset);
        write_food(transfer->bank + offset, bytes, keep);
    }
    if (offset == ARCHIVE_SIZE) transfer->species = read16(bytes + 0x10a);
    if (transfer->bank && offset >= ARCHIVE_SIZE && offset < REPLY_SIZE - 2)
        receive_ghost(transfer, bytes, offset, count);
    if (offset == REPLY_SIZE - 2) {
        transfer->simulation = read16(bytes);
        transfer->archive_ok = transfer->archive_end && transfer->sum == transfer->checksum;
        transfer->archive_ok = transfer->archive_ok && transfer->ghost_length &&
            transfer->ghost_sum == transfer->ghost_checksum && mapped_adult(transfer->species) &&
            stored_food_item(transfer->bank, transfer->archive_end);
    }
    transfer->offset += count;
    return 0;
}

static unsigned food_callback(unsigned event, struct Chunk *chunk) {
    struct Transfer *transfer = state();
    if (event == SEND_CHUNK && transfer->phase == SENDING_REQUEST && SCENE[0x40] == 1) {
        if (chunk->offset == 0x1b000u && chunk->length == 8) {
            // Match the request footer captured from an adult Neon with all worlds available.
            const uint8_t footer[8] = {4, 0, 0, 0, 0x80, 3, 0, 0};
            for (unsigned i = 0; i < sizeof footer; ++i) chunk->bytes[i] = footer[i];
            return 0;
        }
        unsigned species = 0;
#ifdef NATIVE_SPECIES
        species = *(volatile const uint16_t *)NATIVE_SPECIES;
#endif
        int converted = ghost_convert((const uint8_t *)0x60e66000u, chunk->bytes, chunk->offset,
                                      chunk->length, species, &transfer->pages);
        if (converted != GHOST_NATIVE) return converted == GHOST_CONVERTED ? 0 : 3;
    }
    if (event == RECEIVE_CHUNK) {
        if (transfer->phase != RECEIVING_REPLY) return 3;
        return receive(transfer, chunk);
    }
    return GAME(unsigned (*)(unsigned, struct Chunk *), PLAY_CALLBACK)(event, chunk);
}

ENTRY int initialize_probe(unsigned mode, void *callback) {
    if (SCENE[0x9c] == FOOD_MODE) {
        mode = FIRMWARE == 5 ? 5 : 0x25;
        callback = food_callback;
    }
    else return release_initialize(mode, callback);
    return GAME(int (*)(unsigned, void *), LINK_INIT)(mode, callback);
}

ENTRY int send_probe(unsigned length) {
    if (SCENE[0x9c] == FOOD_MODE) length = REQUEST_SIZE;
    else return release_send(length);
    return GAME(int (*)(unsigned), LINK_TRANSMIT)(length);
}

static int expired(uint32_t now, uint32_t due) {
    return (int32_t)(now - due) >= 0;
}

static void prompt(unsigned text) {
    void *list = *(void **)(SCENE + 0x18);
    GAME(void (*)(void *), CLEAR_LAYER)(list);
    *(void **)(SCENE + 0x20) = GAME(void *(*)(void *, void *, unsigned, unsigned, unsigned), DRAW_PROMPT)
        (list, 0, 0, 0, text);
}

ENTRY int poll_probe(uint16_t *status) {
    int (*const done)(uint16_t *) = GAME(int (*)(uint16_t *), LINK_RESULT);
    if (SCENE[0x9c] != FOOD_MODE) {
        return release_poll(status);
    }
    struct Transfer *transfer = state();
    if (!LINK) { *status = 1; return 1; }
    uint32_t now = GAME(uint32_t (*)(void), TICKS)();
    if (transfer->phase == SENDING_REQUEST) {
        if (!done(status)) return 0;
        if (*status) return 1;
        transfer->phase = WAITING_FOR_REPLY;
        transfer->due = now + 20000;
    }
    if (transfer->phase == WAITING_FOR_REPLY) {
        if (GAME(int (*)(void), LINK_BUSY)()) {
#ifdef LEGACY_MODE_WORD
            // The older receiver compares the incoming low nibble with the full mode word.
            *(volatile uint16_t *)(LINK + LEGACY_MODE_WORD) = 5;
#endif
            GAME(void (*)(void), LINK_RECEIVE)();
            transfer->phase = RECEIVING_REPLY;
        } else if (expired(now, transfer->due)) { *status = 1; return 1; }
        return 0;
    }
    if (transfer->phase == RECEIVING_REPLY) {
        if (!done(status)) return 0;
        if (*status) return 1;
        transfer->phase = CHOOSING;
        transfer->due = now + 30000;
        if (transfer->archive_ok) {
            unsigned label;
            __asm__ volatile ("movw %0, #0x6fe5" : "=r"(label));
            prompt(label);
        }
        return 0;
    }
    if (transfer->phase == CHOOSING) {
        int (*const pressed)(unsigned) = GAME(int (*)(unsigned), BUTTON_PRESSED);
        unsigned accept = 0;
        if (transfer->archive_ok && !expired(now, transfer->due)) {
            unsigned yes = pressed(2), no = pressed(4);
            if (!transfer->release_buttons) {
                if (!yes && !no) transfer->release_buttons = 1;
                return 0;
            }
            if (!yes && !no) return 0;
            accept = yes && !no;
        }
        SCENE[0x40] = 2;
        *(uint16_t *)(SCENE + 0x54) = (uint16_t)accept;
#ifdef LEGACY_MODE_WORD
        // Restore the newer envelope bit before transmitting the decision.
        *(volatile uint16_t *)(LINK + LEGACY_MODE_WORD) = 0x25;
#endif
        if (!GAME(int (*)(unsigned), LINK_TRANSMIT)(2)) return 0;
        transfer->decision = accept ? 1 : 2;
        transfer->phase = SENDING_DECISION;
        return 0;
    }
    if (!done(status)) return 0;
    if (*status) return 1;
    unsigned next_scene = CONNECTION_SCENE;
    if (transfer->decision == 1 && commit_food(transfer)) {
        original_new_egg(0);
        volatile uint8_t *home = (volatile uint8_t *)HOME_RETURN;
        *home = (*home & 0xfc) | 1;
        next_scene = 28;
    } else if (transfer->bank) {
        erase_payload(transfer->bank, transfer->archive_end, transfer->ghost_length);
    }
    GAME(void (*)(unsigned), REQUEST_SCENE)(next_scene);
    GAME(void (*)(void *, unsigned), EXIT_SCENE)(SCENE, 0x7fe0);
    return 0;
}
