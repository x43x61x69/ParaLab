#include "../../../flash/src/io.h"
#include "../stub/my_lab_paradise_entry.h"

#define GPIO0 0x40018000u
#define GPIO1 0x40019000u
#define GPIO2 0x4001A000u
#define CLK_PERIPH REG(0x45000020u)
#define PARADISE_SPI_ROUTE (1u << 1)
#define BB(addr, bit) REG(0x42000000u + (((addr) - 0x40000000u) << 5) + ((bit) << 2))
#define PANEL 0x4000E000u
#define SPI_CTRL REG(PANEL)
#define SPI_STATUS REG(PANEL + 0x0Cu)
#define SPI_DATA REG(PANEL + 0x1Cu)
#define LCD_DC(value) (BB(GPIO0, 5) = (value))
#define LCD_RST(value) (BB(GPIO0, 4) = (value))
#define PARADISE_TE (1u << 10)
#define GAME_TE_COUNT REG(0x1801BE10u)
#define PARADISE_BUTTONS (7u << 9)
#define PARADISE_BUTTON_FIELDS (0x3Fu << 18)

typedef struct {
  u8 phase;
  signed char motion;
  signed char pending;
  u8 from_wheel;
  u8 age;
} GameWheel;

// The next byte in the adapter scratch area follows the five wheel fields.
enum { PANEL_READY, PANEL_WAITING_FOR_FRAME, PANEL_LOADER_DEFERRED };
#define PANEL_STATE (*(volatile u8 *)0x20000F99u)

static volatile GameWheel *const wheel = (volatile GameWheel *)0x20000F94u;

/* The ROM builder branches to these entries within the same XIP window. */
__asm__(".section .entry,\"ax\",%progbits\n"
        ".thumb\n"
        "b.w draw_game_frame\n"
        "b.w read_game_pin\n"
        "b.w init_game_panel\n"
        "b.w launch_port_app\n"
        "b.w wait_game_frame_sync\n"
        "b.w wheel_cursor_edge\n"
        "b.w wheel_cursor_repeat\n"
        "b.w wheel_advance_cursor\n"
        "b.w wheel_direction_key\n"
        "b.w wheel_update_carousel\n"
        "b.w wheel_advance_home\n"
        "b.w wheel_binary_edge\n"
        "b.w prepare_paradise_sleep\n"
        "b.w arm_paradise_wheel_wake\n"
        "b.w sleep_game_panel\n"
        "b.w wheel_latch_door\n"
        "b.w wheel_signed_edge\n"
        ".text\n");

static int spi_idle(u32 mask) {
  for (u32 wait = 0; wait < 200000u; wait++) {
    if (!(SPI_STATUS & mask)) return 1;
  }
  return 0;
}

static int spi_write(const u8 *bytes, u32 count) {
  // Use the same pacing and FIFO flush as the Paradise Menu. Its hardware
  // can lose bytes when the FIFO is fed an entire scan line without a drain.
  for (u32 i = 0; i < count; i++) {
    if (!spi_idle(2u)) return MY_LAB_TRACE_TX_FULL;
    SPI_DATA = bytes[i];
    for (volatile u32 ticks = 8; ticks; ticks--) __asm__ volatile("nop");
    if (!spi_idle(0x10u)) return MY_LAB_TRACE_TX_BUSY;
    SPI_CTRL |= 0xC0u;
  }
  return 0;
}

static void use_paradise_spi(void) {
  // Match the working Paradise Menu, including its clock divider.
  REG(PANEL + 8u) = 0;
  SPI_CTRL &= ~1u;
  REG(PANEL + 4u) &= ~7u;
  REG(PANEL + 0x20u) = 0;
  REG(PANEL + 0x50u) = 0;
  REG(PANEL + 0x24u) = (REG(PANEL + 0x24u) & ~0x00FF00FFu) | 0x80000000u;
  SPI_CTRL = (SPI_CTRL & ~0x00040F18u) | 0x0701u;
  SPI_CTRL |= 0xC0u;
}

static void release_paradise_spi(u32 peripheral_clock) {
  // Release the bus and keep clock/MOSI routed away from A and B.
  // Restore the independent peripheral selections from before the draw.
  SPI_CTRL &= ~1u;
  __asm__ volatile("dsb" ::: "memory");
  CLK_PERIPH = peripheral_clock | PARADISE_SPI_ROUTE;
}

