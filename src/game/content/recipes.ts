import type { HeroClass } from '../../types/game';

// One local effect and sound pair per class skill.
export const RECIPES: Record<HeroClass, Array<[effect: string, sound: string]>> = {
  DK: [
    ['sfx_hitsword01', 'dk_slash'],
    ['mercenary_keenwheel', 'dk_twisting'],
    ['mercenary_splmash', 'flyff_sword_thrust'],
    ['sfx_sklknttwopwswng02', 'flyff_sword_sweep'],
    ['mercenary_protection', 'dk_swell'],
    ['sfx_sklmeroneguillo01', 'dk_stab'],
  ],
  DW: [
    ['sfx_sklpsypsychicbomb01', 'dw_orb'],
    ['sfx_sklpsydemonolgy01', 'dw_spirit'],
    ['sfx_sklpsysatanolgy01', 'cast_fire'],
    ['sfx_sklmagmaglgtref01', 'dw_ice'],
    ['sfx_sklacrdefsupport01', 'buff'],
    ['sfx_sklpsymaximumcrisis01', 'dw_meteor'],
  ],
  ELF: [
    ['sfx_sklacrbowautoshot01', 'flyff_bow_shot'],
    ['sfx_hitbow01', 'flyff_bow_volley'],
    ['sfx_sklacrbowaimed01', 'flyff_bow_aimed'],
    ['sfx_sklragbowicearrow01', 'flyff_ice_arrow'],
    ['sfx_sklrinhealraincasting01', 'flyff_healing'],
    ['sfx_sklacrbowarrowrain01', 'flyff_arrow_rain'],
  ],
  DL: [
    ['sfx_sklmerimpowe01', 'hit_bow'],
    ['harlequin-rebound', 'pcskilld-springatk'],
    ['sfx_sklmerfury01', 'dl_fireburst'],
    ['harlequin-shadow', 'dl_chaotic'],
    ['sfx_sklmerbloody01', 'rage'],
    ['harlequin-fire', 'dl_firebird'],
  ],
  MG: [
    ['sfx_hitwand01', 'mg_swordwind'],
    ['sfx_sklmagfireboomerang01', 'mg_powerslash'],
    ['magician_firebomb', 'mg_flame'],
    ['sfx_sklelemullgtstm01', 'mg_eleshock'],
    ['sfx_sklelewatcasting01', 'ice'],
    ['sfx_sklelefirfirbrd01', 'firebird'],
  ],
};
