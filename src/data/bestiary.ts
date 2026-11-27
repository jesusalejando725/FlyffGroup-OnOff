import type { MapId, MonsterPower } from '../types/game.ts';

type Shape = 'puff' | 'beast' | 'bird' | 'bug' | 'plant' | 'sprite' | 'crab' | 'serpent' | 'sentinel' | 'wyvern';
export type MonsterElement = 'stone' | 'ember' | 'frost' | 'storm' | 'venom' | 'void' | 'tide' | 'light';
export type AttackStyle = 'cleave' | 'bolt' | 'pulse';

export const MONSTER_ELEMENTS: Record<MonsterElement, { color: string; hz: number }> = {
  stone: { color: '#fbbf24', hz: 95 }, ember: { color: '#fb693b', hz: 160 },
  frost: { color: '#73e5ff', hz: 660 }, storm: { color: '#c5abff', hz: 420 },
  venom: { color: '#91ef49', hz: 270 }, void: { color: '#e28aff', hz: 120 },
  tide: { color: '#42dcca', hz: 240 }, light: { color: '#ffeaa1', hz: 875 },
};

interface Species {
  id: string;
  name: string;
  family: 'madrigal' | 'lorencia';
  map: MapId;
  shape: Shape;
  body: number;
  height: number;
  crest: number;
  archetype: string;
  power: MonsterPower & { range: number; cooldownSec: number; element: MonsterElement; style: AttackStyle };
}
type Entry = [id: string, name: string, shape: Shape, body: number, height: number, crest: number,
  archetype: string, element: MonsterElement, style: AttackStyle, powerName: string];

function family(map: MapId, origin: Species['family'], rows: Entry[]): Species[] {
  return rows.map(([id, name, shape, body, height, crest, archetype, element, style, powerName]) => ({
    id, name, family: origin, map, shape, body, height, crest, archetype,
    power: {
      id: 'pwr_' + id, name: powerName, element, style, colorHex: MONSTER_ELEMENTS[element].color,
      range: style === 'cleave' ? 3.4 : style === 'bolt' ? 9 : 6.2,
      cooldownSec: 4.4 + crest * 0.24,
      damageMult: style === 'cleave' ? 1.43 : style === 'bolt' ? 1.59 : 1.68,
    },
  }));
}

