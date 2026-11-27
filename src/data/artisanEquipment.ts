import wingItems from '../../ADMIN/items.json' with {type:'json'};
import families from './setFamilies.json' with {type:'json'};
import armaments from './setArmaments.json' with {type:'json'};
import type { HeroClass, ShopItemDef, ItemSlot, NpcDef } from '../types/game.ts';
import type { MonsterElement } from './bestiary.ts';

const classes = ['DK','DW','ELF','DL','MG'] as const;
const classCraft = {
  DK: { weapon: 'Espada', sets: ['Leather','Dragon','Great Dragon','Volcano'], vendor: 'blacksmith' },
  DW: { weapon: 'Báculo', sets: ['Pad','Legendary','Grand Soul','Grand Soul'], vendor: 'magic' },
  ELF: { weapon: 'Arco', sets: ['Vine','Guardian','Divine','Divine'], vendor: 'magic' },
  DL: { weapon: 'Cetro', sets: ['Light Plate','Dark Steel','Dark Master','Dark Master'], vendor: 'blacksmith' },
  MG: { weapon: 'Sable', sets: ['Storm Crow','Hurricane','Volcano','Great Dragon'], vendor: 'blacksmith' },
} as const;
const finishes = [
  ['Bruma',0x4baabd,'tide'], ['Sauce',0x85ab68,'venom'], ['Ascua',0xf56845,'ember'],
  ['Estela',0xb5a2f1,'storm'], ['Nácar',0xeed48a,'light'], ['Permafrost',0x96def0,'frost'],
  ['Ocaso',0x78569d,'void'], ['Granito',0xa49b88,'stone'], ['Coral',0xe885a2,'tide'], ['Cuarzo',0xe7aefb,'light'],
] as const;

export type ArtisanWeapon = {
  key: string; label: string; classType: HeroClass; metal: number; trim: number; style: number;
  length: number; element: MonsterElement;
};

const weapons = new Map<string, ArtisanWeapon>();
const armamentPaths = new Map<string,string>();
export const setArmament = (name: string) => armamentPaths.get(name);
const armor = new Map<string, { base: string; color: number }>();
export const ARTISAN_CATALOG: ShopItemDef[] = [];
const armorSlots: [ItemSlot,string][] = [
  ['helm','Yelmo'], ['armor','Pechera'], ['pants','Pantalón'], ['gloves','Guantes'], ['boots','Botas'],
];

