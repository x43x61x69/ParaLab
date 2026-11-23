// Optional Paradise presenter for only the games that need scanline mapping.
// Stepping, egg calling and the bubble game use the original presenter.
typedef unsigned char FitByte;
enum { CROP, GAUGE, PUZZLE, BALLOONS };
static const FitByte *fit_row_map(unsigned scene, unsigned y) {
  const FitByte *maps = (const FitByte *)0x10095C00u;
  unsigned row = CROP;
  // The shared 128×24 banner is centred at (80,14). Its first row is
  // transparent; visible rows 3..25 cover the tutorial and its two fades.
  if (y >= 3 && y <= 25 && (scene == 0x3B || scene == 0x40)) {
    const unsigned context_slot = scene == 0x3B ? 0x180119D4u : 0x180119E8u;
    const volatile unsigned *context = *(const volatile unsigned *volatile *)context_slot;
    if (context) {
      const unsigned state = *context;
      if (state >= 2001 && state <= 2003) return maps + CROP * 128;
    }
  }
  switch (scene) {
    case 0x45: if (y >= 96) row = GAUGE; break;
    case 0x3B: if (y < 18) row = GAUGE; break;
    case 0x40: row = PUZZLE; break;
    case 0x35: {
      // Only the live round needs the right edge where eggs enter the screen.
      // Use the same one-to-one camera for the sky, eggs and collision target.
      const volatile unsigned *round = *(const volatile unsigned *volatile *)0x180119BCu;
      if (round && *round >= 3000 && *round <= 4001) row = BALLOONS;
      break;
    }
  }
  return maps + row * 128;
}
#define MY_LAB_GAME_FIT
#include "game.c"

__attribute__((section(".games_entry")))
void present_fitted_games(const u16 *source) {
  unsigned scene = *(volatile u16 *)0x18001708u;
  switch (scene) {
    case 0x35: case 0x3B: case 0x40: case 0x45:
      draw_game_frame(source);
      break;
    default:
      ((void (*)(const u16 *))0x1008D001u)(source);
  }
}
