import library from '../../public/mugroup/equipo.json';
import { artisanArmor, artisanWeapon, setArmament, AURORA_WING_NAME } from '../data/artisanEquipment';
import { getAdminConfigSync } from '../services/adminConfigService';
import type { ItemSlot } from '../types/game';
import { useState, type CSSProperties } from 'react';
import { Gem, Sword, Shield, Shirt, HardHat, Hand, Footprints } from 'lucide-react';

const hex = (v:number) => '#'+v.toString(16).padStart(6,'0');
export function itemModelFile(item:{name:string;slot:ItemSlot}):string|undefined {
  if (item.slot==='pet') return 'equipo/pet_angel_white.glb';
  return setArmament(item.name) || (library.weapons as Record<string,string>)[item.name]
    || (library.wings as Record<string,string>)[item.name]
    || (item.slot==='wings' ? getAdminConfigSync().items.wingCatalog.find((w:{name:string})=>w.name===item.name)?.glb
      || (item.name===AURORA_WING_NAME ? 'equipo/wing_mugroup_feather.glb' : undefined) : undefined);
}
export function armorModelFile(item:{slot:ItemSlot;setName?:string},sex:'male'|'female') {
  const set=artisanArmor(item.setName)?.base ?? item.setName;
  return ['armor','pants','helm','gloves','boots'].includes(item.slot) && set
    ? (library.sets as Record<string,Record<string,string>>)[set]?.[sex] : undefined;
}
export function ItemPortrait({item,sex,large=false}: {item:{name:string;slot:ItemSlot;setName?:string;enhanceLevel?:number}; sex:'male'|'female';large?:boolean}) {
  const slot=item.slot, finish=artisanArmor(item.setName);
  const config=getAdminConfigSync();
  const file=itemModelFile(item);
  const armor = armorModelFile(item,sex);
  const key=(file || armor)?.split('/').pop()?.replace(/\.glb$/,'') || artisanWeapon(item.name)?.key;
  const src = !key && ['ring1','ring2','pendant'].includes(slot) ? `./mugroup/ui/items/${slot}.webp` : key && `./mugroup/ui/items/${key}${armor && !file?'-'+slot:''}.webp`;
  const [missing,setMissing] = useState<string>();
  const size = large ? 'w-20 h-20' : 'w-9 h-9';
  const level=item.enhanceLevel ?? 0;
  const tier=config['item-options'].glowByEnhanceLevel.find((t:{minLevel:number;maxLevel:number})=>t.minLevel<=level && level<=t.maxLevel);
  const color=finish ? hex(finish.color) : slot==='pendant' ? '#ff9766' : '#8bdfff';
  const Icon=slot==='weapon'?Sword:slot==='shield'?Shield:slot==='helm'?HardHat:
    slot==='armor'||slot==='pants'?Shirt:slot==='gloves'?Hand:slot==='boots'?Footprints:Gem;
  return <span role="img" aria-label={item.name} style={{'--shine':tier?.color,'--finish':color,
      '--sparkle':`url("./mugroup/${level>=9?config['item-options'].itemParticleTexture:config['item-options'].itemSparkleTexture}")`,
      '--sparkle-period':`${Math.max(1,4-(tier?.sparkleRate ?? 0)/10)}s`} as CSSProperties}
    className={size+' item-portrait '+(level>=6?'item-upgraded':'')}>
    {src && missing!==src ? <><img loading="lazy" alt="" onError={()=>setMissing(src)} src={src}/>
      {armor && finish && <i className="absolute inset-0" style={{backgroundColor:color, mixBlendMode:'multiply', opacity:.65,
        mask:`url("${src}") center / contain no-repeat`}}/>}</>
      : slot==='ring1' || slot==='ring2' || slot==='pendant' || slot==='pet' ?
      <svg aria-hidden="true" viewBox="0 0 64 64">
        {slot==='pet' ? <g stroke="#e3d5a0" fill="#f8ebc5"><path d="M30 38Q5 40 6 12L18 24 14 14 30 28M34 38Q59 40 58 12L46 24 50 14 34 28"/><ellipse cx="32" cy="16" rx="8" ry="2" fill="none"/></g>
          : slot==='pendant' ? <path d="M9 8Q23 31 32 36Q43 30 55 8" stroke="#e5bb78" strokeWidth="3" fill="none"/>
          : <ellipse cx="32" cy="40" rx="16" ry="17" fill="none" stroke={slot==='ring1'?'#dfb67a':'#a7bdca'} strokeWidth="7"/>}
        <path d={slot==='pendant'?'M32 30l10 9-10 15-10-15z':'M32 15l11 9-11 11-11-11z'} fill={color} stroke="#fff3db" strokeWidth="2"/>
      </svg> : <Icon aria-hidden="true" className="text-amber-200"/>}
  </span>;
}
