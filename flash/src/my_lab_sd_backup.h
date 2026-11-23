/* Native FatFs entry points from the same ROM as the SD block driver. */
#define SD_FAT_MOUNT ((u32(*)(void*,const char*,u32))0x10014999u)
#define SD_FAT_OPEN ((u32(*)(void*,const char*,u32))0x10014A31u)
#define SD_FAT_SEEK ((u32(*)(void*,u32))0x10014551u)
#define SD_FAT_CLOSE ((u32(*)(void*))0x10014511u)
#define SD_BACKUP_MAILBOX 0x20000FE0u
#define SD_BACKUP_MAGIC 0x4253444Du /* MDSB */
#define SD_SAVE_BANKS 3u
#define SD_SAVE_BANK_FIRST 0xA6C000u
#define SD_GARDEN_SIZE (6u*0x1B000u)
#define SD_SLOT_SIZE (SD_GARDEN_SIZE+0x5000u)
#define SD_ACTIVE_FIRST 0xCA1000u
#define SD_ACTIVE_END 0xE00000u

static const char sd_backup_cancel_message[]="BACKUP CANCELLED";
static volatile int *const sd_backup_io_error=(int*)0x1801A840u;
static const char *sd_backup_io_message(void){
  return *sd_backup_io_error==SD_FAULT?sd_fault_message:"CARD I/O TIMED OUT";
}

/* The stock driver tracks open multi-block reads and writes here. A
 * discontinuous access can issue STOP then proceed despite a busy card.
 * Close the stream before changing sectors, using the stock CMD12/CMD13
 * response layout. Both commands run inside the sector watchdog. */
#define SD_STREAM_READ  0x1800D2F4u
#define SD_STREAM_WRITE 0x1800D2F8u
#define SD_LAST_R1      0x1801A860u
static int sd_backup_end_stream(void){
  if(!REG(SD_STREAM_READ) && !REG(SD_STREAM_WRITE)) return 1;
  typedef int (*Command)(u32,u32,u32,u32*);
  Command command=(Command)0x100174C9u;
  u32 reply[4]={0};
  if(command(12,0,0x12,reply)) return 0;
  REG(SD_LAST_R1)=reply[0];
  /* As in the native STOP handler, disregard OUT_OF_RANGE on CMD12. */
  if(reply[0]&(0x7DF98008u|0x20u)) return 0;
  for(u32 poll=0;poll<500;poll++){
    if(command(13,REG(0x1800D2ECu),0x12,reply)) return 0;
    u32 r1=reply[0], state=(r1>>9)&15u;
    REG(SD_LAST_R1)=r1;
    if(r1&(0xFDF98008u|0x20u)) return 0;
    if(state==4 && (r1&0x100u)){
      REG(SD_STREAM_READ)=0;
      REG(SD_STREAM_WRITE)=0;
      return 1;
    }
    if(state<4 || state>7) return 0;
    MS(1);
  }
  return 0;
}
typedef struct { u8 *data; u32 lba,count; int writing; } SdBackupTransfer;
static int sd_backup_transfer(void *arg){
  typedef int (*NativeWrite)(const u8*,u32,u32);
  const volatile SdBackupTransfer *t=arg;
  if(!sd_backup_end_stream()) return 0;
  if(t->writing) return ((NativeWrite)0x10009195u)(t->data,t->lba,t->count)==0 && sd_backup_end_stream();
  return sd_hw_read(t->lba,t->data,t->count);
}
static int sd_backup_io(u8 *data,u32 lba,u32 count,int writing){
  if(*sd_backup_io_error) return 0;
  SdBackupTransfer transfer={data,lba,count,writing};
  sd_feed();
  int result=sd_guarded_mode(sd_backup_transfer,&transfer,0,SD_PHASE_BACKUP);
  if(result==SD_TIMED_OUT || result==SD_FAULT){
    *sd_backup_io_error=result;
    sd_hw_close();
  }
  return result==SD_OK;
}
static int sd_backup_read(u32 lba,u8 *out,u32 count){
  return sd_backup_io(out,lba,count,0);
}
static int sd_backup_disk_status(void){ return *sd_backup_io_error?1:0; }
/* Native sector DMA requires a word-aligned SRAM address. FatFs owns
 * its cache layout. Stage its sectors independently of that layout. */