static void use_paradise_pins(void) {
  const u32 port0_mode = (3u << 16) | 0x0F00u;
  const u32 port1_mode = (3u << 10) | (3u << 12) | (3u << 14) | (3u << 16) | (3u << 18) | (3u << 22);
  REG(GPIO0 + 4u) = (REG(GPIO0 + 4u) & ~(1u << 8)) | 0x30u;
  REG(GPIO0 + 8u) = (REG(GPIO0 + 8u) & ~port0_mode) | (0x15008055u & port0_mode);
  BB(GPIO1, 5) = 0;  // LCD chip select
  BB(GPIO1, 9) = 0;  // LCD supply
  BB(GPIO1, 11) = 0; // Match the quiet output level used by the Paradise Menu.
  REG(GPIO1 + 8u) = (REG(GPIO1 + 8u) & ~port1_mode) | (0x55995800u & port1_mode);
  REG(GPIO1 + 4u) = (REG(GPIO1 + 4u) & ~0x1C0u) | 0xA20u;
}

static void use_paradise_buttons(void) {
  REG(GPIO0 + 4u) &= ~PARADISE_BUTTONS;
  REG(GPIO0 + 8u) &= ~PARADISE_BUTTON_FIELDS;
  REG(GPIO0 + 0x34u) = 0x15555155u; // The Paradise Menu's pad settings.
}

void arm_paradise_wheel_wake(void) {
  // The caller has armed A/B/C. Arm the fourth native wake input before
  // the SDK takes its first GPIO snapshot. RTC-only paths skip this call.
  ((void (*)(u32, u32))0x23B1u)(8, 1);
  ((void (*)(void))0x1FEDu)();
}

void prepare_paradise_sleep(void) {
  // These are the GPIO configuration calls made by the Neon board shutdown
  // at 0x1007ccb8. The final PRAM routine handles P0.15 and P1.0..4.
  static const u8 modes[] = {
    0,2,0,2,1,1,2,2,0,0,0,0,0,0,0,0xFF,       // P0
    0xFF,0xFF,0xFF,0xFF,0xFF,1,1,1,1,2,1,2,0,0,0,0, // P1
    1,1,0,0,                                     // P2
  };
  ((void (*)(void))0x1001EC29u)(); // Stop the native peripheral and its IRQ.
  SPI_CTRL &= ~1u;
  CLK_PERIPH = (CLK_PERIPH & ~PARADISE_SPI_ROUTE) | 0x40u;
  __asm__ volatile("cpsid i" ::: "memory");
  for (u32 pin = 0; pin < sizeof modes; pin++) {
    if (modes[pin] == 0xFF) continue;
    // P1.9 drives the Paradise panel supply high (off). All other pins park low.
    const u32 panel_off = pin == 0x19;
    ((void (*)(u32,u32,u32,u32))0x28E9u)(pin, panel_off, modes[pin], panel_off);
  }
  // ISO_02 (P0/P1) and the P2 field of ISO_01 select pad retention.
  // ISO_03 independently contains the wake sources armed by the caller.
  REG(0x1801C648u) |= 0xF0007F05u;
  REG(0x1801C64Cu) |= 0xCu;
#ifdef PARA_SLEEP_TEST_WITHOUT_B
  // Isolate P0.11 only from deep-power-down wake. Game input is unchanged.
  REG(0x45000208u) &= ~(1u << 11);
#endif
#ifdef PARA_SLEEP_TEST_WITHOUT_EXTRA_CLOCK
  // Compare with the stock Paradise clock gate at deep-power-down entry.
  REG(0x45000100u) &= ~(1u << 6);
#endif
  __asm__ volatile("cpsie i" ::: "memory");
}

static void use_paradise_wheel(void) {
  REG(GPIO2 + 4u) &= ~3u;
  REG(GPIO2 + 8u) &= ~0xFu;
}

static void poll_wheel(void) {
  static const signed char transition[16] = {0,-1,1,0, 1,0,0,-1, -1,0,0,1, 0,1,-1,0};
  const u32 phase = REG(GPIO2) & 3u, previous = wheel->phase;
  if (phase == previous) return;
  wheel->phase = phase;
  if ((phase ^ previous) == 3u) {
    wheel->motion = 0;
    return;
  }
  int motion = wheel->motion + transition[(previous << 2) | phase];
  if (motion == 4 || motion == -4) {
    int next = wheel->pending + (motion < 0 ? 1 : -1);
    if (next >= -8 && next <= 8) wheel->pending = next;
    wheel->age = 0;
    motion = 0;
  }
  wheel->motion = motion;
}

