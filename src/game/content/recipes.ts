import type { HeroClass } from '../../types/game';

// One local effect and sound pair per class skill.
export const RECIPES: Record<HeroClass, Array<[effect: string, sound: string]>> = {
  DK: [
    ['sfx_hitsword01', 'dk_slash'],
    ['mercenary_keenwheel', 'dk_twisting'],
    ['sfx_sklacrbowaimed01', 'arrow'],
    ['sfx_sklacrbowarrowrain01', 'arrowrain'],
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
    ['mercenary_splmash', 'swing'],
    ['sfx_sklmerfury01', 'mu_knight_skill2'],
    ['sfx_sklmagswordwind01', 'mu_piercing'],
    ['sfx_sklassheahealing01', 'mu_knight_skill3'],
    ['guardian-rain', 'heal'],
    ['sfx_sklmerimpowe01', 'mu_swell_life'],
  ],
  DL: [
    ['sfx_hitbow01', 'hit_bow'],
    ['harlequin-rebound', 'pcskilld-springatk'],
    ['harlequin-fire', 'dl_fireburst'],
    ['harlequin-shadow', 'dl_chaotic'],
    ['sfx_sklmerbloody01', 'rage'],
    ['sfx_sklacrbowautoshot01', 'dl_firebird'],
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