static int sd_backup_cached_io(u8 *data,u32 lba,u32 count,int writing){
  if(!count) return 1;
  while(count){
    u32 take=count>8?8:count, bytes=take*512;
    if(writing) for(u32 i=0;i<bytes;i++) dma[i]=data[i];
    if(!sd_backup_io(dma,lba,take,writing)) return 1;
    if(!writing) for(u32 i=0;i<bytes;i++) data[i]=dma[i];
    count-=take;
    lba+=take;
    data+=bytes;
  }
  return 0;
}
static int sd_backup_disk_read(u8 *out,u32 lba,u32 count){ return sd_backup_cached_io(out,lba,count,0); }
static int sd_backup_disk_write(u8 *data,u32 lba,u32 count){ return sd_backup_cached_io(data,lba,count,1); }

static int sd_backup_mount(void *volume){
  /* Use the stock disk dispatch table. Initialization already ran in the
   * probe, so the FatFs initialization callback only reports its state.
   * The FatFs volume pointer shares LCD SRAM. Draw only after unmounting. */
  for(u32 i=0;i<0x20u;i+=4)
    REG(0x18000000u+i)=REG(0x60000000u+SD_BOOT_COPY+0xBF00u+i);
  REG(0x18000000u)=(u32)sd_backup_disk_status;
  REG(0x18000004u)=(u32)sd_backup_disk_status;
  REG(0x18000008u)=(u32)sd_backup_disk_read;
  REG(0x1800000Cu)=(u32)sd_backup_disk_write;
  *(volatile u8*)0x1800001Cu=0;
  for(u32 address=0x18005240u;address<0x18005268u;address+=4) REG(address)=0;
  return SD_FAT_MOUNT(volume,"0:",1)==0;
}
static int sd_backup_cancelled(void){
  return *sd_guard_cancel_pending || (sd_keys()&SD_C);
}
static int sd_backup_sector(u32 lba,u8 *data,u8 *readback){
  return sd_backup_io(data,lba,1,1) &&
    sd_backup_read(lba,readback,1) && sd_match(data,readback,512);
}
/* RXACC and FRAME are adjacent idle UART buffers during SD backup.
 * Stage 16 KiB, then verify it in the separate 4 KiB DMA buffer. */
#define SD_BACKUP_BATCH 0x4000u
_Static_assert(RXACC+SD_BACKUP_BATCH==OUTF,"backup staging bounds");
static void sd_backup_bar(u32 row,u32 done,u32 total){
  u32 y=32+row*29, width=150, fill=width*done/total;
  for(u32 x=0;x<width;x++) for(u32 dy=0;dy<4;dy++)
    fb[fb_index(5+x,y+dy)]=x<fill?UI_GOLD:UI_GREY;
  push_fb();
}
static int sd_backup_batch(SdFat *fs,SdStream *stream,u32 sectors,int writing){
  u8 *data=rxac;
  while(sectors){
    if(sd_backup_cancelled()) return 0;
    if(stream->sector==fs->spc && sd_next_cluster(fs,stream)!=1) return 0;
    if(!sd_cluster_valid(fs,stream->cluster)) return 0;
    u32 take=fs->spc-stream->sector;
    if(take>sectors) take=sectors;
    if(take>8) take=8;
    u32 lba=fs->data+(stream->cluster-2)*fs->spc+stream->sector;
    if(writing){
      if(!sd_backup_io(data,lba,take,1)) return 0;
    } else if(!sd_backup_read(lba,dma,take) || !sd_match(data,dma,take*512)) return 0;
    stream->sector+=take;
    sectors-=take;
    data+=take*512;
  }
  return 1;
}
static int sd_backup_contents(SdFat *fs,u32 cluster,u32 source,u32 size,u32 version,u32 clock){
  SdStream stream={.cluster=cluster};
  u32 total=size+20, crc=0xFFFFFFFFu;
  wr32(rxac,0x4C4D5850u); wr32(rxac+4,0x45564153u);
  wr32(rxac+8,version); wr32(rxac+12,clock);
  sd_text(5,19,"READ SAVE",UI_WHITE);
  sd_text(5,48,"WRITE TO SD",UI_WHITE);
  sd_text(5,77,"VERIFY SD",UI_WHITE);
  for(u32 pos=0;pos<total;pos+=SD_BACKUP_BATCH){
    if(sd_backup_cancelled()) return 0;
    u32 len=total-pos;
    if(len>SD_BACKUP_BATCH) len=SD_BACKUP_BATCH;
    u32 end=pos+len;
    int last=end==total;
    u32 payload=last?len-4:len, sectors=(len+511)/512;
    for(u32 i=pos?0:16;i<payload;i++) rxac[i]=sd_flash(source+pos+i-16)[0];
    crc=sd_crc(crc,rxac,payload);
    if(last){
      wr32(rxac+payload,~crc);
      for(u32 i=len;i<sectors*512;i++) rxac[i]=0;
    }
    int refresh=!(pos&0xFFFFu) || last;
    if(refresh) sd_backup_bar(0,end,total);
    SdStream verify=stream;
    if(!sd_backup_batch(fs,&stream,sectors,1)) return 0;
    if(refresh) sd_backup_bar(1,end,total);
    if(!sd_backup_batch(fs,&verify,sectors,0)) return 0;
    if(refresh) sd_backup_bar(2,end,total);
  }
  return 1;
}
/* Publish the long name only after every sector has been written and verified.
 * The native open/seek/close calls have already allocated the chain and
 * flushed both FAT copies and the directory entry. */
