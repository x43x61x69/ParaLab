/* Read-only FAT16/FAT32 root directory and sequential file reader. */
#ifndef FLASH_SD_FAT_H
#define FLASH_SD_FAT_H
typedef struct {
  int (*read)(u32 lba, u8 *out, u32 count);
  u8 *block;
  u32 sectors, fat, root, root_sectors, data, clusters, spc, fat32;
} SdFat;
typedef struct {
  u32 cluster, sector, walked, offset, left;
} SdStream;
typedef struct {
  u32 cluster, size;
  u16 name[260], alias[13];
} SdEntry;
typedef struct {
  SdStream stream;
  u32 name_parts, name_sum;
  u16 name[260];
} SdDirectory;

static u32 sd_le16(const u8 *p){ return p[0] | ((u32)p[1]<<8); }
static u32 sd_le32(const u8 *p){ return sd_le16(p) | (sd_le16(p+2)<<16); }

static int sd_bpb(SdFat *fs, u32 base, u32 limit){
  const u8 *b=fs->block;
  u32 reserved=sd_le16(b+14), fats=b[16], entries=sd_le16(b+17), spc=b[13];
  u32 total=sd_le16(b+19), fsize=sd_le16(b+22);
  if(!total) total=sd_le32(b+32);
  if(!fsize) fsize=sd_le32(b+36);
  if(sd_le16(b+510)!=0xAA55 || sd_le16(b+11)!=512 || !spc ||
     spc>128 || (spc&(spc-1)) || !reserved || !fats || fats>2 ||
     !fsize || total>limit || reserved>=total || fsize>(total-reserved)/fats) return 0;
  u32 root=(entries+15)/16, meta=reserved+fats*fsize;
  if(root>=total-meta) return 0;
  u32 clusters=(total-meta-root)/spc;
  if(clusters<4085u || clusters>=0x0FFFFFEEu) return 0;
  u32 fat32=clusters>=65525u, root_cluster=sd_le32(b+44);
  if(fat32 ? (entries || sd_le16(b+22) || sd_le16(b+42) ||
              root_cluster<2 || root_cluster-2>=clusters) :
             (!entries || !sd_le16(b+22))) return 0;
  if((clusters+2+(fat32?127:255))/(fat32?128:256)>fsize) return 0;
  u32 active=0;
  if(fat32 && (b[40]&0x80)){
    active=b[40]&15;
    if(active>=fats) return 0;
  }
  fs->fat=base+reserved+active*fsize;
  fs->root=fat32?root_cluster:base+meta;
  fs->root_sectors=root;
  fs->data=base+meta+root;
  fs->clusters=clusters;
  fs->spc=spc;
  fs->fat32=fat32;
  return 1;
}
static int sd_mount(SdFat *fs){
  if(!fs->sectors || !fs->read(0,fs->block,1)) return 0;
  if(sd_bpb(fs,0,fs->sectors)) return 1;
  if(sd_le16(fs->block+510)!=0xAA55) return 0;
  for(u32 i=0;i<4;i++){
    if(i && !fs->read(0,fs->block,1)) return 0;
    const u8 *p=fs->block+446+i*16;
    u32 base=sd_le32(p+8), count=sd_le32(p+12);
    if(!p[4] || !base || base>=fs->sectors || !count || count>fs->sectors-base) continue;
    if(fs->read(base,fs->block,1) && sd_bpb(fs,base,count)) return 1;
  }
  return 0;
}
static int sd_cluster_valid(const SdFat *fs, u32 c){ return c>=2 && c-2<fs->clusters; }

