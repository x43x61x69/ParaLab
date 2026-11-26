#ifndef GROWTH_TAMA
#define GROWTH_TAMA 0x114
#define GROWTH_FIELD 0x1ef
#endif

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;

enum { PLANETS = 3, TEENS = 4, REGULAR = 16, MAX_ADULTS = 33 };

struct growth_data {
  u16 kids[PLANETS];
  u16 teens[PLANETS][TEENS];
  u16 regular[PLANETS][REGULAR];
  u16 counts[PLANETS];
  u16 adults[PLANETS][MAX_ADULTS];
};

/* Filled by the installer. Keep it externally linked so the compiler loads the ROM data. */
extern const struct growth_data neon_growth_config;

#ifndef GROWTH_FOOD_HISTORY
static u32 teen_ordinal(u16 stock) {
  if (stock >= 3005 && stock <= 3016) return (stock - 3005) % 4;
  if (stock >= 3070 && stock <= 3073) return stock - 3070;
  if (stock >= 3092 && stock <= 3095) return stock - 3092;
  if (stock == 3114 || stock == 3117) return stock - 3114;
  if (stock == 3115 || stock == 3116) return 3117 - stock;
  return 0;
}
#else
static u32 neon_food_line(const u8 *history) {
  u32 counts[3] = {0, 0, 0};
  for (u32 i = 0; i < history[0] && i < 4; i++) {
    if (history[i + 1] < 3) counts[history[i + 1]]++;
  }
  for (u32 i = 0; i < 3; i++) {
    if (counts[i] > counts[(i + 1) % 3] && counts[i] > counts[(i + 2) % 3]) return i;
  }
  return 3;
}

/* The legacy accumulator has three usable slots for the active lineage. */
u32 neon_food_kind(u32 edition, u32 kind, u32 item) {
  if (edition == 8) {
    /* These plates are already in the base archive with their legacy type. */
    if (item == 5023) kind = 22;
    if (item == 5025 || item == 5026) kind = 23;
    if (item == 5032) kind = 24;
  }
  const u32 ordinal = kind - (19 + (edition - 7) * 3);
  return ordinal < 3 ? ordinal + 1 : 0;
}
#endif

static u32 roll(const u8 *settings) {
  /* The timer phase changes within each game second. Mix with the saved clock. */
  u32 x = *(volatile const u32 *)0xE000E018u ^ *(const u32 *)(settings + 0x10);
  x ^= x << 13;
  x ^= x >> 17;
  return x ^ (x << 5);
}

u16 neon_growth_pick(const u8 *settings, u16 stock, u32 care) {
  const struct growth_data *p = &neon_growth_config;
  const u16 previous = *(const u16 *)(settings + GROWTH_TAMA);
  const u32 stage = (settings[GROWTH_TAMA + 0x14] >> 2) & 7;
  if (stage == 3 && previous == 1001) {
    /* A is active-low on Paradise GPIO0 pin 9. Opt into Neon growth. */
    if (*(volatile const u32 *)0x40018000u & (1u << 9)) return stock;
    u32 field = settings[GROWTH_FIELD];
#ifdef GROWTH_JADE_SKY
    /* The optional fourth field uses the live Water slot and the alternate-set byte. */
    if (field == 1 && settings[0xf00] == 1 && *(const u32 *)0x100fe000u == 0x31584953u) field = 2;
#endif
    if (field < PLANETS) return p->kids[field];
  }
  if (stage == 4) {
    for (u32 i = 0; i < PLANETS; i++) {
      if (p->kids[i] != previous) continue;
#ifdef GROWTH_FOOD_HISTORY
      return p->teens[i][neon_food_line(settings + GROWTH_FOOD_HISTORY)];
#else
      return p->teens[i][teen_ordinal(stock)];
#endif
    }
  }
  if (stage == 5) {
    for (u32 i = 0; i < PLANETS; i++) {
      for (u32 j = 0; j < TEENS; j++) {
        if (p->teens[i][j] != previous) continue;
        const u32 draw = roll(settings);
        if ((draw & 3u) == 0 && p->counts[i]) return p->adults[i][(draw >> 2) % p->counts[i]];
        return p->regular[i][4 * j + (care & 3)];
      }
    }
  }
  return stock;
}