static int sd_backup_entry(SdFat *fs,const char *path,u32 cluster,u32 size,int publish){
  SdDirectory dir;
  sd_dir_open(fs,&dir);
  SdStream *s=&dir.stream;
  u32 last=0;
  while(path[3+last+1]) last++;
  static const u8 offsets[]={1,3,5,7,9,14,16,18,20,22,24,28,30};
  u32 tail_order=0x41u+last/13, unit=offsets[last%13];
  u32 tail_lba=0, tail_pos=0;
  for(;;){
    if(sd_backup_cancelled()) return 0;
    if(fs->fat32 && s->sector==fs->spc && sd_next_cluster(fs,s)!=1) return 0;
    if(!fs->fat32 && s->sector==fs->root_sectors) return 0;
    u32 lba=(fs->fat32?fs->data+(s->cluster-2)*fs->spc:fs->root)+s->sector++;
    if(!sd_backup_read(lba,sec,1)) return 0;
    for(u32 pos=0;pos<512;pos+=32){
      u8 *entry=sec+pos;
      if(!entry[0]) return 0;
      if(entry[11]==0x0F){
        if(entry[0]==tail_order){ tail_lba=lba; tail_pos=pos; }
        sd_long_part(&dir,entry);
        continue;
      }
      int complete=dir.name_parts==1;
      dir.name_parts=0;
      if(!complete || entry[0]==0xE5 || (entry[11]&0x18)) continue;
      u32 sum=0;
      for(u32 i=0;i<11;i++) sum=(((sum&1)<<7)+(sum>>1)+entry[i])&255;
      if(sum!=dir.name_sum || dir.name[last]!='_' || dir.name[last+1]) continue;
      u32 i=0;
      while(i<last && dir.name[i]==(u8)path[3+i]) i++;
      if(i!=last) continue;
      u32 first=sd_le16(entry+26) | (fs->fat32?((sd_le16(entry+20)&0x0FFF)<<16):0);
      if(first!=cluster || sd_le32(entry+28)!=size) return 0;
      if(!publish) return 1;
      /* Replace the temporary final character in the last LFN entry.
       * The short alias stays intact, preserving the LFN checksum. */
      if(tail_lba!=lba && !sd_backup_read(tail_lba,sec,1)) return 0;
      u8 *tail=sec+tail_pos;
      if(tail[0]!=tail_order || tail[11]!=0x0F || tail[13]!=sum || sd_le16(tail+unit)!='_') return 0;
      tail[unit]='e';
      return sd_backup_sector(tail_lba,sec,fs->block);
    }
  }
}

