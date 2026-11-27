import type { MonsterSpawnDef } from '../types/game.ts';
import { BESTIARY } from './bestiary.ts';
import { MU_MAPS, MU_SHOP_CATALOG } from './muWorldData.ts';
import { ARTISAN_CATALOG } from './artisanEquipment.ts';
import { INVASIONS } from './worldInvasions.ts';
import monsters from '../../ADMIN/monsters.json' with { type: 'json' };
import npcs from '../../ADMIN/npcs.json' with { type: 'json' };
import bundled from '../../ADMIN/live-world.json' with { type: 'json' };
import models from './creatureModels.json' with { type: 'json' };

export type WorldMap = 'flaris' | 'robledal' | 'puerto_bruma' | 'crater_ceniza';
export const mapKeys = ['flaris', 'robledal', 'puerto_bruma', 'crater_ceniza'] as const;
export const canonicalMap = (id: string) => id === 'puerto' ? 'puerto_bruma' : id === 'ceniza' ? 'crater_ceniza' : id;
export const monsterFields = {
  hp: [1, 1e8], damage: [0, 1e7], xp: [0, 1e8], zen: [0, 1e8],
  strength: [0, 10000], agility: [0, 10000], vitality: [0, 10000], energy: [0, 10000],
  roamRadius: [0, 200], respawnSeconds: [1, 3600],
} as const;
export const invasionFields = {
  count: [1, 30], hp: [1, 10000], attack: [0, 10000], zen: [0, 1e8],
  levels: [0, 99], points: [0, 1e6], pieces: [0, 30], roamRadius: [0, 200],
} as const;

type Numbers<K extends string> = Partial<Record<K, number>>;
export type MonsterRule = Numbers<keyof typeof monsterFields>;
export type Position = { x: number; z: number };
export type GroupRule = Position & { map: WorldMap; monsterId: string; count: number };
export type NpcRule = Position & { name?: string; mapId?: WorldMap; stock?: Record<string, number> };
export type InvasionRule = Numbers<keyof typeof invasionFields> & { x?: number; z?: number; map?: WorldMap };
export type LiveWorld = {
  revision: string;
  monsters: Record<string, MonsterRule>;
  groups: GroupRule[];
  npcs: Record<string, NpcRule>;
  invasions: Record<string, InvasionRule>;
};
export const defaultLiveWorld = bundled as LiveWorld;

export const modelMonsters = models.map(glb => {
  const id = glb.slice('monstruos/'.length, -4);
  return { id: 'glb_' + id, name: id, glb };
});
export const monsterChoices = [
  ...BESTIARY,
  ...MU_MAPS.flatMap(map => map.monsters.map(monster => ({ id: monster.id, name: monster.name }))),
  ...monsters.extraCatalog.map(monster => ({ id: 'adm_' + monster.id, name: monster.name })),
  ...modelMonsters,
];
export const npcChoices = npcs.npcs;
const monsterIds = new Set(monsterChoices.map(x => x.id));
const npcIds = new Set(npcChoices.map(x => x.id));
const itemIds = new Set([...MU_SHOP_CATALOG, ...ARTISAN_CATALOG].map(x => x.id));
const invasionById = new Map(INVASIONS.map(x => [x.id, x]));

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw Error('Se esperaba un objeto.');
  return value as Record<string, unknown>;
}
function integer(value: unknown, [min, max]: readonly [number, number], field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw Error(`${field}: usa un número entero entre ${min} y ${max}.`);
  return value;
}
function fields<T extends Record<string, readonly [number, number]>>(row: Record<string, unknown>, limits: T) {
  return Object.fromEntries(Object.entries(limits).filter(([key]) => Object.hasOwn(row, key))
    .map(([key, range]) => [key, integer(row[key], range, key)])) as Numbers<Extract<keyof T, string>>;
}
function entries<T>(input: unknown, accept: (key: string) => boolean, convert: (value: unknown, id: string) => T) {
  return Object.fromEntries(Object.entries(object(input)).map(([key, value]) => {
    if (!accept(key)) throw Error(`ID desconocido: ${key}`);
    return [key, convert(value, key)];
  }));
}
export function positionsAt({ x, z }: Position, count: number) {
  return Array.from({ length: count }, (_, n) => ({
    x: x + Math.cos(n * 2.399963) * Math.sqrt(n) * 3,
    z: z + Math.sin(n * 2.399963) * Math.sqrt(n) * 3,
  }));
}
function mapId(value: unknown): WorldMap {
  if (!mapKeys.includes(value as WorldMap)) throw Error('Elige uno de los cuatro mapas.');
  return value as WorldMap;
}
function position(row: Record<string, unknown>, field: string): Position {
  return { x: integer(row.x, [40, 3032], `${field}: X`), z: integer(row.z, [40, 3032], `${field}: Z`) };
}
function checkSpawn(pos: Position, count: number, margin: number) {
  if (positionsAt(pos, count).some(({ x, z }) => x < 40 || z < 40 || x > 3032 || z > 3032 ||
      MU_MAPS.some(map => Math.hypot(x - map.spawn.x, z - map.spawn.z) <= map.cityRadius + margin))) {
    throw Error('La aparición y su grupo deben quedar fuera de las zonas seguras y dentro del mapa.');
  }
}