static int take_wheel_step(void) {
  const int queued = wheel->pending;
  if (!queued) return 0;
  const int step = queued > 0 ? 1 : -1;
  wheel->pending = queued - step;
  return step;
}

static u32 wheel_cursor_event(u32 mask, u32 native) {
  if (native) {
    wheel->from_wheel = 0;
    return native;
  }
  wheel->from_wheel = (mask & 1u) && wheel->pending;
  return wheel->from_wheel;
}

u32 wheel_cursor_edge(u32 mask) {
  return wheel_cursor_event(mask, ((u32 (*)(u32))0x100055EDu)(mask));
}

u32 wheel_cursor_repeat(u32 mask) {
  return wheel_cursor_event(mask, ((u32 (*)(u32))0x100055C1u)(mask));
}

static int cursor_delta(void) {
  const int step = wheel->from_wheel ? take_wheel_step() : 1;
  wheel->from_wheel = 0;
  return step;
}

static int wrap_cursor(int index, int count, int step) {
  index += step;
  if (index < 0) return count - 1;
  if (index >= count) return 0;
  return index;
}

u32 wheel_advance_cursor(short *widget, u32 layout) {
  // The six native widgets share index/count pairs. Their page boundaries
  // differ, so return the appropriate redraw flag to the original renderer.
  short *fields = widget + (layout == 0u ? 0u : layout <= 2u ? 1u : 2u);
  const int count = fields[0], old = fields[1];
  const int step = cursor_delta();
  if (count < 2 || !step) return 0;
  const int index = wrap_cursor(old, count, step);
  fields[1] = index;
  if (layout == 0u || layout == 3u) return index != old;
  const signed char *style = *(const signed char **)((u8 *)widget + 0xCu);
  const int per_page = layout == 1u ? 6 : style[layout == 2u ? 10 : 12];
  return per_page > 0 && old / per_page != index / per_page;
}

void wheel_advance_home(void) {
  short *cursor = (short *)(REG(0x18011A18u) + 0x34u);
  const int count = *(const volatile u8 *)0x180009ECu ? 4 : 3;
  *cursor = wrap_cursor(*cursor, count, cursor_delta());
}

__attribute__((noinline)) int wheel_signed_edge(u32 mask) {
  if (((u32 (*)(u32))0x100055EDu)(mask)) return 1;
  return take_wheel_step();
}

// Scene 0x25 buffers a move during the door animation. Preserve its sign
// until the native scene is ready to update the selected door.
void wheel_latch_door(u32 mask) {
  volatile signed char *move = (volatile signed char *)(REG(0x18011A1Cu) + 0x54u);
  if (*move) return;
  *move = wheel_signed_edge(mask);
}

u32 wheel_binary_edge(u32 mask) {
  return ((u32 (*)(u32))0x100055EDu)(mask) || take_wheel_step() != 0;
}

u32 wheel_direction_key(u32 mask) {
  if (REG(0x18001730u) & (mask & 0xFFu)) return 1;
  if ((mask == 0x80u && wheel->pending > 0) ||
      (mask == 0x40u && wheel->pending < 0)) {
    take_wheel_step();
    return 1;
  }
  return 0;
}

void wheel_update_carousel(u8 *widget) {
  if (!(widget[0x18] & 0x1Cu)) {
    const int step = take_wheel_step();
    if (step) widget[0x18] |= step > 0 ? 4u : 8u;
  }
  ((void (*)(u8 *))0x10005675u)(widget);
}

static void feed_watchdogs(void) {
  REG(0x4000800Cu) = 0x5AFA55AAu;
  REG(0x4000900Cu) = 0x5AFA55AAu;
}

static void trace_tx_error(u32 phase, u32 status, u32 row) {
  if (REG(MY_LAB_PARADISE_TRACE_BOX) != MY_LAB_PARADISE_TRACE_MAGIC) return;
  REG(MY_LAB_PARADISE_TRACE_BOX + 8u) = phase | (status << 8) | (row << 16);
}