static const char sd_backup_open_timed_out[]="CARD OPEN TIMED OUT";
typedef struct { u32 seek,close,bytes,expected; } SdAllocation;
static void sd_digits(char *out,u32 value,u32 width){
  while(width){ out[--width]='0'+value%10; value/=10; }
}
static void sd_backup_date(char *out,u32 time){
  u32 year=1970, days=time/86400u;
  for(;;year++){
    u32 span=365u+(!(year%4) && (year%100 || !(year%400)));
    if(days<span) break;
    days-=span;
  }
  static const u8 lengths[]={31,28,31,30,31,30,31,31,30,31,30,31};
  u32 month=0;
  for(;month<11;month++){
    u32 span=lengths[month]+(month==1 && !(year%4) && (year%100 || !(year%400)));
    if(days<span) break;
    days-=span;
  }
  sd_digits(out,year,4); sd_digits(out+4,month+1,2); sd_digits(out+6,days+1,2);
  sd_digits(out+9,time/3600%24,2); sd_digits(out+11,time/60%60,2); sd_digits(out+13,time%60,2);
}
static const char *sd_backup_file(u32 bank,u32 slot,u32 want,char *path,SdAllocation *allocation){
  u32 source=SD_ACTIVE_FIRST, size=SD_ACTIVE_END-SD_ACTIVE_FIRST, version=2;
  if(slot){
    if(slot>2 || bank>=SD_SAVE_BANKS) return "INVALID SAVE SLOT";
    u32 address=SD_SAVE_BANK_FIRST+bank*(SD_SLOT_SIZE+SD_SECTOR);
    for(u32 i=0;i<32;i++) sec[i]=sd_flash(address)[i];
    if(!sd_tag(sec,"MLSB") || rd32(sec+4)!=slot-1 || rd32(sec+12)!=want || rd32(sec+16) ||
       ~sd_crc(0xFFFFFFFFu,(const volatile u8*)(0x60000000u+address+SD_SECTOR),SD_SLOT_SIZE)!=want) return "SAVE CHECK FAILED";
    source=address+SD_SECTOR;
    size=SD_SLOT_SIZE;
    version=3;
  }
  SdFat fs;
  int probe=sd_hw_open(&fs);
  if(probe==SD_CANCELLED) return sd_backup_cancel_message;
  if(probe==SD_TIMED_OUT) return sd_backup_open_timed_out;
  if(probe!=SD_OK) return sd_open_error(probe);
  fs.read=sd_backup_read;

  sd_screen("SD SAVE BACKUP","C CANCEL");
  sd_text(5,49,"PREPARING FILE...",UI_WHITE);
  push_fb();
  if(sd_backup_cancelled()) return sd_backup_cancel_message;

  u32 volume[256], file[256];
  /* Native FIL and FATFS each include a 512-byte sector cache. */
  for(u32 i=0;i<256;i++){ volume[i]=0; file[i]=0; }
  if(!sd_backup_mount(volume)){
    SD_FAT_MOUNT(0,"0:",0);
    if(*sd_backup_io_error) return sd_backup_io_message();
    return sd_backup_cancelled()?sd_backup_cancel_message:"CHECK CARD FORMAT";
  }
  u32 code=8, cluster=0;
  u32 stamp=REG(CLK+0x304u);
  path[5]='0'+slot;
  int dated=path[6]=='-';
  u32 last=0;
  while(path[last+1]) last++;
  int opened=0;
  for(u32 i=0;i<100 && code==8 && !sd_backup_cancelled();i++){
    const char digits[]="0123456789ABCDEF";
    if(dated) sd_digits(path+23,i,2);
    else for(u32 j=0;j<5;j++) path[6+j]=digits[((stamp+i)>>(16-4*j))&15];
    code=SD_FAT_OPEN(file,path,1); /* Keep any existing backup with this name. */
    if(!code){ SD_FAT_CLOSE(file); code=8; continue; }
    if(code!=4) break;
    path[last]='_';
    code=SD_FAT_OPEN(file,path,6); /* FA_WRITE | FA_CREATE_NEW */
    path[last]='e';
    opened=!code;
  }
  const char *error=0;
  if(sd_backup_cancelled()){
    if(opened) SD_FAT_CLOSE(file);
    error=sd_backup_cancel_message;
  } else if(!opened) error="CANNOT CREATE FILE";
  else {
    REG(SD_FIRST_LOG)=0;
    allocation->expected=size+20;
    allocation->seek=SD_FAT_SEEK(file,allocation->expected);
    allocation->bytes=file[3];
    cluster=file[2]; /* FIL.obj.sclust */
    allocation->close=SD_FAT_CLOSE(file);
    if(allocation->seek) error="FILE ALLOCATION FAILED";
    else if(allocation->close) error="FILE SYNC FAILED";
    else if(allocation->bytes<allocation->expected) error="SHORT FILE ALLOCATION";
    else if(allocation->bytes!=allocation->expected || !sd_cluster_valid(&fs,cluster))
      error="INVALID FILE ALLOCATION";
    if(!error) allocation->expected=0;
  }
  SD_FAT_MOUNT(0,"0:",0);
  if(*sd_backup_io_error) return sd_backup_io_message();
  if(sd_backup_cancelled()) return sd_backup_cancel_message;
  if(error) return error;
  sd_screen("SD SAVE BACKUP","C CANCEL");
  u32 clock=!slot && (REG(CLK+0x200u)&0x80u)?stamp:0xFFFFFFFFu;
  if(!sd_backup_entry(&fs,path,cluster,size+20,0) ||
     !sd_backup_contents(&fs,cluster,source,size,version,clock) ||
     !sd_backup_entry(&fs,path,cluster,size+20,1)){
    if(*sd_backup_io_error) return sd_backup_io_message();
    return sd_backup_cancelled()?sd_backup_cancel_message:"BACKUP WRITE FAILED";
  }
  return 0;
}

