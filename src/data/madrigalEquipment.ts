import type {HeroClass, MuItem, ItemSlot} from '../types/game.ts';
import library from '../../public/mugroup/equipo.json' with {type:'json'};
import market from '../../public/mugroup/market-assets.json' with {type:'json'};

const weapons: Record<HeroClass,string> = {DK:'Wooden Sword',DW:'Seal Wand',ELF:'Woodness Bow',DL:'Seal Wand',MG:'Long Sword'};
const piece: Partial<Record<ItemSlot,string>> = {armor:'Suit',helm:'Helmet',gloves:'Gauntlet',boots:'Boots',pants:'Leggings'};
const nativeNames = new Set(Object.keys(market.items));
export function madrigalPiece(slot: ItemSlot, cls:HeroClass, sex:'male'|'female') {
  const setName = sex === 'female' ? 'Silk' : 'Pike';
  const name = slot==='weapon' ? weapons[cls] : slot==='shield' ? 'Green Shield' : setName+' '+piece[slot];
  return {setName,name};
}
export function restoreEquipment(item:MuItem,cls:HeroClass,sex:'male'|'female'):MuItem {
  if (nativeNames.has(item.name)) return item;
  if (item.slot==='wings' && (/OpenMU|\bMU\b|Wings? of|Cape of|Mantle of/i.test(item.name))) {
    const name = ['Wing of Spint','Wing of Storm','Wing of Vortex','Wing of Doom'][item.enhanceLevel>=13?3:item.enhanceLevel>=10?2:item.enhanceLevel>=8?1:0];
    return {...item,name,setName:'Madrigal'};
  }
  if ((item.slot==='shield'||item.slot==='weapon'||piece[item.slot]) &&
      (item.name in library.weapons || item.setName in library.sets || /Lorencia|Dragon|Legendary|Volcano|Dark Master|Great Dragon|Divine|Grand Soul/.test(item.setName))) {
    return {...item,...madrigalPiece(item.slot,cls,sex)};
  }
  return item;
}