// Original artwork and audio profiles made for this project. The two families
// follow the bright and dark settings already used by Madrigal and Lorencia.
export const BESTIARY: Species[] = [
  ...family('flaris', 'madrigal', [
    ['pompom', 'Pompón de las Praderas', 'puff', 0xf0bc49, 0.92, 1, 'bull', 'light', 'pulse', 'Destello de Polen'],
    ['bellcap', 'Hongo Campana', 'plant', 0xd96b88, 1.25, 2, 'goblin', 'venom', 'pulse', 'Lluvia de Esporas'],
    ['thistlewing', 'Ala de Cardo', 'bird', 0x70ba36, 1.1, 2, 'hound', 'storm', 'bolt', 'Pluma de Tormenta'],
    ['silkbeetle', 'Escarabajo de Seda', 'bug', 0x596db7, 0.85, 1, 'golem', 'stone', 'cleave', 'Pinza de Ámbar'],
    ['dewkin', 'Duende del Rocío', 'sprite', 0x4bb5b8, 1.18, 3, 'goblin', 'tide', 'bolt', 'Gota Saltarina'],
  ]),
  ...family('flaris', 'lorencia', [
    ['tombwatch', 'Vigía del Osario', 'sentinel', 0xb5a38e, 1.6, 1, 'skeleton', 'void', 'cleave', 'Tajo Sepulcral'],
    ['blackfang', 'Colmillo Negro', 'beast', 0x283445, 1.18, 1, 'hound', 'void', 'cleave', 'Dentellada Oscura'],
    ['bronzehorn', 'Cuerno de Bronce', 'beast', 0x915a3b, 1.42, 2, 'bull', 'stone', 'pulse', 'Pisada de Bronce'],
    ['cryptwisp', 'Brasa de la Cripta', 'sprite', 0x615c95, 1.3, 2, 'shadow', 'ember', 'bolt', 'Ascua Errante'],
    ['bonecrawler', 'Rastrero de Marfil', 'bug', 0xcbb99b, 1.0, 3, 'skeleton', 'venom', 'bolt', 'Aguijón de Osario'],
  ]),
  ...family('robledal', 'madrigal', [
    ['mossback', 'Corzomusgo', 'beast', 0x566c35, 1.52, 3, 'hound', 'venom', 'cleave', 'Cornada de Ortiga'],
    ['acorn', 'Bellota de Guardia', 'sentinel', 0x8d623c, 1.48, 2, 'golem', 'stone', 'pulse', 'Retumbo de Raíces'],
    ['poppy', 'Amapola Andante', 'plant', 0xf86548, 1.3, 3, 'goblin', 'ember', 'bolt', 'Pétalo Ardiente'],
    ['lanternmoth', 'Polilla Farolera', 'bird', 0xd9a449, 1.38, 3, 'phoenix', 'light', 'bolt', 'Luces del Bosque'],
    ['glacierbud', 'Brote de Escarcha', 'puff', 0x7db5e9, 1.3, 2, 'ice_queen', 'frost', 'pulse', 'Polen Bajo Cero'],
  ]),
  ...family('robledal', 'lorencia', [
    ['shale', 'Celador de Pizarra', 'sentinel', 0x545f6d, 1.8, 3, 'golem', 'stone', 'pulse', 'Sismo de Pizarra'],
    ['barkreaver', 'Verdugo de Corteza', 'plant', 0x523944, 1.64, 1, 'mutant', 'void', 'cleave', 'Raíz de Sombra'],
    ['razorspider', 'Arácnido de Navaja', 'bug', 0x374850, 1.12, 4, 'selupan', 'frost', 'bolt', 'Hilo Escarchado'],
    ['bogjaw', 'Fauces del Pantano', 'serpent', 0x54713b, 1.65, 1, 'gorgon', 'venom', 'pulse', 'Aliento del Pantano'],
    ['ivorybull', 'Toro de Marfil', 'beast', 0x9a7f64, 1.68, 4, 'bull', 'light', 'cleave', 'Ariete de Marfil'],
  ]),
  ...family('puerto_bruma', 'madrigal', [
    ['shellclack', 'Cangrejo Cascabel', 'crab', 0xd36e52, 1.18, 1, 'hound', 'stone', 'cleave', 'Pinza Melódica'],
    ['windkite', 'Cometa de Sal', 'bird', 0x4dabc1, 1.45, 4, 'phoenix', 'storm', 'bolt', 'Ráfaga Salina'],
    ['bubblefin', 'Aletaburbuja', 'serpent', 0x4e91db, 1.6, 2, 'hydra', 'tide', 'bolt', 'Bomba de Burbujas'],
    ['mintjelly', 'Medusa Menta', 'puff', 0x76c795, 1.35, 4, 'mutant', 'venom', 'pulse', 'Niebla de Menta'],
    ['pearlward', 'Guarda de Nácar', 'sentinel', 0xb3d3ca, 1.68, 4, 'golem', 'light', 'pulse', 'Escudo de Nácar'],
  ]),
  ...family('puerto_bruma', 'lorencia', [
    ['blackreef', 'Pinza de Arrecife Negro', 'crab', 0x374050, 1.55, 3, 'mutant', 'void', 'cleave', 'Prensa Abisal'],
    ['riptide', 'Víbora de Resaca', 'serpent', 0x236a73, 1.92, 3, 'hydra', 'tide', 'pulse', 'Resaca Profunda'],
    ['stormdrake', 'Draco del Faro Roto', 'wyvern', 0x43598e, 1.95, 1, 'dragon', 'storm', 'bolt', 'Rayo del Faro'],
    ['anchorshade', 'Sombra del Ancla', 'sentinel', 0x323c52, 1.95, 2, 'shadow', 'void', 'bolt', 'Cadena Espectral'],
    ['saltfang', 'Acechador de Salmuera', 'beast', 0x456565, 1.54, 2, 'hound', 'frost', 'cleave', 'Mordida Salobre'],
  ]),
  ...family('crater_ceniza', 'madrigal', [
    ['sparkmite', 'Ácaro Chispa', 'bug', 0xb8573e, 1.18, 5, 'mutant', 'ember', 'cleave', 'Pinzas de Chispa'],
    ['cinderlily', 'Lirio de Ceniza', 'plant', 0xb7494d, 1.8, 5, 'phoenix', 'ember', 'pulse', 'Floración Ígnea'],
    ['honeydrake', 'Draco de Miel', 'wyvern', 0xda9835, 1.8, 3, 'dragon', 'light', 'bolt', 'Llama Dorada'],
    ['ashgull', 'Gaviota de Carbón', 'bird', 0x4b5668, 1.65, 5, 'phoenix', 'storm', 'bolt', 'Ala Electrizante'],
    ['glassimp', 'Diablillo de Vidrio', 'sprite', 0x864eb1, 1.6, 4, 'goblin', 'frost', 'pulse', 'Cristal de Vapor'],
  ]),
  ...family('crater_ceniza', 'lorencia', [
    ['slagwyrm', 'Sierpe de Escoria', 'serpent', 0x5b4a40, 2.12, 4, 'lava_giant', 'ember', 'pulse', 'Oleada de Escoria'],
    ['obsidian', 'Caballero de Obsidiana', 'sentinel', 0x353349, 2.02, 5, 'mech', 'void', 'cleave', 'Filo de Obsidiana'],
    ['ashclaw', 'Garra de Magma', 'crab', 0xa44832, 1.65, 5, 'balrog', 'ember', 'cleave', 'Garra Fundida'],
    ['redwake', 'Draco de la Estela Roja', 'wyvern', 0x772e4f, 2.12, 5, 'dragon', 'ember', 'bolt', 'Estela Carmesí'],
    ['voidram', 'Carnero del Vacío', 'beast', 0x49394a, 1.9, 5, 'boss', 'void', 'pulse', 'Embestida del Vacío'],
  ]),
];

export const SPECIES_BY_ID = new Map(BESTIARY.map(species => [species.id, species]));
