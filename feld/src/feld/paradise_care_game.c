#include "paradise_care.h"

unsigned care_game(unsigned char *save, unsigned version, unsigned before_fuel,unsigned options){
  const struct CareLayout *layout=&care_layouts[version];
  unsigned pet=layout->pet;
  if(options&CARE_FUEL_PATCH) save[pet+0x1Bu]=CARE_FUEL_MAX;
  unsigned mask=options&CARE_AUTOPILOT_PATCH?care_enabled(save):0u;
  if(!mask) return 1;
  unsigned stage=(save[pet+0x18u]>>2)&7u;
  unsigned id=save[pet+4u]|(unsigned)save[pet+5u]<<8;
  if(!id || id==0xFFFFu || stage<2u || stage>5u) return 1;
  if(mask&CARE_FOOD){
    save[pet+0x1Cu]=6;
    save[pet+0x40u]=save[pet+0x41u]=0;
    care_clear_event(save,pet,0x11u);
  }
  if(mask&CARE_JOY){
    save[pet+0x1Du]=20;
    save[pet+0x42u]=save[pet+0x43u]=0;
    care_clear_event(save,pet,0x12u);
  }
  if(mask&CARE_HEALTH){
    save[pet+0x10u]=0;
    for(unsigned i=0;i<4u;i++) save[layout->heal_timer+i]=0;
    care_clear_event(save,pet,0xAu);
    care_clear_event(save,pet,0xBu);
  }
  if(before_fuel && (mask&(CARE_AUTO_CLEAN|CARE_NO_POOP))){
    care_manage_poop(save,layout,mask);
    /* Babies can add fuel directly from the care timer. */
    if((mask&CARE_NO_POOP) && before_fuel>=0x100u && save[pet+0x1Bu]>(before_fuel&0xFFu))
      save[pet+0x1Bu]=(unsigned char)before_fuel;
  }
  return mask&CARE_NO_POOP?0x100u|save[pet+0x1Bu]:1u;
}