for (const [c, classType] of classes.entries()) {
  const spec = classCraft[classType];
  const vendors: NpcDef['role'][] = spec.vendor === 'blacksmith' ? ['blacksmith'] : [spec.vendor,'blacksmith'];
  for (const [origin, metal] of [['Madrigal',0xcbb967], ['Lorencia',0x7f91ad]] as const) {
    for (let variant = 0; variant < 20; variant++) {
      const [finish, trim, element] = finishes[variant % finishes.length];
      const style = (variant + (origin === 'Lorencia' ? 2 : 0)) % 5;
      const key = `artisan-${classType.toLowerCase()}-${origin.toLowerCase()}-${variant+1}`;
      const label = `${spec.weapon} ${finish} ${variant < 10 ? 'Viajera' : 'Real'} · ${origin}`;
      // NPC portrait, shop preview and equipped weapon share this textured mesh.
      const models = armaments[classType];
      armamentPaths.set(label, models[(variant + (origin === 'Lorencia' ? 5 : 0)) % models.length]);
      weapons.set(label, { key, label, classType, metal, trim, element, style, length: (origin === 'Lorencia' ? 1.00 : .83) + (variant % 10)*.023 + (variant >= 10 ? .09 : 0) });
      ARTISAN_CATALOG.push({
        id: key, name: label, slot: 'weapon', category: 'weapon', setName: `Forja de ${origin}`,
        rarity: variant >= 15 ? 'excellent' : 'normal', enhanceLevel: Math.floor(variant / 5),
        minDmg: 10 + variant*3, maxDmg: 17 + variant*4, defense: 0,
        magicPower: classType === 'DW' || classType === 'DL' ? 7 + variant*3 : 0,
        luck: false, excellentOpt: '', zenCost: 900 + variant*720, classFilter: [classType], vendorRoles: vendors,
      });
    }
  }
  const moods = ['del Alba', 'del Viento', 'de la Guardia', 'de la Vigilia', 'del Coral', 'del Sol', 'de la Escarcha', 'del Ocaso', 'del Eclipse', 'de las Estrellas'];
  for (let i = 0; i < moods.length; i++) {
    const guild = i < 4 ? 'Madrigal' : 'Lorencia';
    const setName = `${classType} ${moods[i]} · ${guild}`;
    armor.set(setName, { base: families[classType][i], color: finishes[(c*3+i*2)%finishes.length][1] });
    for (const [slot, piece] of armorSlots) {
      const heavy = slot === 'armor' || slot === 'pants';
      ARTISAN_CATALOG.push({
        id: `artisan-set-${classType.toLowerCase()}-${i}-${slot}`, name: `${piece} ${setName}`, slot, category:'armor',
        setName, rarity: i >= 3 ? 'excellent' : 'normal', enhanceLevel: i,
        minDmg: 0, maxDmg: 0, defense: (heavy ? 7 : 3) + i*(heavy ? 6 : 4), magicPower: 0,
        luck: false, excellentOpt: '', zenCost: (heavy ? 2200 : 1050) + i*2200,
        classFilter: [classType], vendorRoles: vendors,
      });
    }
    const id = `artisan-set-${classType.toLowerCase()}-${i}`;
    const [finish, trim, element] = finishes[(c * 3 + i * 2) % finishes.length];
    const main = `${spec.weapon} ${setName}`;
    armamentPaths.set(main, armaments[classType][i]);
    armamentPaths.set('Escudo '+setName, armaments.shield[i]);
    weapons.set(main, { key: id, label: finish, classType, metal: 0xaabbd0, trim, element, style: i % 5, length: 0.9 + i * 0.035 });
    for (const [slot, label] of [['weapon', spec.weapon], ['shield','Escudo'], ['pendant', 'Collar'], ['ring1', 'Anillo'], ['ring2', 'Sello']] as const) {
      ARTISAN_CATALOG.push({
        id: `${id}-${slot}`, slot, name: `${label} ${setName}`, setName,
        category: slot === 'weapon' ? 'weapon' : slot === 'shield' ? 'armor' : 'jewelry', rarity: i >= 3 ? 'excellent' : 'normal',
        enhanceLevel: i, minDmg: slot === 'weapon' ? 14 + i * 5 : 0,
        maxDmg: slot === 'weapon' ? 22 + i * 7 : 0, defense: slot === 'weapon' ? 0 : 3 + i * 2,
        magicPower: 3 + i, luck: false, excellentOpt: '', zenCost: 1300 + i * 1700,
        classFilter: [classType], vendorRoles: vendors,
      });
    }
  }
}

for (const w of wingItems.wingCatalog) {
  ARTISAN_CATALOG.push({id:w.id, name:w.name, setName:'Madrigal', slot:'wings', category:'wings', rarity:'excellent',
    enhanceLevel:[0,5,7,10,14][w.evoTier], minDmg:w.minDmg, maxDmg:w.maxDmg, defense:w.defense,
    magicPower:w.magicPower, zenCost:w.zenCost, luck:false, excellentOpt:'Alas de Madrigal',
    vendorRoles:['magic','chaos_goblin']});
}

export const AURORA_WING_NAME = 'Alas de Aurora Boreal · Madrigal';
ARTISAN_CATALOG.push({
  id: 'artisan-wings-aurora', name: AURORA_WING_NAME, slot: 'wings', category: 'wings',
  setName: 'Madrigal', rarity: 'excellent', enhanceLevel: 8,
  minDmg: 25, maxDmg: 37, defense: 31, magicPower: 16,
  luck: false, excellentOpt: 'Alas de exploración', zenCost: 22500, vendorRoles: ['blacksmith','magic'],
});

export function artisanWeapon(name?: string) { return name ? weapons.get(name) : undefined; }
export function artisanArmor(name?: string) { return name ? armor.get(name) : undefined; }