static int send_lcd_cmd(u8 command, const u8 *parameters, u32 count) {
  LCD_DC(0);
  int error = spi_write(&command, 1);
  if (!error && count) {
    LCD_DC(1);
    error = spi_write(parameters, count);
    LCD_DC(0);
  }
  return error;
}

static void lcd_cmd(u8 command, const u8 *parameters, u32 count) {
  const int error = send_lcd_cmd(command, parameters, count);
  if (error) trace_tx_error(MY_LAB_TRACE_TX_INIT, error, 0);
  feed_watchdogs();
}

static void panel_delay_ms(u32 ms) {
  while (ms--) {
    feed_watchdogs();
    for (volatile u32 ticks = 16000; ticks; ticks--) __asm__ volatile("nop");
  }
}
#define MS(ms) panel_delay_ms(ms)
#include "../feld/paradise_panel.h"

void sleep_game_panel(void) {
  const u32 peripheral_clock = CLK_PERIPH;
  CLK_PERIPH = 0x42u;
  use_paradise_pins();
  use_paradise_spi();
  lcd_cmd(0x28, 0, 0); // Display off.
  panel_delay_ms(20);
  lcd_cmd(0x10, 0, 0); // Sleep in.
  release_paradise_spi(peripheral_clock);
}

static void trace_stage(u32 loader, u32 game) {
  if (REG(MY_LAB_PARADISE_TRACE_BOX) != MY_LAB_PARADISE_TRACE_MAGIC) return;
  u32 stage = REG(0x4002F004u) == 0x60111000u ? game : loader;
  if (REG(MY_LAB_PARADISE_TRACE_BOX + 4u) < stage) REG(MY_LAB_PARADISE_TRACE_BOX + 4u) = stage;
}

static int in_game(void) {
  return REG(0x4002F004u) == 0x60111000u;
}

static int game_trace_active(void) {
  return in_game() && REG(MY_LAB_PARADISE_TRACE_BOX) == MY_LAB_PARADISE_TRACE_MAGIC;
}

static void use_paradise_te(void) {
  const u32 my_lab_te = 1u << 12;
  if ((REG(GPIO1 + 0x18u) & (PARADISE_TE | my_lab_te)) != PARADISE_TE) {
    BB(GPIO1 + 4u, 10) = 0;
    BB(GPIO1 + 0x18u, 12) = 0;
    REG(GPIO1 + 0x20u) = my_lab_te;
    BB(GPIO1 + 0x18u, 10) = 1;
  }
}

static int wait_te_level(u32 level) {
  for (u32 wait = 0; wait < 400000u; wait++) {
    if (!(wait & 255u)) poll_wheel();
    if ((REG(GPIO1) & PARADISE_TE) == level) return 1;
  }
  return 0;
}

void wait_game_frame_sync(void) {
  use_paradise_te();
  const u32 before = GAME_TE_COUNT;
  if (wait_te_level(PARADISE_TE)) wait_te_level(0);
  if (GAME_TE_COUNT == before) {
    // The main loop also requires progress from the native TE IRQ. Count this
    // wait in software when no interrupt arrived, without losing a pending one.
    u32 primask;
    __asm__ volatile("mrs %0, primask\ncpsid i" : "=r"(primask) :: "memory");
    if (GAME_TE_COUNT == before) GAME_TE_COUNT = before + 1u;
    __asm__ volatile("msr primask, %0" :: "r"(primask) : "memory");
  }
}

static void initialize_panel(void) {
  trace_stage(MY_LAB_TRACE_BOOT_LCD, MY_LAB_TRACE_GAME_LCD);
  // My Lab uses P0.8 as LCD chip select. On Paradise it is the wheel button.
  const u32 peripheral_clock = CLK_PERIPH;
  CLK_PERIPH = 0x42u;
  use_paradise_pins();
  use_paradise_buttons();
  if (in_game()) {
    use_paradise_wheel();
    wheel->phase = REG(GPIO2) & 3u;
    wheel->motion = wheel->pending = wheel->from_wheel = wheel->age = 0;
  }
  LCD_DC(0);
  LCD_RST(1);
  MS(20);
  use_paradise_spi();
  LCD_RST(1); MS(10);
  LCD_RST(0); MS(20);
  LCD_RST(1); MS(150);
  use_paradise_te();
  PANEL_STATE = PANEL_WAITING_FOR_FRAME;
  paradise_panel_init(0);
  release_paradise_spi(peripheral_clock);
  trace_stage(MY_LAB_TRACE_BOOT_LCD_READY, MY_LAB_TRACE_GAME_LCD_READY);
}