/* 1 = next cluster, 0 = end, -1 = bad chain or I/O failure. */
static int sd_next_cluster(SdFat *fs, SdStream *s){
  u32 c=s->cluster, offset=c*(fs->fat32?4:2);
  if(!sd_cluster_valid(fs,c) || !fs->read(fs->fat+offset/512,fs->block,1)) return -1;
  const u8 *p=fs->block+offset%512;
  u32 next=fs->fat32?(sd_le32(p)&0x0FFFFFFFu):sd_le16(p);
  u32 reserved=fs->fat32?0x0FFFFFF0u:0xFFF0u;
  if(next>=reserved+8) return 0;
  if(next>=reserved || !sd_cluster_valid(fs,next) || next==c || ++s->walked>=fs->clusters) return -1;
  s->cluster=next;
  s->sector=0;
  return 1;
}
static void sd_dir_open(const SdFat *fs, SdDirectory *dir){
  SdStream *s=&dir->stream;
  s->cluster=fs->fat32?fs->root:0;
  s->sector=0;
  s->offset=0;
  s->walked=0;
  dir->name_parts=0;
}
static u16 sd_lower(u16 c){ return c>='A' && c<='Z' ? c+('a'-'A') : c; }
static int sd_bin(const u16 *name){
  u32 n=0;
  while(n<259 && name[n]) n++;
  return n>=4 && name[n-4]=='.' && sd_lower(name[n-3])=='b' &&
         sd_lower(name[n-2])=='i' && sd_lower(name[n-1])=='n';
}
static inline __attribute__((always_inline)) void sd_short_name(const u8 *p, u16 *name){
  u32 n=0;
  // FAT short names are canonical uppercase aliases on the device.
  while(n<8 && p[n]!=' '){
    name[n]=p[n];
    n++;
  }
  if(n && name[0]==5) name[0]=0xE5;
  if(p[8]!=' '){
    name[n++]='.';
    for(u32 i=8;i<11 && p[i]!=' ';i++) name[n++]=p[i];
  }
  name[n]=0;
}
static void sd_long_part(SdDirectory *dir, const u8 *p){
  static const u8 positions[13]={1,3,5,7,9,14,16,18,20,22,24,28,30};
  u32 part=p[0]&0x1Fu;
  if(!part || part>20 || (p[0]&0xA0) || p[12] || sd_le16(p+26)){
    dir->name_parts=0;
    return;
  }
  if(p[0]&0x40){
    dir->name_parts=part+1;
    dir->name_sum=p[13];
    for(u32 i=part*13;i<260;i++) dir->name[i]=0;
  }
  if(dir->name_parts!=part+1 || p[13]!=dir->name_sum){
    dir->name_parts=0;
    return;
  }
  dir->name_parts=part;
  for(u32 i=0;i<13;i++){
    u32 index=(part-1)*13+i, c=sd_le16(p+positions[i]);
    dir->name[index]=(c==0xFFFF || index>=255)?0:c;
  }
}
static int sd_dir_next(SdFat *fs, SdDirectory *dir, SdEntry *entry){
  SdStream *s=&dir->stream;
  /* The scratch buffer belongs to the current iterator only within this call. */
  u32 cached=0xFFFFFFFFu;
  for(;;){
    if(fs->fat32 && s->sector==fs->spc){
      int next=sd_next_cluster(fs,s);
      if(next<=0) return next;
    }
    if(!fs->fat32 && s->sector==fs->root_sectors) return 0;
    u32 lba=(fs->fat32 ? fs->data+(s->cluster-2)*fs->spc:fs->root)+s->sector;
    if(cached!=lba){
      if(!fs->read(lba,fs->block,1)) return -1;
      cached=lba;
    }
    const u8 *p=fs->block+s->offset;
    s->offset+=32;
    if(s->offset==512){ s->offset=0; s->sector++; }
    if(!p[0]) return 0;
    if(p[0]==0xE5){ dir->name_parts=0; continue; }
    if(p[11]==0x0F){ sd_long_part(dir,p); continue; }
    u32 use_long=0;
    if(dir->name_parts==1){
      u32 sum=0;
      for(u32 i=0;i<11;i++) sum=(((sum&1)<<7)+(sum>>1)+p[i])&255;
      use_long=sum==dir->name_sum && dir->name[0];
    }
    dir->name_parts=0;
    if((p[11]&0x18) || p[0]=='.') continue;
    entry->alias[0]=0;
    if(use_long){
      if(!sd_bin(dir->name)) continue;
      for(u32 i=0;dir->name[i];i++){
        if(dir->name[i]>126){ sd_short_name(p,entry->alias); break; }
      }
      for(u32 i=0;i<260;i++){
        entry->name[i]=dir->name[i];
        if(!entry->name[i]) break;
      }
    } else {
      sd_short_name(p,entry->name);
      if(!sd_bin(entry->name)) continue;
    }
    entry->cluster=sd_le16(p+26) | (fs->fat32?((sd_le16(p+20)&0x0FFF)<<16):0);
    entry->size=sd_le32(p+28);
    return 1;
  }
}

static void sd_file_open(SdStream *s, const SdEntry *entry){
  s->cluster=entry->cluster;
  s->sector=0;
  s->walked=0;
  s->left=entry->size;
}
static int sd_file_read(SdFat *fs, SdStream *s, u8 *out, u32 count){
  if(count>s->left/512) return 0;
  while(count){
    if(s->sector==fs->spc && sd_next_cluster(fs,s)!=1) return 0;
    if(!sd_cluster_valid(fs,s->cluster)) return 0;
    u32 take=fs->spc-s->sector;
    if(take>count) take=count;
    if(!fs->read(fs->data+(s->cluster-2)*fs->spc+s->sector,out,take)) return 0;
    s->sector+=take;
    s->left-=take*512;
    count-=take;
    out+=take*512;
  }
  return 1;
}
#endif