export function validateLiveWorld(input: unknown): LiveWorld {
  const data = object(input);
  if (typeof data.revision !== 'string' || !/^[a-z0-9-]{1,64}$/.test(data.revision)) throw Error('Revisión inválida.');
  if (!Array.isArray(data.groups) || data.groups.length > 80) throw Error('Máximo de 80 grupos.');
  return {
    revision: data.revision,
    monsters: entries(data.monsters, id => monsterIds.has(id), value => fields(object(value), monsterFields)),
    groups: data.groups.map(value => {
      const row = object(value);
      const map = row.map as WorldMap;
      const monsterId = row.monsterId;
      if (!mapKeys.includes(map) || typeof monsterId !== 'string' || !monsterIds.has(monsterId))
        throw Error('Elige un mapa y una especie del catálogo.');
      const count = integer(row.count, [1, 16], 'Cantidad');
      const pos = position(row, 'Grupo');
      checkSpawn(pos, count, 10);
      return { map, monsterId, count, ...pos };
    }),
    npcs: entries(data.npcs, id => npcIds.has(id), value => {
      const row = object(value);
      const result: NpcRule = position(row, 'NPC');
      if (row.mapId !== undefined) result.mapId = mapId(row.mapId);
      if (row.name !== undefined) {
        if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 72) throw Error('Nombre de NPC inválido.');
        result.name = row.name.trim();
      }
      if (row.stock !== undefined) result.stock = entries(row.stock, id => itemIds.has(id),
        (price, id) => integer(price, [0, 1e8], id));
      return result;
    }),
    invasions: entries(data.invasions, id => invasionById.has(id), (value, id) => {
      const row = object(value);
      const rules: InvasionRule = fields(row, invasionFields);
      if (row.map !== undefined) rules.map = mapId(row.map);
      if (row.x !== undefined || row.z !== undefined) {
        const pos = position(row, 'Invasión');
        checkSpawn(pos, rules.count ?? invasionById.get(id)!.count, 45);
        Object.assign(rules, pos);
      }
      return rules;
    }),
  };
}

export function applyMonsterRule(def: MonsterSpawnDef, rule: MonsterRule | undefined): MonsterSpawnDef {
  if (!rule) return def;
  return {
    ...def,
    maxHp: (rule.hp ?? def.maxHp) + 10 * (rule.vitality ?? 0),
    attack: (rule.damage ?? def.attack) + (rule.strength ?? 0) + (rule.energy ?? 0),
    defense: def.defense + Math.floor((rule.agility ?? 0) / 2),
    moveSpeed: 3.4 + Math.min(3, (rule.agility ?? 0) / 100),
    xpReward: rule.xp ?? def.xpReward,
    zenMin: rule.zen ?? def.zenMin,
    zenMax: rule.zen ?? def.zenMax,
    roamRadius: rule.roamRadius ?? def.roamRadius,
    respawnSeconds: rule.respawnSeconds ?? def.respawnSeconds,
  };
}
