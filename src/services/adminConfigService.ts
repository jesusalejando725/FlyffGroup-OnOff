import section0 from '../../ADMIN/world-rules.json';
import section1 from '../../ADMIN/monsters.json';
import section2 from '../../ADMIN/items.json';
import section3 from '../../ADMIN/item-options.json';
import section4 from '../../ADMIN/npcs.json';
import section5 from '../../ADMIN/classes-skills.json';
export type AdminSectionKey =
  | 'world-rules'
  | 'monsters'
  | 'items'
  | 'item-options'
  | 'npcs'
  | 'classes-skills';

export interface AdminWorldRules {
  brandName: string;
  version: string;
  cityRadiusMeters: number;
  detailStreamRadiusMeters: number;
  wingRunSpeedMultiplier: number;
  baseRunSpeed: number;
  stripManmadeStructures: boolean;
  safeZoneCombatBlocked: boolean;
  safeZoneMonsterExclusion: boolean;
  maps: Record<
    string,
    {
      name?: string;
      cityRadius: number;
      sizeMeters: number;
      minLevel: number;
      maxLevel: number;
      warpZen: number;
      weather: string;
      ambientBed: string;
      musicTheme: string;
      targetMonsterCount: number;
      spawn?: { x: number; z: number };
    }
  >;
}

export interface AdminConfigBundle {
  'world-rules': AdminWorldRules;
  monsters: Record<string, any>;
  items: Record<string, any>;
  'item-options': Record<string, any>;
  npcs: Record<string, any>;
  'classes-skills': Record<string, any>;
}

// Configuration is versioned together with the offline client. Only repository edits apply.
const cachedBundle: AdminConfigBundle = {
  'world-rules': section0,
  'monsters': section1,
  'items': section2,
  'item-options': section3,
  'npcs': section4,
  'classes-skills': section5,
};

export function getAdminConfigSync(): AdminConfigBundle {
  return cachedBundle;
}

export async function loadAdminConfig(): Promise<AdminConfigBundle> {
  return cachedBundle;
}