static void sd_backup(u32 bank,u32 slot,u32 crc,u32 time){
  char path[sizeof("0:/ML0-00000000-000000-00.tamastate")];
  const char *pattern=time?"0:/ML0-00000000-000000-00.tamastate":"0:/ML000000.tamastate";
  for(u32 i=0;(path[i]=pattern[i]);i++){}
  if(time) sd_backup_date(path+7,time);
  REG(SD_LAST_R1)=0;
  *sd_backup_io_error=0;
  *sd_guard_cancel_pending=0;
  sd_screen("SD SAVE BACKUP","C CANCEL");
  sd_text(5,49,"CHECKING SD CARD...",UI_WHITE);
  push_fb();
  SdAllocation allocation={0};
  const char *error=sd_backup_file(bank,slot,crc,path,&allocation);
  sd_hw_close();
  *sd_previous_keys=sd_keys();
  if(error==sd_backup_cancel_message) return_to_menu();
  if(error){
    if(error==sd_backup_open_timed_out){
      sd_screen("SD SAVE BACKUP","C BACK");
      sd_text(5,25,error,UI_ORANGE);
      sd_text(5,41,sd_phase_name(REG(SD_RESET_BOX+8)),UI_WHITE);
      sd_text(5,60,"PC",UI_GREY);
      sd_hex(23,60,REG(SD_RESET_BOX+12));
      sd_text(5,76,"TICKS",UI_GREY);
      sd_number(41,76,REG(SD_RESET_BOX+16),UI_WHITE);
      sd_sample_details(REG(SD_RESET_BOX+8));
      push_fb();
    } else if(allocation.expected && !*sd_backup_io_error){
      sd_screen("SD SAVE BACKUP","C BACK");
      sd_text(5,23,error,UI_ORANGE);
      sd_text(5,39,"SEEK",UI_GREY); sd_number(45,39,allocation.seek,UI_WHITE);
      sd_text(84,39,"CLOSE",UI_GREY); sd_number(122,39,allocation.close,UI_WHITE);
      sd_text(5,55,"BYTES",UI_GREY); sd_number(45,55,allocation.bytes,UI_WHITE);
      sd_text(5,71,"NEED",UI_GREY); sd_number(45,71,allocation.expected,UI_WHITE);
      sd_text(5,87,"LOG",UI_GREY); sd_hex(45,87,REG(SD_FIRST_LOG));
      sd_text(5,101,"R1",UI_GREY); sd_hex(45,101,REG(SD_LAST_R1));
      push_fb();
    } else sd_show_error("SD SAVE BACKUP",error);
    sd_wait_key(SD_C);
    return_to_menu();
  } else {
    sd_screen("SD SAVE BACKUP","B RESTART  C BACK");
    sd_text(5,40,"BACKUP COMPLETE",UI_GREEN);
    if(time){
      path[25]=0;
      sd_text(5,57,path+3,UI_WHITE);
      sd_text(5,70,".tamastate",UI_WHITE);
    } else sd_text(5,57,path+3,UI_WHITE);
    push_fb();
    if(sd_wait_key(SD_B|SD_C)&SD_B) reset_system();
    return_to_menu();
  }
}