void init_game_panel(void) {
  // The wake loader can hand off without drawing. Its first actual frame
  // still gets the complete reset and display sequence if it needs one.
  if (!in_game()) {
    PANEL_STATE = PANEL_LOADER_DEFERRED;
    return;
  }
  initialize_panel();
}

void draw_game_frame(const u16 *source) {
  if (PANEL_STATE == PANEL_LOADER_DEFERRED) initialize_panel();
  trace_stage(MY_LAB_TRACE_BOOT_FRAME, MY_LAB_TRACE_GAME_FRAME);
  static const u8 direction = 0x08;
  static const u8 format = 0x05;
  static const u8 columns[] = {0, 2, 0, 129};
  static const u8 rows[] = {0, 1, 0, 128};
  const int game = in_game();
  const u32 peripheral_clock = CLK_PERIPH;
  CLK_PERIPH = 0x42u;
  use_paradise_pins();
  use_paradise_spi();
  int error = send_lcd_cmd(0x36, &direction, 1);
  if (!error) error = send_lcd_cmd(0x3A, &format, 1);
  if (!error) error = send_lcd_cmd(0x2A, columns, sizeof(columns));
  if (!error) error = send_lcd_cmd(0x2B, rows, sizeof(rows));
  if (!error) error = send_lcd_cmd(0x2C, 0, 0);
  if (error) trace_tx_error(MY_LAB_TRACE_TX_CMD, error, 0);
  LCD_DC(!error);
#ifdef MY_LAB_GAME_FIT
  const unsigned scene = *(volatile u16 *)0x18001708u;
#endif
  for (u32 y = 0; !error && y < 128u; y++) {
    u8 line[256];
#ifdef MY_LAB_GAME_FIT
    const u8 *columns_map = fit_row_map(scene, y);
#endif
    for (u32 x = 0; x < 128u; x++) {
      /* Crop 16 columns on either side. My Lab stores pixels by column
         in reverse horizontal order. */
#ifdef MY_LAB_GAME_FIT
      const u16 pixel = source[columns_map[x] * 128u + y];
#else
      const u16 pixel = source[(143u - x) * 128u + y];
#endif
      line[2u * x] = (u8)(pixel >> 8);
      line[2u * x + 1u] = (u8)pixel;
    }
    error = spi_write(line, sizeof(line));
    if (error) trace_tx_error(MY_LAB_TRACE_TX_ROW, error, y + 1u);
    feed_watchdogs();
    if (game) poll_wheel();
  }
  if (!error && PANEL_STATE == PANEL_WAITING_FOR_FRAME) {
    error = send_lcd_cmd(0x29, 0, 0);
    if (!error) PANEL_STATE = PANEL_READY;
  }
  LCD_DC(0);
  release_paradise_spi(peripheral_clock);
  if (game && wheel->pending && ++wheel->age >= 8u) wheel->pending = 0;
  if (!error) {
    trace_stage(MY_LAB_TRACE_BOOT_DRAWN, MY_LAB_TRACE_GAME_DRAWN);
    if (game_trace_active()) REG(MY_LAB_TRACE_FRAMES)++;
  }
}

u32 read_game_pin(u32 pin) {
  if (pin == 0x1Cu) {
    use_paradise_te();
    return (REG(GPIO1) & PARADISE_TE) != 0;
  }
  if (pin < 0x1Du || pin > 0x1Fu) return ((u32 (*)(u32))0x2591u)(pin);
  static const u8 paradise_pins[] = {9, 11, 10};
  const u32 key = 0x1Fu - pin;
  const u32 pins = REG(GPIO0);
  const u32 released = (pins >> paradise_pins[key]) & 1u;
  if (game_trace_active()) {
    REG(MY_LAB_TRACE_KEYS) |= 1u << (key + (released ? 4u : 0u));
  }
  if (key == 1u) return released && (pins & (1u << 8)); // Wheel click also confirms.
  if (key == 0u) {
    use_paradise_wheel();
    poll_wheel();
  }
  return released;
}
