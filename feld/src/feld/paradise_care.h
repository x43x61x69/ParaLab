#ifndef PARADISE_CARE_H
#define PARADISE_CARE_H

#define CARE_SAVE 0xF80u
#define CARE_MARK 0xC7u
#define CARE_FOOD 1u
#define CARE_JOY 2u
#define CARE_HEALTH 4u
#define CARE_AUTO_CLEAN 8u
#define CARE_NO_POOP 16u
#define CARE_BATHE 32u
#define CARE_EXPLICIT 128u
#define CARE_LEGACY_AUTOPILOT (CARE_FOOD|CARE_JOY|CARE_HEALTH|CARE_AUTO_CLEAN)
#define CARE_AUTOPILOT (CARE_LEGACY_AUTOPILOT|CARE_BATHE)
#define CARE_MASK (CARE_AUTOPILOT|CARE_NO_POOP)
#define CARE_HOOK_OFF 0xC00u
#define CARE_HOOK_MAGIC 0x45524143u
#define CARE_OPTIONS_MAGIC 0x32524143u
#define CARE_AUTOPILOT_PATCH 1u
#define CARE_FUEL_PATCH 2u
#define CARE_FUEL_MAX 60u

/* Offsets in the CRC-prefixed settings page. These are shared by the
 * on-device editor and the native game hook. */
struct CareLayout {
  unsigned short pet, poop_count, poop_timers, poop_elapsed, stars, heal_timer, dirt;
};
static const struct CareLayout care_layouts[] = {
  {0x104,0x140,0x170,0x18A,0x1DC,0x17C,0x142},
  {0x108,0x144,0x174,0x18E,0x1E0,0x180,0x146},
  {0x114,0x150,0x188,0x1A2,0x20C,0x194,0x152},
  {0x114,0x151,0x190,0x1AA,0x220,0x19C,0x153},
};

static inline unsigned care_enabled(const unsigned char *save){
  unsigned raw=save[CARE_SAVE+1u];
  return save[CARE_SAVE]!=CARE_MARK ? 0u : raw==CARE_LEGACY_AUTOPILOT ? CARE_AUTOPILOT : raw&CARE_MASK;
}

static inline void care_clear_event(unsigned char *save,unsigned pet,unsigned event){
  unsigned bit=1u<<(event&7u), byte=event>>3;
  save[pet-0xAu+byte]&=(unsigned char)~bit;
  save[pet-5u+byte]&=(unsigned char)~bit;
}

static inline void care_set_dirt(unsigned char *save,const struct CareLayout *layout,unsigned dirt){
  save[layout->dirt]=(unsigned char)dirt;
  unsigned char *flags=save+layout->pet+0x14u;
  *flags=(unsigned char)((*flags&~0x10u)|(dirt==3u?0x10u:0u));
}

static inline void care_heal(unsigned char *save,const struct CareLayout *layout){
  save[layout->pet+0x10u]=0;
  for(unsigned i=0;i<8u;i++) save[layout->heal_timer+i]=0;
  care_clear_event(save,layout->pet,0xAu);
  care_clear_event(save,layout->pet,0xBu);
}

static inline void care_clear_poop(unsigned char *save,const struct CareLayout *layout){
  for(unsigned i=0;i<12u;i++) save[layout->poop_timers+i]=0;
  save[layout->poop_count]=save[layout->poop_count+1u]=0;
  save[layout->poop_elapsed]=save[layout->poop_elapsed+1u]=0;
  care_clear_event(save,layout->pet,0x10u);
}

static inline void care_manage_poop(unsigned char *save,const struct CareLayout *layout,unsigned mask){
  if(mask&CARE_AUTO_CLEAN){
    unsigned count=save[layout->poop_count], old=save[layout->poop_count+1u];
    if(count<=6u && old<count){
      unsigned amount=save[layout->pet+0x1Bu]+count-old;
      save[layout->pet+0x1Bu]=(unsigned char)(amount<=CARE_FUEL_MAX?amount:CARE_FUEL_MAX);
    }
  }
  care_clear_poop(save,layout);
  if(mask&CARE_NO_POOP) care_clear_event(save,layout->pet,0xEu);
}
#endif
