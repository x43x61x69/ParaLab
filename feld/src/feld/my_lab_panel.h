/* My Lab v1.0.00 LCD startup, captured from the native firmware. Included
 * after lcd_cmd() by the menu and Flash Tool. */
static void my_lab_panel_power(void) {
  // My Lab uses the SPI0 pins on P0.8–P0.11. Native startup makes
  // P0.8 (chip select) an output and leaves the Paradise CS alone.
  BB(GPIO0+0x00,8)=0; BB(GPIO0+0x04,8)=1;
  BB(GPIO1+0x00,11)=0; BB(GPIO1+0x04,11)=1;
  BB(GPIO2+0x00,3)=0; BB(GPIO2+0x04,3)=1;
  REG(GPIO1+0x08)=(REG(GPIO1+0x08)&~(3u<<22))|(2u<<22);
  REG(GPIO2+0x08)=(REG(GPIO2+0x08)&~(3u<<6))|(2u<<6);
  REG(GPIO0+0x08)=(REG(GPIO0+0x08)&~0x00FF0F00u)|0x00AA0A00u;
  LCD_RST(1); BB(GPIO0+0x04,4)=1;
  LCD_DC(0); BB(GPIO0+0x04,5)=1;
}

static const u8 my_lab_madctl[] = {0x00}, my_lab_pixel_format[] = {0x05};
static const u8 my_lab_frame[] = {0x05, 0x3C, 0x3C};
static const u8 my_lab_frame_idle[] = {0x05, 0x3C, 0x3C, 0x05, 0x3C, 0x3C};
static const u8 my_lab_inversion[] = {0x03}, my_lab_power_1[] = {0x28, 0x08, 0x04};
static const u8 my_lab_power_2[] = {0xC0}, my_lab_power_3[] = {0x0D, 0x00};
static const u8 my_lab_power_4[] = {0x8D, 0x2A}, my_lab_power_5[] = {0x8D, 0xEE};
static const u8 my_lab_vcom[] = {0x06}, my_lab_te[] = {0x00};
static const u8 my_lab_gamma_positive[] = {
  0x04, 0x22, 0x07, 0x0A, 0x2E, 0x30, 0x25, 0x2A,
  0x28, 0x26, 0x2E, 0x3A, 0x00, 0x01, 0x03, 0x13
};
static const u8 my_lab_gamma_negative[] = {
  0x04, 0x16, 0x06, 0x0D, 0x2D, 0x26, 0x23, 0x27,
  0x27, 0x25, 0x2D, 0x3B, 0x00, 0x01, 0x04, 0x13
};
static const u8 my_lab_columns[] = {0, 0, 0, 127}, my_lab_rows[] = {0, 0, 0, 159};

static void my_lab_push_frame(const u16* pixels) {
  const u32 pixel_count = 160u * 128u;
  const u32 dma = 0x4000F000u;
  const u32 spi_dma = PANEL + 0x24u;
  const u32 spi_dma_count = PANEL + 0x50u;
  // Commands use 8-bit SPI. The native RGB565 transfer uses 16-bit
  // SPI and DMA channel 0 to preserve whole pixels on the wire.
  lcd_cmd(0x2A, my_lab_columns, sizeof my_lab_columns);
  lcd_cmd(0x2B, my_lab_rows, sizeof my_lab_rows);
  lcd_cmd(0x2C, 0, 0);
  LCD_DC(1);
  SPI_CTRL &= ~1u;
  SPI_CTRL = (SPI_CTRL & ~0xF00u) | 0xF00u;
  SPI_CTRL |= 1u;
  SPI_CTRL |= 0xC0u;

  REG(dma+0x08) = 1;
  REG(dma+0x10) |= 0x10001u;
  REG(dma+0x28) = 1;
  REG(dma+0x24) = 1;
  REG(spi_dma) &= ~0xFF0000u;
  REG(spi_dma) = (REG(spi_dma) & ~0xFFu) | 7u;
  // The native driver arms SPI0's own transfer count before DMA channel 0.
  REG(spi_dma_count) = 0;
  REG(spi_dma_count) |= 1u << 31;
  REG(spi_dma_count) = (REG(spi_dma_count) & ~0x3FFFFFu) | pixel_count;
  REG(dma+0x104) = 0x2086u;
  REG(dma+0x110) = 0;
  REG(dma+0x114) = pixel_count;
  REG(dma+0x10C) = PANEL + 0x1Cu;
  REG(dma+0x108) = (u32)pixels;
  REG(dma+0x100) = 0x992u;
  __asm__ volatile("dsb" ::: "memory");
  REG(dma+0x100) = 0x993u;
  for(u32 g=0; !(REG(dma+0x00)&1u) && g<10u*SPIWAIT; g++){}
  REG(dma+0x100) = 0x992u;
  REG(dma+0x08) = 1;
  for(u32 g=0; (SPI_STAT&0x10u) && g<SPIWAIT; g++){}
  REG(spi_dma) &= ~0xFFu;
  SPI_CTRL &= ~1u;
  SPI_CTRL = (SPI_CTRL & ~0xF00u) | 0x700u;
  SPI_CTRL |= 1u;
  SPI_CTRL |= 0xC0u;
  LCD_DC(0);
}

static void my_lab_panel_init(void) {
  lcd_cmd(0x01, 0, 0); MS(150);
  lcd_cmd(0x11, 0, 0); MS(150);
  lcd_cmd(0x36, my_lab_madctl, sizeof my_lab_madctl);
  lcd_cmd(0x3A, my_lab_pixel_format, sizeof my_lab_pixel_format);
  lcd_cmd(0xB1, my_lab_frame, sizeof my_lab_frame);
  lcd_cmd(0xB2, my_lab_frame, sizeof my_lab_frame);
  lcd_cmd(0xB3, my_lab_frame_idle, sizeof my_lab_frame_idle);
  lcd_cmd(0xB4, my_lab_inversion, sizeof my_lab_inversion);
  lcd_cmd(0xC0, my_lab_power_1, sizeof my_lab_power_1);
  lcd_cmd(0xC1, my_lab_power_2, sizeof my_lab_power_2);
  lcd_cmd(0xC2, my_lab_power_3, sizeof my_lab_power_3);
  lcd_cmd(0xC3, my_lab_power_4, sizeof my_lab_power_4);
  lcd_cmd(0xC4, my_lab_power_5, sizeof my_lab_power_5);
  lcd_cmd(0xC5, my_lab_vcom, sizeof my_lab_vcom);
  lcd_cmd(0xE0, my_lab_gamma_positive, sizeof my_lab_gamma_positive);
  lcd_cmd(0xE1, my_lab_gamma_negative, sizeof my_lab_gamma_negative);
  lcd_cmd(0x35, my_lab_te, sizeof my_lab_te);
  lcd_cmd(0x2A, my_lab_columns, sizeof my_lab_columns);
  lcd_cmd(0x2B, my_lab_rows, sizeof my_lab_rows);
  lcd_cmd(0x29, 0, 0); MS(20);
}
