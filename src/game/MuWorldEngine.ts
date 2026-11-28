import { itemAssets, itemModelFile, armorModelFile } from '../data/itemVisualAssets';
import { flightAltitude, type FlightMode } from './flight';
import { equippedGearBonuses, rollFlyffDrops } from '../data/flyffEconomy';
import madrigalSites from '../data/madrigalSpawns.json';
import { capitalPortals, CRATER_NPC_SAFE_RADIUS, inProtectedArea, nearestRegion } from './worldRegions';
import creatureModels from '../data/creatureModels.json' with {type:'json'};
import { flightHeight } from './content/WingRig';
import { invasionSites, invasionWindow, type Invasion } from '../data/worldInvasions';
import { applyMonsterRule, canonicalMap, modelMonsters, positionsAt } from '../data/liveWorld';
import { getLiveWorld, refreshLiveWorld, worldInvasions } from '../services/liveWorldService';
import { CAMP_SIZE, CAMP_RESPAWN_SECONDS, MONSTER_WANDER_RADIUS, populateRegionalCamps, reachableHuntingLand, regionalTemplate, SpawnGrid, type CampMember } from './encounters';
import {
  AnimationGroup,
  ArcRotateCamera,
  AssetContainer,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  NullEngine,
  ParticleSystem, PBRMaterial,
  Scene,
  SceneLoader,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders';
import { ITEM_BY_ID } from '../data/itemCatalog';
import { WorldContentManager } from './WorldContent';
import { computeHeroDamageStats, getEffectiveSkillMultiplier } from './combatAndProgression';
import { damageAgainstMonster, MONSTER_POWER_ENERGY, monsterCombatStats } from './monsterCombat';
import { MU_SKILLS, skillPresentation } from '../data/muSkillsAndClasses';
import { soundSynth } from './soundSynth';
import { DEFAULT_CAMERA_DISTANCE, type LootFilterSettings } from './worldPhysicsMath';
import { BESTIARY, SPECIES_BY_ID, type MonsterElement, type AttackStyle } from '../data/bestiary';
import { creatureFx } from './CreatureEffects';
import { MU_MAPS, getMapById } from '../data/muWorldData';
import { getAdminConfigSync, loadAdminConfig } from '../services/adminConfigService';
import type {
  EventType,
  FloatingDamageNumber,
  HeroClass,
  ItemSlot,
  LootDropInfo,
  MapDef,
  MapId,
  MinimapEntitySnapshot,
  MonsterPower,
  MonsterSpawnDef,
  MuCharacter,
  MuItem,
  NpcDef,
  RoomPeer,
  SkillDef,
} from '../types/game';
import type { WorldTelemetryInfo } from '../components/MuHudOverlay';

export interface TargetMonsterInfo {
  id: string;
  currentHp: number;
  currentEnergy: number;
  autoAimPct: number;
  dist: number;
  stats: {
    name: string;
    scaledLevel: number;
    maxHp: number;
    maxEnergy: number;
    strength: number;
    defense: number;
    powers: MonsterPower[];
    damageTable: {
      playerEstNormal: number;
      playerEstCrit: number;
      basicAttack: number;
      criticalHit: number;
      critChancePct: number;
      specialPower: number;
    };
  };
}

export interface EngineCallbacks {
  onEquipmentWear?: (slot: ItemSlot, durability: number) => void;
  onGroupHit?: (id:string, damage:number,maxHp:number)=>boolean;
  onKillMonster?: (xp: number, zen: number, invasion?: Invasion) => void | Promise<void>;
  onPickupLoot?: (drop: LootDropInfo) => void | Promise<void>;
  onPlayerDamaged?: (rawAmount: number, isCrit: boolean) => void;
  onMonsterPowerHit?: (power: MonsterPower, damage: number) => void;
  onTargetMonsterChange?: (target: TargetMonsterInfo | null) => void;
  onHeroMoveSync?: (x: number, z: number, rotY: number, action: string) => void;
  onBossHitInEvent?: (damage: number) => void;
  onFloatingText?: (text: string, color: string) => void;
  onDamageNumber?: (dmg: FloatingDamageNumber) => void;
  onNearbyNpcChange?: (npc: NpcDef | null) => void;
  onOpenNpc?: (npc: NpcDef) => void;
  onFpsUpdate?: (fps: number) => void;
  onMinimapUpdate?: (snap: MinimapEntitySnapshot) => void;
  onAutoHuntAttack?: () => void;
  onWorldTelemetry?: (info: WorldTelemetryInfo) => void;
}

function monsterAttackProfile(file: string): { name: string; element: MonsterElement; style: AttackStyle } {
  if (/aibatt|flybat|meteonyker|demian/.test(file)) return { name: 'Descarga', element: 'storm', style: 'bolt' };
  if (/bang|clockwork|rockmuscle|jackhammer|grrr/.test(file)) return { name: 'Onda sísmica', element: 'stone', style: 'pulse' };
  if (/fefern|mushpang|pukepuke|burudeng/.test(file)) return { name: 'Esporas', element: 'venom', style: 'pulse' };
  return { name: 'Zarpazo', element: 'void', style: 'cleave' };
}

interface ActiveMonster {
  id: string;
  def: MonsterSpawnDef;
  glbFile: string;
  invasion?: Invasion;
  scaledLevel: number;
  maxHp: number;
  hp: number;
  maxEnergy: number;
  energy: number;
  attack: number;
  defense: number;
  x: number;
  z: number;
  approachHeight?: number;
  homeX: number;
  homeZ: number;
  rotY: number;
  root?: TransformNode;
  animations: AnimationGroup[];
  activeAnim: string;
  actionTime: number;
  powerCooldown: number;
  originalSpecies?: string;
  model?: TransformNode;
  modelPending?: boolean;
  retryAt?: number;
  attackFx: string;
  hitCooldown: number;
  respawnAt: number;
  camp?: number;
  strike?: { remaining: number; power?: MonsterPower; range: number; element: MonsterElement; style: AttackStyle };
  alive: boolean;
}

interface ActiveNpc {
  def: NpcDef;
  root: TransformNode;
  animations: AnimationGroup[];
}

interface ActiveLoot {
  info: LootDropInfo;
  mesh: Mesh;
  createdAt: number;
}

interface ActiveRemotePeer {
  peer: RoomPeer;
  node: Mesh;
}

const AVAILABLE_MONSTER_GLBS = [
  'monstruos/aibatt.glb',
  'monstruos/bang.glb',
  'monstruos/basque.glb',
  'monstruos/burudeng.glb',
  'monstruos/cardpuppet.glb',
  'monstruos/clockwork.glb',
  'monstruos/demian.glb',
  'monstruos/doridoma.glb',
  'monstruos/fefern.glb',
  'monstruos/flybat.glb',
  'monstruos/grrr.glb',
  'monstruos/hobo.glb',
  'monstruos/jackhammer.glb',
  'monstruos/lawolf.glb',
  'monstruos/meteonyker.glb',
  'monstruos/mia.glb',
  'monstruos/mrpumpkin.glb',
  'monstruos/mushpang.glb',
  'monstruos/pukepuke.glb',
  'monstruos/rockmuscle.glb',
];
const AVAILABLE_MONSTER_SET = new Set(creatureModels);

const AVAILABLE_NPC_GLBS = new Set([
  'npcs/boboku.glb',
  'npcs/guard.glb',
  'npcs/guidepang.glb',
  'npcs/juria.glb',
  'npcs/lui.glb',
  'npcs/marche.glb',
]);

function resolveNpcGlb(raw?: string, role?: string): string {
  if (raw && AVAILABLE_NPC_GLBS.has(raw)) return raw;
  if (raw?.includes('losha')) return 'npcs/marche.glb';
  if (raw?.includes('tina')) return 'npcs/lui.glb';
  if (role === 'blacksmith') return 'npcs/boboku.glb';
  if (role === 'wizard' || role === 'magic') return 'npcs/juria.glb';
  if (role === 'chaos_goblin') return 'npcs/guidepang.glb';
  if (role === 'guard') return 'npcs/guard.glb';
  return 'npcs/lui.glb';
}

function resolveMonsterGlb(raw?: string, indexFallback = 0): string {
  if (raw && AVAILABLE_MONSTER_SET.has(raw)) return raw;
  if (raw) {
    const lower = raw.toLowerCase();
    for (const candidate of AVAILABLE_MONSTER_GLBS) {
      if (lower.includes(candidate.replace('monstruos/', '').replace('.glb', ''))) {
        return candidate;
      }
    }
  }
  return AVAILABLE_MONSTER_GLBS[indexFallback % AVAILABLE_MONSTER_GLBS.length];
}

function normalizeAdminCoord(x: number, z: number): { x: number; z: number } {
  // ADMIN coordinates use the same world axes as the engine.
  const nx = x;
  const nz = z;
  return {
    x: Math.max(40, Math.min(3032, nx)),
    z: Math.max(40, Math.min(3032, nz)),
  };
}

export class MuWorldEngine {
  public engine: Engine | NullEngine;
  public scene: Scene;
  public camera: ArcRotateCamera;
  public flyff: WorldContentManager;
  public mode: 'title' | 'character_select' | 'playing' = 'title';

  private mount: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private callbacks: EngineCallbacks;
  private headless: boolean;
  private warmedSkillClasses = new Set<HeroClass>();
  private hemiLight: HemisphericLight;
  private dirLight: DirectionalLight;
  private heroRoot: TransformNode;

  private currentMap: MapDef = getMapById('flaris');
  private heroStats: MuCharacter | null = null;
  private heroX = 1336;
  private heroY = 0;
  private heroZ = 1281;
  private hoverOffset = 0;
  private wingPhase = 0;
  private altitude = 0;
  private flightMode: FlightMode = 'auto';

  public toggleFlight(): void {
    if (this.mode !== 'playing') return;
    if (this.flightMode === 'flight') { this.flightMode = 'landing'; return; }
    if (!this.flyff.actor?.gear.wings?.equipped) {
      this.callbacks.onFloatingText?.('Equipa alas para volar', '#fbbf24');
      return;
    }
    this.altitude = Math.max(this.altitude, this.hoverOffset);
    this.flightMode = 'flight';
  }

  private resetFlight(): void {
    this.altitude = this.hoverOffset = this.wingLift = 0;
    this.flightMode = 'auto';
  }
  private wingLift = 0;
  private openSky = 0;
  private heroRotY = Math.PI;
  private heroVelY = 0;
  private isGrounded = true;

  private joyX = 0;
  private joyY = 0;
  private keys = new Set<string>();
  private brightness = 1.08;
  private free3dMode = false;
  private cameraDistance = DEFAULT_CAMERA_DISTANCE;
  private autoAimAssist = true;
  private targetFps: 30 | 45 | 60 = 60;
  private autoHuntEnabled = false;
  private helperRange = 3;
  private activeBonuses = { magicBonusPct:0, atkBonusPct: 0, speedBonusPct: 0, critBonusPct: 0 };

  private monsters: ActiveMonster[] = [];
  private campMarkers: {x:number;z:number}[] = [];
  private monsterGrid = new SpawnGrid<ActiveMonster>();
  private eventMobs: ActiveMonster[] = [];
  private eventKey = '';
  private loadedMonsters = new Set<ActiveMonster>();
  private monsterRoamLimit = 40;
  private monsterScan = 0;
  private npcs: ActiveNpc[] = [];
  private loots: ActiveLoot[] = [];
  private remotePeers = new Map<string, ActiveRemotePeer>();
  private entityContainerCache = new Map<string, AssetContainer>();
  private lootMatCache = new Map<string, StandardMaterial>();
  private weatherParticles: ParticleSystem | null = null;
  private entityBuildToken = 0;

  private lastTargetId: string | null = null;
  private get creatureEffectsRoot(): TransformNode {
    const name = 'creature-effects-root';
    return this.scene.getTransformNodeByName(name) ?? new TransformNode(name, this.scene);
  }

  private playMonsterSound(mob: ActiveMonster, event: 'atk1' | 'dmg1' | 'die1'): void {
    soundSynth.playMonsterSound(mob.glbFile, event);
  }

  private lastNearbyNpcId: string | null = null;
  private streamAccum = 0;
  private streamingDetails = false;
  private uiTickAccum = 0;
  private syncMoveAccum = 0;
  private autoHuntAccum = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private attackSwingTimer = 0;
  private comboUntil = 0;
  private mapVersion = 0;
  private lastFrameTime = performance.now();
  private disposed = false;
  private eventActive = false;
  private currentEventType: EventType | null = null;
  private hitCounter = 0;

  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onResizeBound: () => void;

  constructor(mount: HTMLElement, callbacks: EngineCallbacks, options?: { headless?: boolean }) {
    this.mount = mount;
    this.callbacks = callbacks;
    this.headless = Boolean(options?.headless);

    if (this.headless) {
      this.engine = new NullEngine();
    } else {
      const canvas = document.createElement('canvas');
      canvas.className = 'w-full h-full block outline-none touch-none';
      this.mount.innerHTML = '';
      this.mount.appendChild(canvas);
      this.canvas = canvas;
      this.engine = new Engine(canvas, true, {
        preserveDrawingBuffer: false,
        antialias: true,
        powerPreference: 'high-performance',
      });
    }

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.08, 0.14, 0.24, 1);

    this.hemiLight = new HemisphericLight('hemi', new Vector3(0.1, 1, 0.1), this.scene);
    this.hemiLight.intensity = 1.15;
    this.hemiLight.groundColor = new Color3(0.22, 0.24, 0.28);

    this.dirLight = new DirectionalLight('sun', new Vector3(-0.45, -0.85, -0.35), this.scene);
    this.dirLight.intensity = 1.45;
    this.dirLight.position = new Vector3(40, 80, 40);

    this.heroRoot = new TransformNode('mu_hero_root', this.scene);
    this.heroRoot.position.set(this.heroX, this.heroY, this.heroZ);

    this.camera = new ArcRotateCamera(
      'mu_cam',
      -Math.PI / 2,
      1.14,
      this.cameraDistance,
      new Vector3(this.heroX, this.heroY + 1.55, this.heroZ),
      this.scene,
    );
    this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    this.camera.panningSensibility = 0;
    this.camera.minZ = 0.2;
    this.camera.maxZ = 950;
    this.camera.lowerRadiusLimit = 2;
    this.camera.upperRadiusLimit = 50;
    this.camera.lowerBetaLimit = 0.08;
    this.camera.upperBetaLimit = Math.PI - .08;
    if (this.canvas) {
      this.camera.attachControl(this.canvas, true);
    }

    this.flyff = new WorldContentManager(this.scene);

    this.applyAdminWorldRules();
    this.onKeyDownBound = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement?.tagName || '').toUpperCase())) return;
      this.keys.add(e.code);
    };
    this.onKeyUpBound = (e) => {
      this.keys.delete(e.code);
    };
    this.onResizeBound = () => {
      this.engine.resize();
    };

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('resize', this.onResizeBound);

    this.engine.runRenderLoop(() => {
      if (this.disposed || document.hidden) return;
      const now = performance.now();
      const rawDt = Math.min(0.1, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      if (this.targetFps < 60 && rawDt < 1 / this.targetFps) {
        return;
      }
      this.elapsedFrame = (now-this.lastFrameTime)/1000;
      this.lastFrameTime = now;
      this.step(rawDt);
      this.scene.render();
    });
  }

  private applyAdminWorldRules(): void {
    const rules = getAdminConfigSync()['world-rules'];
    this.flyff.world.setDetailRadius(rules.detailStreamRadiusMeters ?? 180);
    this.flyff.world.setStripManmadeStructures(rules.stripManmadeStructures !== false);
  }

  public async unlockAudio(): Promise<void> {
    soundSynth.unlockAudio();
    this.flyff.fx.unlockAudio?.();
  }

  public setAudio(volume: number, muted: boolean): void {
    soundSynth.volume = volume;
    soundSynth.muted = muted;
  }

  public setBrightness(val: number): void {
    this.brightness = Math.max(0.5, Math.min(1.6, val));
    this.hemiLight.intensity = 1.05 * this.brightness;
    this.dirLight.intensity = 1.35 * this.brightness;
  }

  public setFree3dMode(enabled: boolean): void {
    this.free3dMode = enabled;
    if (!enabled) {
      this.camera.beta = 1.14;
      this.camera.alpha = -Math.PI / 2;
    }
  }

  public setCameraDistance(dist: number): void {
    this.cameraDistance = Math.max(2, Math.min(50, dist));
    if (this.mode === 'playing') this.camera.radius = this.cameraDistance;
  }

  public setAutoAimAssist(enabled: boolean): void {
    this.autoAimAssist = enabled;
  }

  public setTargetFps(fps: 30 | 45 | 60): void {
    this.targetFps = fps;
  }

  public setAutoHuntEnabled(enabled: boolean, range = 3): void {
    this.helperRange = range;
    this.autoHuntEnabled = enabled;
    if (enabled) this.autoHuntAccum = 1.1;
  }

  public setActiveEffectBonuses(bonuses: { magicBonusPct:number; atkBonusPct: number; speedBonusPct: number; critBonusPct: number }): void {
    this.activeBonuses = bonuses;
  }

  public resizeView() { this.engine.resize(); }
  public rotatePreview(delta: number) {
    if (this.mode === 'character_select') this.camera.alpha -= delta * .013;
  }
  public setMode(mode: 'title' | 'character_select' | 'playing'): void {
    this.mode = mode;
    if (mode !== 'playing') {
      soundSynth.setShoreline(0);
      this.camera.lowerRadiusLimit = 2;
      this.camera.radius = 5.25;
      this.camera.beta = 1.28;
      this.camera.alpha = -Math.PI / 2;
      this.camera.target.set(this.heroX, this.heroY + 1.15, this.heroZ);
      soundSynth.setMapMusic('login');
      if (mode === 'character_select') void this.showSelectionRegion();
    } else {
      this.camera.lowerRadiusLimit = 2;
      this.camera.radius = this.cameraDistance;
      this.camera.beta = 1.14;
      const rules = getAdminConfigSync()['world-rules'];
      const mapCfg = rules.maps?.[this.currentMap.id] || rules.maps?.[this.currentMap.id.replace('_bruma', '').replace('crater_', '')];
      soundSynth.setMapMusic(mapCfg?.musicTheme || this.currentMap.id);
    }
  }

  private async showSelectionRegion() {
    const map = MU_MAPS[Math.floor(Math.random() * MU_MAPS.length)];
    const version = ++this.mapVersion;
    const { x, z } = map.spawn;
    try {
      await this.flyff.world.stream(x, z, 0, 450);
      if (this.disposed || this.mode !== 'character_select' || version !== this.mapVersion) return;
      this.heroX = x; this.heroZ = z;
      this.heroY = this.flyff.world.getGroundHeight(x,z);
      this.heroRoot.position.set(x,this.heroY,z);
      this.camera.target.set(x,this.heroY+1.15,z);
    } catch (error) { console.warn('Vista del mapa no disponible', error); }
  }

  public updateHeroStats(character: MuCharacter | null): void {
    this.heroStats = character;
  }

  public async syncHeroAppearance(
    classType: HeroClass,
    equippedItems: MuItem[],
    sex: 'male' | 'female' = 'male',
    appearanceId?: string,
  ): Promise<void> {
    const actor = await this.flyff.setActor(classType, sex, equippedItems, appearanceId);
    if (actor && !this.disposed) {
      if (!this.warmedSkillClasses.has(classType)) {
        this.warmedSkillClasses.add(classType);
        const skills = MU_SKILLS[classType].map(skill => skillPresentation(classType, skill));
        void Promise.all(skills.map(({ effect }) => this.flyff.fx.preloadEffect(effect)));
        void Promise.all(skills.map(({ sound }) => soundSynth.preloadSkill(sound)));
      }
      actor.root.parent = this.heroRoot;
      actor.root.position.set(0, 0, 0);
      actor.root.rotation.y = this.heroRotY;
    }
  }

  public async loadMap(
    mapId: MapId,
    resetPose = true,
    savedPose?: { x: number; z: number; rotY?: number },
  ): Promise<void> {
    this.resetFlight();
    const version = ++this.mapVersion;
    await Promise.all([loadAdminConfig(), refreshLiveWorld()]);
    if (version !== this.mapVersion || this.disposed) return;
    this.comboUntil = 0;
    const map = getMapById(mapId);
    if (savedPose && savedPose.x >= 20 && savedPose.x <= map.worldSize-20 && savedPose.z >= 20 && savedPose.z <= map.worldSize-20) {
      this.heroX = savedPose.x;
      this.heroZ = savedPose.z;
      this.heroRotY = savedPose.rotY ?? Math.PI;
    } else if (resetPose || savedPose) {
      this.heroX = map.spawn.x;
      this.heroZ = map.spawn.z;
      this.heroRotY = Math.PI;
    }

    await this.flyff.world.stream(this.heroX, this.heroZ, 0, 450);
    if (version !== this.mapVersion || this.disposed) return;
    this.heroY = this.flyff.world.getGroundHeight(this.heroX, this.heroZ);
    this.heroRoot.position.set(this.heroX, this.heroY, this.heroZ);
    if (this.flyff.actor) {
      this.flyff.actor.root.rotation.y = this.heroRotY;
    }

    this.applyRegion(nearestRegion(MU_MAPS,this.heroX,this.heroZ));
    if (this.entityRevision !== getLiveWorld().revision || this.entityHeroId !== this.heroStats?.id) await this.rebuildMapEntities();
    this.emitTelemetry();
    this.emitMinimap();
  }

  private applyRegion(map: MapDef) {
    this.currentMap = map;
    const rules = getAdminConfigSync()['world-rules'];
    const mapKey = map.id === 'puerto_bruma' ? 'puerto' : map.id === 'crater_ceniza' ? 'ceniza' : map.id;
    const adminMap = rules.maps?.[map.id] || rules.maps?.[mapKey];

    const sky = Color3.FromHexString(map.skyColor || '#1e3554');
    this.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = sky;
    this.scene.fogStart = 230;
    this.scene.fogEnd = 450;

    this.setupWeatherParticles(adminMap?.weather || (map.id === 'crater_ceniza' || map.id === 'losttower' ? 'embers' : map.id === 'robledal' || map.id === 'noria' ? 'petals' : 'leaves'));
    if (this.mode === 'playing') {
      soundSynth.setMapMusic(adminMap?.musicTheme || mapKey);
    }

  }

  private setupWeatherParticles(weather: string): void {
    try {
      this.weatherParticles?.stop();
      this.weatherParticles?.dispose();
    } catch {
      // ignore
    }
    this.weatherParticles = null;
    if (this.headless || this.scene.isDisposed) return;

    try {
      const ps = new ParticleSystem(`weather_${weather}_${Date.now()}`, 120, this.scene);
      const texFile =
        weather === 'petals'
          ? './mugroup/efectos/texturas/obj_mamaprtree.png'
          : weather === 'embers'
            ? './mugroup/efectos/texturas/sfx_genlight01-1.png'
            : './mugroup/efectos/texturas/obj_mamaprtree.png';
      const tex = new Texture(texFile, this.scene, false, true);
      tex.hasAlpha = true;
      ps.particleTexture = tex;
      ps.emitter = this.heroRoot as unknown as AbstractMeshAlias;
      ps.minEmitBox = new Vector3(-22, 8, -22);
      ps.maxEmitBox = new Vector3(22, 16, 22);
      if (weather === 'embers') {
        ps.color1 = new Color4(1.0, 0.45, 0.12, 0.85);
        ps.color2 = new Color4(1.0, 0.8, 0.25, 0.65);
        ps.gravity = new Vector3(0.4, 1.4, 0.2);
      } else if (weather === 'petals') {
        ps.color1 = new Color4(1.0, 0.78, 0.88, 0.85);
        ps.color2 = new Color4(1.0, 0.9, 0.95, 0.7);
        ps.gravity = new Vector3(0.8, -1.6, 0.5);
      } else {
        ps.color1 = new Color4(0.65, 0.9, 0.55, 0.82);
        ps.color2 = new Color4(0.95, 0.85, 0.45, 0.65);
        ps.gravity = new Vector3(0.9, -1.9, 0.4);
      }
      ps.colorDead = new Color4(1, 1, 1, 0);
      ps.minSize = 0.18;
      ps.maxSize = 0.42;
      ps.minLifeTime = 2.2;
      ps.maxLifeTime = 4.2;
      ps.emitRate = 24;
      ps.start();
      this.weatherParticles = ps;
    } catch {
      // ignore headless
    }
  }

  public setJoystickVector(x: number, y: number): void {
    this.joyX = Math.max(-1, Math.min(1, x));
    this.joyY = Math.max(-1, Math.min(1, y));
  }

  public jump(): void {
    if (!this.isGrounded || this.mode !== 'playing') return;
    this.heroVelY = 7.4;
    this.isGrounded = false;
    this.flyff.actor?.playClip('jump_start', false);
    soundSynth.playJump(this.heroStats?.sex);
  }

  public getHeroPose(): { x: number; z: number; rotY: number; mapId: MapId; altitude:number } {
    return { altitude:this.hoverOffset, x: this.heroX, z: this.heroZ, rotY: this.heroRotY, mapId: nearestRegion(MU_MAPS,this.heroX,this.heroZ).id };
  }

  public getEffectiveCityRadius(): number {
    const rules = getAdminConfigSync()['world-rules'];
    return this.cityRadius(this.currentMap, rules);
  }

  private cityRadius(map: MapDef, rules = getAdminConfigSync()['world-rules']): number {
    const value = Number(rules.maps?.[map.id]?.cityRadius ?? rules.maps?.[map.id.replace('_bruma', '').replace('crater_', '')]?.cityRadius ?? rules.cityRadiusMeters ?? map.cityRadius);
    return Number.isFinite(value) ? Math.max(1, Math.min(500, value)) : 500;
  }

  private craterNpcZones: { x: number; z: number; radius: number }[] = [];

  private isSafePoint(x: number, z: number, margin = 0): boolean {
    const rules = getAdminConfigSync()['world-rules'];
    return MU_MAPS.some(map => (x - map.spawn.x) ** 2 + (z - map.spawn.z) ** 2 <= (this.cityRadius(map, rules) + margin) ** 2) ||
      inProtectedArea(x, z, margin, this.craterNpcZones);
  }

  public isInSafeCity(): boolean {
    return this.isSafePoint(this.heroX, this.heroZ);
  }

  public respawnInCurrentCity(): { x: number; z: number; rotY: number } {
    this.resetFlight();
    this.heroX = this.currentMap.spawn.x;
    this.heroZ = this.currentMap.spawn.z;
    this.heroY = this.flyff.world.getGroundHeight(this.heroX, this.heroZ);
    this.heroRotY = Math.PI;
    this.heroRoot.position.set(this.heroX, this.heroY + this.hoverOffset, this.heroZ);
    return this.getHeroPose();
  }

  public setEventActive(active: boolean, eventType?: EventType): void {
    this.eventActive = active;
    this.currentEventType = active ? (eventType ?? 'blood_castle') : null;
  }

  public async syncRemotePeers(peers: RoomPeer[], localPeerId: string): Promise<void> {
    const keepIds = new Set<string>();
    for (const peer of peers) {
      if (peer.peerId === localPeerId) continue;
      keepIds.add(peer.peerId);
      let entry = this.remotePeers.get(peer.peerId);
      if (!entry) {
        const node = MeshBuilder.CreateCapsule(`peer_${peer.peerId}`, { radius: 0.35, height: 1.75 }, this.scene);
        const mat = new StandardMaterial(`peer_mat_${peer.peerId}`, this.scene);
        mat.diffuseColor = Color3.FromHexString('#34d399');
        mat.emissiveColor = new Color3(0.08, 0.35, 0.22);
        node.material = mat;
        node.isPickable = false;
        entry = { peer, node };
        this.remotePeers.set(peer.peerId, entry);
      }
      entry.peer = peer;
      const py = this.flyff.world.getGroundHeight(peer.x, peer.z);
      entry.node.position.set(peer.x, py + .9 + (peer.altitude ?? 0), peer.z);
      entry.node.rotation.y = peer.rotY || 0;
    }

    for (const [id, entry] of [...this.remotePeers.entries()]) {
      if (!keepIds.has(id)) {
        entry.node.dispose();
        this.remotePeers.delete(id);
      }
    }
  }

  private resolveHeroSkillClip(skill: SkillDef): string {
    const cls = this.heroStats?.classType || 'DK';
    const actor = this.flyff.actor;
    if (!actor) return skill.isBuff ? 'cast_release' : 'attack';

    const slotIdx = Math.max(0, Math.min(6, Number(skill.keyHint || 1) - 1));
    const clip = 'power_'+slotIdx;
    if (actor.hasClip(clip)) return clip;
    if ((skill.isBuff || cls === 'DW' || (cls === 'DL' && slotIdx >= 1) || (cls === 'MG' && slotIdx >= 2)) && actor.hasClip('cast_release')) return 'cast_release';
    return 'attack';
  }

  public executeSkill(skill: SkillDef, _comboStep = 1, baseStatPower = 40): void {
    if (this.mode !== 'playing') return;
    if (!skill.isBuff && this.isInSafeCity()) return;
    const skillIndex = Math.max(0, Number(skill.keyHint) - 1);
    const clipName = this.resolveHeroSkillClip(skill);
    this.attackSwingTimer = this.flyff.actor?.playClip(clipName, false) || 0.48;
    if (!clipName.startsWith('power_')) this.flyff.actor?.setCombatMotion(this.attackSwingTimer, skillIndex, !!skill.isBuff);

    const version=this.mapVersion, actorId=this.heroStats?.id;
    window.setTimeout(()=>{
      if (this.disposed || this.mode!=='playing' || version!==this.mapVersion || actorId!==this.heroStats?.id || (!skill.isBuff && this.isInSafeCity())) return;
      this.resolveImpact(skill,baseStatPower);
    }, Math.min(155,this.attackSwingTimer*300));
  }

  private resolveImpact(skill: SkillDef, baseStatPower: number) {
    const {element,style,effect,sound}=skillPresentation(this.heroStats?.classType ?? 'DK',skill);
    const origin = new Vector3(this.heroX, this.heroY + this.hoverOffset + 0.9, this.heroZ);
    const forward = new Vector3(Math.sin(this.heroRotY), 0, Math.cos(this.heroRotY));
    const reach = skill.range + (this.autoAimAssist ? 2.5 : 1.5);
    const targetMob = skill.isBuff ? null : this.findNearestTarget(reach);

    if (targetMob && this.autoAimAssist && !this.isInSafeCity()) {
      this.heroRotY = Math.atan2(targetMob.x - this.heroX, targetMob.z - this.heroZ);
      if (this.flyff.actor) {
        this.flyff.actor.root.rotation.y = this.heroRotY;
      }
    }

    const fxPos = targetMob
      ? new Vector3(targetMob.x, this.mobY(targetMob) + 0.65, targetMob.z)
      : skill.isBuff ? origin : origin.add(forward.scale(2.4));

    void this.flyff.fx.play(effect, fxPos, 1.05, {
      colorHex: skill.colorHex,
      casterPos: origin,
      targetPos: fxPos,
    });
    soundSynth.playSkill(sound);
    const signature = creatureFx(this.scene, this.creatureEffectsRoot, origin, fxPos, element, style);
    window.setTimeout(() => { if (!signature.isDisposed()) signature.dispose(); }, 430);

    if (skill.isBuff) {
      this.emitDamageNumber(50, 38, `+${skill.shortName}`, skill.colorHex, false);
      return;
    }

    const hits: ActiveMonster[] = [];
    for (const mob of this.nearMonsters(reach)) {
      if (!mob.alive || this.isSafePoint(mob.x, mob.z)) continue;
      const d = this.distanceToMob(mob);
      if (d <= reach) {
        hits.push(mob);
      }
    }
    hits.sort(
      (a, b) =>
        this.distanceToMob(a) - this.distanceToMob(b),
    );
    const affected = skill.damageMultiplier >= 2.0 ? hits.slice(0, 4) : hits.slice(0, 1);

    const gear = equippedGearBonuses(this.flyff.getLastEquippedItems());
    const stats = this.heroStats && computeHeroDamageStats(this.heroStats,this.flyff.getLastEquippedItems());
    const critChance = (stats?.critPct ?? 14) + this.activeBonuses.critBonusPct;
    if (stats) {
      const magical = (this.heroStats?.classType === 'DW') || (this.heroStats?.classType !== 'ELF' && style === 'bolt');
      if (magical) baseStatPower *= 1+this.activeBonuses.magicBonusPct/100;
      baseStatPower *= .65 + .35*(magical ? stats.magicPower : stats.physicalPower)/stats.avgAttack;
    }
    for (const mob of affected) {
      if (mob.def.evasionPct && Math.random() * 100 < Math.max(0, mob.def.evasionPct - (gear.accuracyPct ?? 0))) {
        this.emitDamageNumber(48, 34, 'Esquiva', '#94a3b8', false);
        continue;
      }
      const mult = this.heroStats
        ? getEffectiveSkillMultiplier(skill, this.heroStats)
        : skill.damageMultiplier;
      const atkBonus = 1 + this.activeBonuses.atkBonusPct / 100;
      const isCrit = Math.random() * 100 < critChance;
      const rawDmg = baseStatPower * mult * atkBonus * (isCrit ? 1.55 + (gear.critDamagePct ?? 0) / 100 : 0.92 + Math.random() * 0.16);
      const effectiveDefense = mob.defense * (1 - (gear.ignoreDefensePct ?? 0) / 100);
      const finalDmg = this.damageToMonster(mob, rawDmg, effectiveDefense);

      if (!this.callbacks.onGroupHit?.(this.groupMobId(mob),finalDmg,mob.maxHp)) mob.hp = Math.max(0, mob.hp - finalDmg);
      if (!mob.strike && mob.actionTime <= 0) this.playMonsterAnim(mob, 'hit', false);
      this.playMonsterSound(mob, 'dmg1');

      this.emitDamageNumber(
        48 + (Math.random() * 10 - 5),
        34 + (Math.random() * 8 - 4),
        isCrit ? `${finalDmg}!` : `${finalDmg}`,
        isCrit ? '#fbbf24' : '#ffffff',
        isCrit,
      );

      if (this.eventActive && mob.def.isBoss && !mob.invasion) {
        this.callbacks.onBossHitInEvent?.(finalDmg);
      }

      if (mob.hp <= 0) {
        this.handleMonsterDefeated(mob);
      }
    }

    if (affected.length > 0 && Math.random() < 0.22 && this.heroStats) {
      const wearSlot: ItemSlot = 'weapon';
      const eq = this.flyff.getLastEquippedItems().find((i: MuItem) => i.slot === wearSlot && i.isEquipped);
      if (eq) {
        const nextDur = Math.max(0, (eq.durability ?? 100) - 1);
        this.callbacks.onEquipmentWear?.(wearSlot, nextDur);
      }
    }
  }

  public canStartCombo(): boolean {
    return this.mode === 'playing' && !this.isInSafeCity() && performance.now() >= this.comboUntil;
  }

  public executeComboChain(skills: SkillDef[], baseStatPower = 40): void {
    if (!this.canStartCombo()) return;
    const seq = skills.slice(0, 5);
    const version = this.mapVersion;
    this.comboUntil = performance.now() + seq.length * 210;
    seq.forEach((sk, idx) => {
      window.setTimeout(() => {
        if (!this.disposed && this.mode === 'playing' && version === this.mapVersion && !this.isInSafeCity()) {
          this.executeSkill(sk, idx + 1, baseStatPower * (1 + idx * 0.08));
        }
      }, idx * 210);
    });
  }

  private lootGoal: ActiveLoot | null = null;
  public collectAutoLoot(filters: LootFilterSettings): void {
    this.lootGoal = null;
    let best = Infinity;
    for (const loot of this.loots) {
      const d = Math.hypot(loot.info.x-this.heroX,loot.info.z-this.heroZ);
      const height = Math.abs(this.heroY+this.hoverOffset-(loot.info.y-.35));
      if (filters[loot.info.kind] && d <= 6 && height <= 4.01 && d < best) {
        this.lootGoal = loot;
        best = d;
      }
    }
  }
  public cancelLootApproach() { this.lootGoal = null; }

  private pickupLootIndex(idx: number): void {
    const loot = this.loots[idx];
    if (!loot) return;
    loot.mesh.dispose();
    this.loots.splice(idx, 1);
    soundSynth.playJewelDrop();
    void this.callbacks.onPickupLoot?.(loot.info);
  }

  private damageToMonster(mob: ActiveMonster, damage: number, defense = mob.defense): number {
    return damageAgainstMonster(damage, defense, this.heroStats?.level ?? 1, this.heroStats?.resets ?? 0, mob.scaledLevel);
  }

  private reviveMonster(mob: ActiveMonster, now: number): void {
    if (mob.alive || now < mob.respawnAt) return;
    mob.alive = true;
    mob.hp = mob.maxHp;
    mob.energy = mob.maxEnergy;
    mob.approachHeight = undefined;
    mob.x = mob.homeX;
    mob.z = mob.homeZ;
    mob.hitCooldown = 1.2;
    mob.powerCooldown = 2;
    mob.actionTime = 0;
    mob.activeAnim = '';
    if (mob.root) {
      mob.root.position.set(mob.x, this.flyff.world.getGroundHeight(mob.x, mob.z), mob.z);
      this.playMonsterAnim(mob, 'stand', true);
    }
  }

  private groupMobId(m: ActiveMonster) {
    return m.invasion ? `event-${m.invasion.map}-${m.invasion.id}-${m.id.split(':').pop()}-${m.respawnAt}` : m.id;
  }
  public groupPositions(): NonNullable<RoomPeer['nearby']> {
    return [...this.loadedMonsters].filter(m=>m.alive).slice(0,96).map(m=>({id:this.groupMobId(m),x:m.x,z:m.z,rot:m.rotY}));
  }
  public applyGroupPositions(peer:RoomPeer) {
    if (peer.currentMapId!==this.currentMap.id || !peer.nearby?.length) return;
    const poses=new Map(peer.nearby.map(p=>[p.id,p]));
    for (const m of this.loadedMonsters) {
      const p=poses.get(this.groupMobId(m));
      if (p && m.alive) {m.x=p.x;m.z=p.z;m.rotY=p.rot;if(m.root)m.root.rotation.y=p.rot;}
    }
  }
  public applyGroupHealth(id:string,hp:number,mapId:string) {
    if (this.mode!=='playing' || this.currentMap.id!==mapId) return;
    const mob=id.startsWith("event-") ? this.eventMobs.find(m=>this.groupMobId(m)===id) : this.monsters.find(m=>m.id===id);
    if (!mob?.alive) return;
    mob.hp=Math.min(mob.maxHp,hp);
    if (mob.hp===0) this.handleMonsterDefeated(mob);
  }

  private handleMonsterDefeated(mob: ActiveMonster): void {
    if (!mob.alive) return;
    mob.alive = false;
    this.playMonsterAnim(mob, 'death', false);
    this.playMonsterSound(mob, 'die1');
    if (mob.invasion) {
      const e = mob.invasion;
      localStorage.setItem(mob.id,String(mob.respawnAt));
      mob.respawnAt = Infinity; mob.strike = undefined;
      void this.callbacks.onKillMonster?.(0,e.zen,e);
      const pool = [...ITEM_BY_ID.values()].filter(i => !i.dropExclusive).filter(i =>
        ['helm','armor','pants','boots','gloves'].includes(i.slot) || (e.id !== 'red' && i.slot === 'weapon') ||
        (e.id !== 'red' && e.id !== 'selupan' && i.slot === 'shield')).map(i=>i.id);
      if (Math.random() < .2) this.spawnLootDrop(mob.x,mob.z,0,true,['soul','bless','life']);
      for (let i=0; i<e.pieces; i++) this.spawnLootDrop(mob.x+1.5*Math.cos(i*2.4),mob.z+1.5*Math.sin(i*2.4),0,true,pool);
      return;
    }
    const adminRespawn = Number(getAdminConfigSync().monsters?.respawnSeconds || CAMP_RESPAWN_SECONDS);
    mob.strike = undefined;
    mob.respawnAt = performance.now() + (mob.def.respawnSeconds ?? adminRespawn) * 1000;

    const zen =
      mob.def.zenMin + Math.floor(Math.random() * Math.max(1, mob.def.zenMax - mob.def.zenMin));
    void this.callbacks.onKillMonster?.(mob.def.xpReward, 0);
    if (zen > 0 && mob.def.drops?.length !== 0) this.spawnLootDrop(mob.x, mob.z, zen, false, ['zen']);
    rollFlyffDrops(mob.def).forEach((id, i) => {
      const angle = i * 2.399963;
      this.spawnLootDrop(mob.x + Math.cos(angle), mob.z + Math.sin(angle), 0, false, [id]);
    });
  }

  private spawnLootDrop(x: number, z: number, zenAmount: number, isBoss?: boolean, allowed?: string[]): void {
    let kind: LootDropInfo['kind'] = 'zen';
    let amount = zenAmount, label = `${amount} Zen`, color = '#fbbf24';

    const y = this.flyff.world.getGroundHeight(x, z) + 0.35;
    const id = `loot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let catalogId: string | undefined;
    if (allowed?.length) {
      const selected = allowed[Math.floor(Math.random() * allowed.length)];
      const item = ITEM_BY_ID.get(selected);
      if (item) {
        kind = 'equipment'; catalogId = item.id; color = '#60a5fa';
      } else kind = selected as LootDropInfo['kind'];
      amount = kind === 'zen' ? zenAmount : 1;
      label = item?.name ?? (kind === 'zen' ? `${amount} Zen` : kind.toUpperCase());
    }

    const item = catalogId ? ITEM_BY_ID.get(catalogId) : undefined;
    const sex = item?.sexFilter ?? this.heroStats?.sex ?? 'male';
    const model = item ? itemModelFile(item) ?? armorModelFile(item,sex) : ['soul','bless','life'].includes(kind) ? '../openmu/models/drop_'+kind+'.glb' : undefined;
    const icon = item ? itemAssets(item.name)?.icon ?? (item.recovery ? 'ui/hp_potion.png' : undefined) :
      kind === 'zen' ? 'ui/items/zen.webp' : ['soul','bless','life'].includes(kind) ? 'ui/items/jewel-'+kind+'.webp' : undefined;
    const palette: Record<string,string> = {zen:'#e6bb53',bless:'#ed7564',soul:'#79a8ff',life:'#d183ef'};
    color = item?.recovery ? item.recovery.mp && !item.recovery.hp ? '#519bed' : '#d85560' : palette[kind] ?? color;
    const mesh = item?.recovery ? MeshBuilder.CreateLathe(id,{shape:[new Vector3(.11,0,0),new Vector3(.21,.07,0),new Vector3(.19,.26,0),new Vector3(.08,.32,0),new Vector3(.08,.41,0)],tessellation:10},this.scene) :
      item?.id==='flyff_cannonball' ? MeshBuilder.CreateSphere(id,{diameter:.38,segments:10},this.scene) :
      item?.id==='flyff_element_card' ? MeshBuilder.CreateBox(id,{height:.45,width:.29,depth:.025},this.scene) :
      item?.id==='flyff_arrow' ? MeshBuilder.CreateCylinder(id,{height:.8,diameterTop:.025,diameterBottom:.06},this.scene) :
      kind === 'zen' ? MeshBuilder.CreateCylinder(id,{diameter:.55,height:.13,tessellation:18},this.scene) :
      MeshBuilder.CreatePolyhedron(id,{type:kind==='soul'?2:1,size:.27},this.scene);
    mesh.position.set(x,y,z);
    mesh.isPickable=false;
    let mat=this.lootMatCache.get(color);
    if (!mat) {
      mat=new StandardMaterial('drop-'+color,this.scene);
      mat.diffuseColor=Color3.FromHexString(color); mat.emissiveColor=mat.diffuseColor.scale(.48);
      this.lootMatCache.set(color,mat);
    }
    mesh.material=mat;
    if (icon) {
      let badge=this.lootMatCache.get(icon);
      if (!badge) {
        badge=new StandardMaterial('drop-'+icon,this.scene);
        badge.diffuseTexture=new Texture('./mugroup/'+icon,this.scene);
        badge.diffuseTexture.hasAlpha=true; badge.useAlphaFromDiffuseTexture=true;
        badge.emissiveColor=Color3.White(); badge.backFaceCulling=false;
        this.lootMatCache.set(icon,badge);
      }
      const plane=MeshBuilder.CreatePlane(id+'-icon',{size:.72},this.scene);
      plane.parent=mesh; plane.position.y=.68; plane.billboardMode=Mesh.BILLBOARDMODE_ALL;
      plane.material=badge; plane.isPickable=false;
    }
    if (model) void this.getOrLoadEntityContainer(model).then(container=>{
      if (!container || mesh.isDisposed() || this.disposed) return;
      const built=this.instantiateNormalizedModel(container,id,.85);
      built.root.parent=mesh;
      for (const anim of built.animations) anim.dispose();
      const part = item && ({helm:'helmet',armor:'torso',pants:'torso',boots:'feet',gloves:'hands'} as Partial<Record<ItemSlot,string>>)[item.slot];
      if (part) for (const child of built.root.getChildMeshes()) {
        if (child.getTotalVertices() && !child.name.includes('equip_'+part+'_')) child.setEnabled(false);
      }
      mesh.visibility=0;
    });

    this.loots.push({
      info: { id, kind, catalogId, label, amount, x, y, z },
      mesh,
      createdAt: performance.now(),
    });
  }

  private entityBounds = new WeakMap<AssetContainer, { minY: number; height: number }>();
  private pendingModels = new Map<string, Promise<AssetContainer | null>>();
  private getOrLoadEntityContainer(relPath: string): Promise<AssetContainer | null> {
    const pending = this.pendingModels.get(relPath);
    if (pending) return pending;
    const request = this.loadContainer(relPath).finally(() => this.pendingModels.delete(relPath));
    this.pendingModels.set(relPath, request);
    return request;
  }

  private async loadContainer(relPath: string): Promise<AssetContainer | null> {
    if (this.entityContainerCache.has(relPath)) {
      return this.entityContainerCache.get(relPath)!;
    }
    try {
      const full = `./mugroup/${relPath}`;
      const idx = full.lastIndexOf('/');
      const c = await SceneLoader.LoadAssetContainerAsync(
        full.slice(0, idx + 1),
        full.slice(idx + 1),
        this.scene,
      );
      if (this.disposed || this.scene.isDisposed) {
        c.dispose();
        return null;
      }
      this.entityContainerCache.set(relPath, c);
      return c;
    } catch {
      return null;
    }
  }

  private instantiateNormalizedModel(
    container: AssetContainer,
    prefix: string,
    targetHeight: number,
    ownMaterials = false,
  ): { root: TransformNode; animations: AnimationGroup[] } {
    const inst = container.instantiateModelsToScene(
      (n) => `${prefix}_${n}`,
      false,
      { doNotInstantiate: ownMaterials },
    );
    const root = new TransformNode(`${prefix}_root`, this.scene);
    const bounds = this.entityBounds.get(container);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const rn of inst.rootNodes) {
      rn.parent = root;
      if (!bounds) rn.computeWorldMatrix(true);
      if ('getChildMeshes' in rn) for (const m of rn.getChildMeshes(false)) {
        m.isPickable = false;
        if (bounds) continue;
        m.computeWorldMatrix(true);
        const box = m.getBoundingInfo().boundingBox;
        minY = Math.min(minY, box.minimumWorld.y);
        maxY = Math.max(maxY, box.maximumWorld.y);
      }
    }
    const height = maxY - minY;
    const dimensions = bounds ?? {
      minY: Number.isFinite(minY) ? minY : 0,
      height: Number.isFinite(height) && height > .1 ? height : 1.75,
    };
    if (!bounds) this.entityBounds.set(container, dimensions);
    root.onDisposeObservable.addOnce(() => {
      for (const skeleton of inst.skeletons) skeleton.dispose();
    });
    const scale = Math.max(0.04, Math.min(4.0, targetHeight / dimensions.height));
    const offsetY = -dimensions.minY * scale;

    for (const rn of inst.rootNodes) {
      if ('scaling' in rn && rn.scaling instanceof Vector3) {
        rn.scaling.scaleInPlace(scale);
      }
      if ('position' in rn && rn.position instanceof Vector3) {
        rn.position.y += offsetY;
      }
    }

    return { root, animations: [...inst.animationGroups] };
  }

  private playMonsterAnim(mob: ActiveMonster, name: string, loop = true): void {
    if (loop && (mob.actionTime > 0 || mob.activeAnim === name)) return;
    mob.activeAnim = name;
    if (!loop) {
      mob.actionTime = name === 'atk1' ? 0.6 : 0.25;
      // A hit cannot cancel an attack that is already winding up.
    }
    const clip = mob.glbFile === 'monstruos/besibigfoot.glb' && name === 'hit' ? 'dmg1' :
      mob.glbFile === 'monstruos/besibigfoot.glb' && name === 'death' ? 'die1' : name;
    const lower = clip.toLowerCase();
    const ag =
      mob.animations.find((a) => a.name.toLowerCase() === lower) ||
      mob.animations.find((a) => a.name.toLowerCase().includes(lower)) ||
      (name === 'fly' ? mob.animations.find(a => /walk/i.test(a.name)) : undefined) || mob.animations[0];
    if (!ag) return;
    for (const other of mob.animations) {
      if (other !== ag && other.isPlaying) other.stop();
    }
    try {
      ag.stop();
      ag.start(loop, 1.0, ag.from, ag.to, false);
    } catch {
      // ignore in headless
    }
  }

  private entityRevision = '';
  private entityHeroId?: string;
  private resettingEntities = false;

  public async applyWorldRevision(onReset?: () => void): Promise<void> {
    if (this.disposed || this.resettingEntities || this.entityRevision === getLiveWorld().revision) return;
    this.resettingEntities = true;
    onReset?.();
    const version = this.mapVersion;
    ++this.entityBuildToken;
    this.clearMapEntities();
    this.emitMinimap();
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (this.disposed || version !== this.mapVersion) return;
      await this.rebuildMapEntities();
      this.emitMinimap();
    } finally {
      this.resettingEntities = false;
    }
  }

  private clearMapEntities(): void {
    this.comboUntil = 0;
    for (const m of this.loadedMonsters) this.unloadMonster(m);
    this.monsterGrid.clear();
    for (const n of this.npcs) {
      for (const ag of n.animations) ag.dispose();
      n.root.dispose();
    }
    for (const l of this.loots) l.mesh.dispose();
    this.monsters = [];
    this.campMarkers = [];
    this.eventMobs = []; this.eventKey = '';
    this.npcs = [];
    this.craterNpcZones = [];
    if (this.lastNearbyNpcId !== null) this.callbacks.onNearbyNpcChange?.(null);
    this.lastNearbyNpcId = null;
    this.loots = [];
  }

  private async rebuildMapEntities(): Promise<void> {
    const token = ++this.entityBuildToken;
    this.clearMapEntities();
    const live = getLiveWorld();
    const adminCfg = getAdminConfigSync();
    const adminNpcsRaw = Array.isArray(adminCfg.npcs?.npcs) ? adminCfg.npcs.npcs : [];
    const adminMapNpcs: Array<NpcDef & { model?: string }> = adminNpcsRaw
      .filter((n: any) => MU_MAPS.some(m=>m.id === canonicalMap(live.npcs[n.id]?.mapId ?? n.mapId)))
      .map((n: any) => {
        const rule = live.npcs[n.id];
        const pos = normalizeAdminCoord(rule?.x ?? Number(n.x || 0), rule?.z ?? Number(n.z || 0));
        return {
          id: n.id,
          name: rule?.name ?? n.name,
          title: n.title || 'Comerciante',
          role: (n.role === 'potions' ? 'potion' : n.role === 'elf' || n.role === 'wizard' ? 'magic' : n.role) as NpcDef['role'],
          mapId: canonicalMap(rule?.mapId ?? n.mapId) as MapId,
          x: pos.x,
          z: pos.z,
          colorHex: '#fbbf24',
          model: n.model,
          stock: rule?.stock ?? (n.stock && typeof n.stock === 'object' ? n.stock : undefined),
        };
      });

    const npcList: Array<NpcDef & { model?: string }> = [...adminMapNpcs,...MU_MAPS.flatMap(map => adminMapNpcs.some(n => n.mapId === map.id)
      ? [] : map.npcs)];

    const npcGlbs = [...new Set(npcList.map((n) => resolveNpcGlb(n.model, n.role)))];
    // A live revision can arrive before the first terrain stream finishes.
    // Never mark the region populated against an empty height/water table.
    await Promise.all([this.flyff.world.ensureManifest(), ...npcGlbs.map(g=>this.getOrLoadEntityContainer(g))]);
    if (token !== this.entityBuildToken || this.disposed) return;

    this.craterNpcZones = npcList.filter(npc => npc.mapId === 'crater_ceniza')
      .map(({ x, z }) => ({ x, z, radius: CRATER_NPC_SAFE_RADIUS }));

    for (const npcDef of npcList) {
      const glbPath = resolveNpcGlb(npcDef.model, npcDef.role);
      const container = this.entityContainerCache.get(glbPath);
      const gy = this.flyff.world.getGroundHeight(npcDef.x, npcDef.z);

      let root: TransformNode;
      let animations: AnimationGroup[] = [];
      if (container) {
        const built = this.instantiateNormalizedModel(container, `npc_${npcDef.id}`, 1.85);
        root = built.root;
        animations = built.animations;
        const stand = animations.find((a) => a.name.toLowerCase() === 'stand') || animations[0];
        try {
          stand?.start(true, 1.0, stand.from, stand.to, false);
        } catch {
          // ignore
        }
      } else {
        root = new TransformNode(npcDef.id, this.scene);
      }

      root.position.set(npcDef.x, gy, npcDef.z);
      const city = getMapById(npcDef.mapId).spawn;
      root.rotation.y = Math.atan2(city.x - npcDef.x,city.z - npcDef.z);
      this.npcs.push({ def: npcDef, root, animations });
    }

    for (const {id,from,target,x,z} of capitalPortals(MU_MAPS)) {
      const root = new TransformNode(id,this.scene);
      root.position.set(x,this.flyff.world.getGroundHeight(x,z),z);
      if (!this.headless) {
        this.portalMaterial ??= new StandardMaterial('madrigal-portal',this.scene);
        this.portalMaterial.emissiveColor = Color3.FromHexString('#48a6ed');
        const ring = MeshBuilder.CreateTorus(id + '-ring',{diameter:3,thickness:.22},this.scene);
        ring.parent = root;
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 1.8;
        ring.material = this.portalMaterial;
        ring.isPickable = false;
      }
      this.npcs.push({root,animations:[],def:{id,name:target.name,title:'Teletransporte',mapId:from.id,
        role:'guard',x,z,colorHex:'#48a6ed',warpTarget:target.id}});
    }

    this.monsterRoamLimit = 0;
    this.monsterScan = 0;
    const size = MU_MAPS[0].worldSize;
    const land = (x: number, z: number) => this.flyff.world.isHuntingLand(x, z);
    const puerto = getMapById('puerto_bruma');
    const reachable = reachableHuntingLand(size, puerto.spawn, land, (x, z) => this.flyff.world.getGroundHeight(x, z));
    const camps = populateRegionalCamps(size, MU_MAPS.map(map => {
      const key = map.id === 'puerto_bruma' ? 'puerto' : map.id === 'crater_ceniza' ? 'ceniza' : map.id;
      return {
        id: map.id,
        count: Math.max(1, Math.min(5000, Math.ceil(adminCfg['world-rules'].maps[key].targetMonsterCount / CAMP_SIZE))),
        contains: (x, z) => nearestRegion(MU_MAPS, x, z).id === map.id,
        allows: (x, z) => (map.id === puerto.id ? reachable(x, z) : land(x, z)) && !this.isSafePoint(x, z, 12),
      };
    }), madrigalSites);
    for (const map of MU_MAPS) this.addRegionMonsters(map, camps.get(map.id) ?? [], live, adminCfg);
    this.entityRevision = live.revision;
    this.entityHeroId = this.heroStats?.id;
  }

  private portalMaterial?: StandardMaterial;

  private addRegionMonsters(map: MapDef, camps: CampMember[], live: ReturnType<typeof getLiveWorld>, adminCfg: ReturnType<typeof getAdminConfigSync>) {
    const mapKey = map.id === 'puerto_bruma' ? 'puerto' : map.id === 'crater_ceniza' ? 'ceniza' : map.id;
    const extraCatalog = Array.isArray(adminCfg.monsters?.extraCatalog) ? adminCfg.monsters.extraCatalog : [];
    const glbOverrides: Record<string, string> = adminCfg.monsters?.glbOverrides || {};
    type Template = { def: MonsterSpawnDef; glb: string; speciesId?: string; attackFx?: string };
    const templates: Template[] = [];
    const naturalTemplates: Template[] = BESTIARY.filter(s => s.map === map.id).map((species, i) => {
      const level = Math.min(map.maxLevel, map.minLevel + (i % 12));
      return { speciesId: species.id, glb: resolveMonsterGlb(species.shape==='wyvern' ? 'monstruos/meteonyker.glb' : species.shape==='bird' ? 'monstruos/mothbee.glb' : glbOverrides[species.id], i), def: {
        id: species.id, name: species.name, type: 'spider', level, scale: 1,
        colorHex: species.power.colorHex, maxHp: 110 + level * 30,
        attack: 11 + level * 2, defense: level, xpReward: 25 + level * 16,
        zenMin: level * 10, zenMax: level * 30, powers: [species.power],
      } };
    });
    templates.push(...naturalTemplates);

    for (let i = 0; i < map.monsters.length; i++) {
      const t = map.monsters[i];
      const key = t.name.toLowerCase().split(' ')[0];
      const original = t.id === 'beast_overlord_khan' ? 'monstruos/besibigfoot.glb' :
        t.id === 'boss_flaris_giant' ? 'monstruos/bang.glb' :
        t.id === 'boss_rob_clock' ? 'monstruos/clockwork.glb' : undefined;
      const glb = resolveMonsterGlb(glbOverrides[t.id] || glbOverrides[key] || original || 'monstruos/' + key + '.glb', i);
      templates.push({ def: t, glb });
    }

    // Add map-aligned extraCatalog entries + rotate through all 43 distinct GLBs so 40+ monster classes exist cleanly
    const pool = extraCatalog.filter((e: any) => !e.map || e.map === mapKey || e.map === map.id);
    for (let i = 0; i < pool.length; i++) {
      const e = pool[i];
      const levelScale = Math.max(1, map.minLevel);
      const isNativeMap = e.map === mapKey || e.map === map.id;
      const lvl = isNativeMap ? Number(e.level || levelScale) : Math.max(map.minLevel, Math.min(map.maxLevel, Number(e.level || levelScale)));
      const def: MonsterSpawnDef = {
        id: `adm_${e.id}`,
        name: e.name || e.id,
        type: 'spider',
        level: lvl,
        maxHp: Math.round(Number(e.hp || 180) * (isNativeMap ? 1 : 0.65 + map.minLevel / 50)),
        attack: Math.round(Number(e.damage || 22) * (isNativeMap ? 1 : 0.65 + map.minLevel / 60)),
        defense: Math.round(lvl * 0.9),
        xpReward: Number(e.xp || lvl * 18),
        zenMin: Math.round(Number(e.zen || lvl * 40) * 0.7),
        zenMax: Number(e.zen || lvl * 40),
        scale: e.isBoss ? 1.85 : 1.08,
        colorHex: e.isBoss ? '#ef4444' : '#f59e0b',
        isBoss: Boolean(e.isBoss),
      };
      templates.push({
        def,
        glb: resolveMonsterGlb(glbOverrides[e.id] || e.glb, i),
        attackFx: e.sfx,
      });
    }

    const presentGlbs = new Set(templates.map((t) => t.glb));
    for (let i = 0; i < creatureModels.length; i++) {
      const glb = creatureModels[i];
      if (presentGlbs.has(glb) || glb === 'monstruos/besibigfoot.glb') continue;
      presentGlbs.add(glb);
      const base = glb.replace('monstruos/', '').replace('.glb', '');
      const lvl = map.minLevel + (i % (map.maxLevel - map.minLevel + 1));
      templates.push({
        def: {
          id: `glb_${base}`,
          name: base.charAt(0).toUpperCase() + base.slice(1),
          type: 'spider',
          level: lvl,
          maxHp: 110 + lvl * 35,
          attack: 12 + lvl * 2,
          defense: Math.round(lvl * 0.8),
          xpReward: 40 + lvl * 14,
          zenMin: 80 + lvl * 20,
          zenMax: 160 + lvl * 40,
          scale: 1.05,
          colorHex: '#fbbf24',
        },
        glb,
      });
    }

    const regional = templates.filter(t => !t.def.isBoss && t.def.level >= map.minLevel && t.def.level <= map.maxLevel);
    const choices = regional.map(t => ({ level: t.def.level, template: t }));
    const campTemplates = new Map<number, Template>();
    const placements: { entry: Template; mx: number; mz: number; angle: number; camp?: number }[] = camps.map(
      ({ camp, x, z, heading, site }) => {
        let entry = campTemplates.get(camp);
        if (!entry) {
          const distance = Math.hypot(x - map.spawn.x, z - map.spawn.z);
          entry = regionalTemplate(choices, camp, distance, this.cityRadius(map, adminCfg['world-rules']), map.minLevel, map.maxLevel).template;
          if (site) {
            const matched = templates.find(t => t.glb === 'monstruos/' + site.model + '.glb');
            if (matched) entry = { ...matched, def: { ...matched.def, name: site.name, level: site.level } };
          }
          campTemplates.set(camp, entry);
        }
        return { entry, mx: x, mz: z, angle: heading, camp };
      },
    );
    // Give each regional giant one existing camp slot, without adding extra camps.
    const farCamps = placements.filter((p, i) => i % CAMP_SIZE === 0 && !camps[i].site)
      .sort((a, b) => Math.hypot(b.mx - map.spawn.x, b.mz - map.spawn.z) -
        Math.hypot(a.mx - map.spawn.x, a.mz - map.spawn.z));
    templates.filter(entry => entry.def.isBoss).forEach((entry, i) => {
      if (farCamps[i]) farCamps[i].entry = entry;
    });

    const extraGroups = live.groups.filter(group => group.map === map.id);
    const groups = [...(Array.isArray(adminCfg.monsters?.groups) ? adminCfg.monsters.groups.slice(0, 40) : []), ...extraGroups];
    for (const group of groups) {
      if (!group || (group.map !== mapKey && group.map !== map.id)) continue;
      let template = templates.find(t => t.def.id === group.monsterId || t.def.id === 'adm_' + group.monsterId);
      if (!template) {
        const species = SPECIES_BY_ID.get(group.monsterId);
        const model = modelMonsters.find(m => m.id === group.monsterId);
        const original = MU_MAPS.flatMap(map => map.monsters).find(m => m.id === group.monsterId);
        const catalog = extraCatalog.find((row: { id: string }) => 'adm_' + row.id === group.monsterId);
        if (species || model || original || catalog) {
          const level = catalog?.level ?? original?.level ?? map.minLevel;
          template = {
            def: original ?? { id: group.monsterId, name: species?.name ?? model?.name ?? catalog?.name ?? group.monsterId,
              type: 'spider', level, maxHp: catalog?.hp ?? 110 + level * 30, attack: catalog?.damage ?? 11 + level * 2,
              defense: level, xpReward: catalog?.xp ?? 25 + level * 16, zenMin: catalog?.zen ?? level * 10,
              zenMax: catalog?.zen ?? level * 30, scale: 1, colorHex: species?.power.colorHex ?? '#fbbf24',
              powers: species ? [species.power] : undefined },
            glb: resolveMonsterGlb(model?.glb ?? glbOverrides[species?.id ?? catalog?.id ?? ''] ?? catalog?.glb ??
              (original && 'monstruos/' + original.name.toLowerCase().split(' ')[0] + '.glb'), 0),
            speciesId: species?.id, attackFx: catalog?.sfx,
          };
        }
      }
      if (!template || !Number.isFinite(group.x) || !Number.isFinite(group.z)) continue;
      const number = (value: unknown, fallback: number, min: number, max: number) =>
        typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
      const def = { ...template.def,
        maxHp: number(group.hp, template.def.maxHp, 1, 1e8),
        attack: number(group.damage, template.def.attack, 0, 1e7),
        xpReward: number(group.xp, template.def.xpReward, 0, 1e8),
        zenMin: number(group.zen, template.def.zenMin, 0, 1e8),
        zenMax: number(group.zen, template.def.zenMax, 0, 1e8),
        roamRadius: number(group.roamRadius, MONSTER_WANDER_RADIUS, 0, 200),
        respawnSeconds: number(group.respawnSeconds, Number(adminCfg.monsters?.respawnSeconds ?? CAMP_RESPAWN_SECONDS), 1, 3600),
        drops: Array.isArray(group.drops) ? group.drops.filter((key: string) =>
          ['zen', 'bless', 'soul', 'life'].includes(key) || ITEM_BY_ID.has(key)) : undefined,
      };
      const count = Math.round(number(group.count, 1, 1, 16));
      for (let n = 0; n < count; n++) {
        const angle = n * 2.399963;
        const mX = group.x + Math.cos(angle) * Math.sqrt(n) * 3;
        const mZ = group.z + Math.sin(angle) * Math.sqrt(n) * 3;
        if (mX >= 40 && mX <= 3032 && mZ >= 40 && mZ <= 3032 && this.flyff.world.isHuntingLand(mX,mZ) && !this.isSafePoint(mX, mZ, 10))
          placements.push({ entry: { ...template, def }, mx: mX, mz: mZ, angle });
      }
    }

    for (const [i, { entry, mx, mz, angle, camp }] of placements.entries()) {
      const level = Math.max(map.minLevel, Math.min(map.maxLevel, entry.def.level));
      const stats = monsterCombatStats(level, entry.def.isBoss);
      const liveRule = live.monsters[entry.def.id];
      const scale = level / Math.max(1, entry.def.level);
      const tuned = applyMonsterRule(camp === undefined ? { ...entry.def, level } : {
        ...entry.def, level, maxHp: stats.maxHp, attack: stats.strength, defense: stats.defense,
        xpReward: Math.round(entry.def.xpReward * scale),
        zenMin: Math.round(entry.def.zenMin * scale), zenMax: Math.round(entry.def.zenMax * scale),
        respawnSeconds: CAMP_RESPAWN_SECONDS,
      }, liveRule);
      const def = camp !== undefined || scale === 1 ? tuned : {
        ...tuned, maxHp: Math.max(1, Math.round(tuned.maxHp * scale)), attack: Math.round(tuned.attack * scale),
        defense: Math.round(tuned.defense * scale), xpReward: Math.round(tuned.xpReward * scale),
        zenMin: Math.round(tuned.zenMin * scale), zenMax: Math.round(tuned.zenMax * scale),
      };
      const maxEnergy = stats.maxEnergy + (liveRule?.energy ?? 0);
      const mob: ActiveMonster = {
        id: `mob-${map.id}-${i}`,
        def, glbFile: entry.glb, camp,
        attackFx: entry.attackFx || (def.isBoss ? 'sfx_sklmerfury01' : 'sfx_hitsword01'),
        scaledLevel: def.level, maxHp: def.maxHp, hp: def.maxHp, attack: def.attack, defense: def.defense, maxEnergy, energy: maxEnergy,
        x: mx, z: mz, homeX: mx, homeZ: mz, rotY: angle,
        animations: [], activeAnim: '', hitCooldown: 1.2 + (i % 10) * 0.11,
        respawnAt: 0, powerCooldown: 2, actionTime: 0,
        originalSpecies: entry.speciesId, alive: true,
      };
      this.monsterRoamLimit = Math.max(this.monsterRoamLimit, def.roamRadius ?? (def.isBoss ? 15 : Number(adminCfg.monsters?.aggroRadiusMeters ?? 10)) + MONSTER_WANDER_RADIUS);
      if (camp !== undefined && i % CAMP_SIZE === 0) this.campMarkers.push({x:mx,z:mz});
      this.monsters.push(mob);
      this.monsterGrid.add(mx, mz, mob);
    }
  }

  private nearMonsters(radius: number): Iterable<ActiveMonster> {
    return this.localCandidates(radius);
  }

  private *localCandidates(radius: number): Iterable<ActiveMonster> {
    const now = performance.now();
    for (const mob of this.monsterGrid.near(this.heroX, this.heroZ, radius + this.monsterRoamLimit)) {
      this.reviveMonster(mob, now);
      yield mob;
    }
    for (const m of this.eventMobs) if (Math.hypot(m.x-this.heroX,m.z-this.heroZ) <= radius + (m.def.roamRadius ?? 40)) yield m;
  }

  private syncInvasions(now: number): void {
    if (!this.heroStats || this.resettingEntities) return;
    const active = worldInvasions().map(e=>({e,w:invasionWindow(e,now)})).filter(v=>v.w.active);
    const key = [this.heroStats.id,...active.map(v=>v.e.id+v.w.start)].join('/');
    if (key === this.eventKey) return;
    const retained = new Map(this.eventMobs.map(m=>[m.id,m]));
    this.eventKey = key; this.eventMobs = [];
    const level99 = getAdminConfigSync().monsters?.extraCatalog?.find((m:{level:number})=>m.level===99);
    for (const {e,w} of active) {
      const rule = getLiveWorld().invasions[e.id];
      const sites = rule?.x !== undefined && rule.z !== undefined ? positionsAt({x: rule.x, z: rule.z}, e.count)
        : invasionSites(e,w.start,this.currentMap.worldSize || 3072,(x,z)=>!this.flyff.world.isHuntingLand(x,z) || this.isSafePoint(x,z,45) || nearestRegion(MU_MAPS,x,z).id !== e.map);
      const hp = (level99?.hp ?? 11400)*e.hp, attack = (level99?.damage ?? 425)*e.attack;
      const maxEnergy = monsterCombatStats(99, true).maxEnergy;
      sites.forEach(({x,z},i)=>{
        if (!this.flyff.world.isHuntingLand(x,z) || this.isSafePoint(x,z,45)) return;
        const id = ['invasion',this.heroStats!.id,e.id,i].join(':');
        if (localStorage.getItem(id) === String(w.start)) return;
        const old = retained.get(id);
        if (old?.respawnAt === w.start) { this.eventMobs.push(old); retained.delete(id); return; }
        this.eventMobs.push({id, invasion:e, def:{id,name:e.name,type:'boss',level:99,maxHp:hp,attack,defense:99,
          xpReward:0,zenMin:e.zen,zenMax:e.zen,scale:2,colorHex:e.color,isBoss:true,roamRadius:rule?.roamRadius ?? 40},
          glbFile:e.model,attackFx:'sfx_sklmerfury01',scaledLevel:99,maxHp:hp,hp,attack,defense:99,maxEnergy,energy:maxEnergy,
          x,z,homeX:x,homeZ:z,rotY:0,animations:[],activeAnim:'',hitCooldown:1,powerCooldown:3,actionTime:0,respawnAt:w.start,alive:true});
      });
    }
    for (const m of retained.values()) this.unloadMonster(m);
  }

  private unloadMonster(mob: ActiveMonster): void {
    this.loadedMonsters.delete(mob);
    for (const group of mob.animations) group.dispose();
    mob.root?.dispose();
    mob.animations = [];
    mob.model = undefined;
    mob.root = undefined;
    mob.modelPending = false;
    mob.strike = undefined;
    mob.actionTime = 0;
  }

  private streamMonsters(radius: number): void {
    for (const mob of this.loadedMonsters) {
      if (Math.hypot(this.heroX - mob.x, this.heroZ - mob.z) > radius + 28) this.unloadMonster(mob);
    }
    for (const mob of this.nearMonsters(radius)) {
      if (mob.root || Math.hypot(this.heroX - mob.x, this.heroZ - mob.z) > radius) continue;
      const root = new TransformNode(mob.id, this.scene);
      root.position.set(mob.x, this.flyff.world.getGroundHeight(mob.x, mob.z), mob.z);
      root.rotation.y = mob.rotY;
      mob.root = root;
      this.loadedMonsters.add(mob);
    }
  }

  private mobFlight(m: ActiveMonster) {
    const shape = m.originalSpecies && SPECIES_BY_ID.get(m.originalSpecies)?.shape;
    if (shape !== 'bird' && shape !== 'wyvern' && !/(aibatt|flybat|mothbee|flbyrigen|roachfl|meteonyker|burudeng|luia)\.glb$/i.test(m.glbFile)) return 0;
    return (m.approachHeight ?? [2,5,7,8][Math.abs(Math.round(m.homeX + m.homeZ)) % 4]) + .22*Math.sin(this.flyff.worldClock*4 + m.homeX);
  }

  private mobY(m: ActiveMonster) {
    return this.flyff.world.getGroundHeight(m.x,m.z) + this.mobFlight(m);
  }

  private distanceToMob(m: ActiveMonster) {
    return Math.hypot(m.x-this.heroX,m.z-this.heroZ,this.mobY(m)-this.heroY-this.hoverOffset);
  }

  private findNearestTarget(maxDist = 18): ActiveMonster | null {
    let best: ActiveMonster | null = null;
    let bestD = maxDist;
    for (const m of this.nearMonsters(maxDist)) {
      if (!m.alive || this.isSafePoint(m.x, m.z)) continue;
      const d = this.distanceToMob(m);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  private emitDamageNumber(xPct: number, yPct: number, text: string, color: string, isCritical: boolean): void {
    this.callbacks.onDamageNumber?.({
      id: ++this.hitCounter,
      xPct,
      yPct,
      text,
      color,
      isCritical,
    });
  }

  private elapsedFrame = 0;
  private step(dt: number): void {
    this.fpsAccum += this.elapsedFrame;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.6) {
      this.callbacks.onFpsUpdate?.(Math.round(this.fpsFrames / this.fpsAccum));
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    if (this.mode !== 'playing') {
      if (this.flyff.actor) {
        this.flyff.actor.playClip('idle', true);
      }
      this.flyff.update(dt, this.heroY, 'stand', this.heroX, this.heroZ);
      return;
    }

    const rules = getAdminConfigSync()['world-rules'];
    const baseSpeed = Number(rules?.baseRunSpeed || 14.0);
    const hasWings = Boolean(this.flyff.actor?.gear?.wings?.equipped);
    const wingSpeedMult = hasWings ? Number(rules?.wingRunSpeedMultiplier ?? 1.0) : 1.0;

    let moveX = this.joyX;
    let moveZ = this.joyY;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ -= 1;

    const manualInput = Math.hypot(moveX, moveZ) > 0.08;
    let helperCanAttack = false;
    if (this.autoHuntEnabled && !document.hidden && !this.isInSafeCity()) {
      const mob = this.findNearestTarget(25);
      if (mob) {
        helperCanAttack = this.distanceToMob(mob) <= this.helperRange;
        if (!manualInput && !helperCanAttack) {
          const dx = mob.x-this.heroX, dz = mob.z-this.heroZ, distance = Math.hypot(dx,dz);
          if (distance > .15) {
            const a = this.camera.alpha;
            moveX = (-Math.sin(a)*dx + Math.cos(a)*dz)/distance;
            moveZ = (-Math.cos(a)*dx - Math.sin(a)*dz)/distance;
          }
        }
      }
    }

    const loot = this.lootGoal;
    let retrieving = false;
    if (loot && this.loots.includes(loot)) {
      const dx = loot.info.x-this.heroX, dz = loot.info.z-this.heroZ, d = Math.hypot(dx,dz);
      const height = Math.abs(this.heroY+this.hoverOffset-loot.info.y+.35);
      if (d > 6 || height > 4.01) this.lootGoal = null;
      else if (d <= .85 && height <= 1) {
        this.pickupLootIndex(this.loots.indexOf(loot)); this.lootGoal = null;
      } else if (!manualInput) {
        retrieving = true;
        const a = this.camera.alpha, n = Math.max(1,d);
        moveX = d < .4 ? 0 : (-Math.sin(a)*dx+Math.cos(a)*dz)/n;
        moveZ = d < .4 ? 0 : (-Math.cos(a)*dx-Math.sin(a)*dz)/n;
      }
    }
    const len = Math.hypot(moveX, moveZ);
    const moving = len > 0.08;

    if (moving) {
      const speedMult = (1 + this.activeBonuses.speedBonusPct / 100) * wingSpeedMult;
      const speed = baseSpeed * (1 + Math.max(0,this.heroStats?.agi ?? 0) / (180 + Math.max(0,this.heroStats?.agi ?? 0))) * speedMult * Math.min(1, len);
      // ArcRotate alpha points from target to camera. Project screen right/up onto the ground.
      const a = this.camera.alpha;
      const nx = (-Math.sin(a) * moveX - Math.cos(a) * moveZ) / len;
      const nz = (Math.cos(a) * moveX - Math.sin(a) * moveZ) / len;
      const nextX = Math.max(20, Math.min(3052, this.heroX + nx * speed * dt));
      const nextZ = Math.max(20, Math.min(3052, this.heroZ + nz * speed * dt));

      const canMove = this.flyff.world.collision.canMove(
        this.heroX,
        this.heroZ,
        nextX,
        nextZ,
        this.heroY + this.altitude,
        (x: number, z: number) => this.flyff.world.getGroundHeight(x, z),
        (x: number, z: number) => this.flyff.world.isPointLoaded(x, z),
        this.altitude > 0,
      );
      if (canMove) {
        this.heroX = nextX;
        this.heroZ = nextZ;
      }
      if (manualInput || this.attackSwingTimer <= 0) this.heroRotY = Math.atan2(nx, nz);
      if (this.flyff.actor) {
        this.flyff.actor.root.rotation.y = this.heroRotY;
      }
    }

    const inCity = this.isInSafeCity();
    if (!hasWings && this.flightMode === 'flight') this.flightMode = 'landing';
    const manualFlight = this.flightMode === 'flight' || this.flightMode === 'landing';
    const proposed = retrieving ? Math.max(.45,this.altitude-5*dt) : flightAltitude(this.flightMode, this.altitude, this.camera.beta, moving ? Math.min(1,len) : 0, dt);
    if (manualFlight) {
      this.altitude = this.flyff.world.collision.airHeight(this.heroX,this.heroZ,this.heroY+this.altitude,this.heroY+proposed)-this.heroY;
      this.altitude = Math.max(0,Math.min(500,this.altitude));
      if (this.flightMode === 'landing' && this.altitude >= proposed && (this.altitude === 0 || this.altitude > proposed + .001)) {
        this.heroY += this.altitude;
        this.altitude = 0;
        this.flightMode = 'ground';
      }
    }
    const flying = this.flightMode === 'auto' ? hasWings && !inCity : manualFlight && this.flightMode !== 'ground';
    this.wingLift += ((flying ? 1 : 0) - this.wingLift) * (1 - Math.exp(-dt * 6));
    if (flying) {
      this.wingPhase += dt / (this.flightMode === 'landing' ? 2.1 : 1.28);
      if (this.wingPhase >= 1) {
        this.wingPhase %= 1;
        soundSynth.playWingFlap();
      }
    } else this.wingPhase = 0;
    // Leave a buffer beyond aggro range; a passing enemy must not toggle a jump clip.
    let clearance = 1;
    if (flying) for (const mob of this.loadedMonsters) {
      if (mob.alive) clearance = Math.min(clearance,Math.max(0,(Math.hypot(mob.x-this.heroX,mob.z-this.heroZ)-28)/16));
    }
    this.openSky += ((flying ? clearance : 0)-this.openSky)*(1-Math.exp(-dt*5));
    const previousHover=this.hoverOffset;
    this.hoverOffset = manualFlight ? this.altitude : this.flightMode === 'ground' ? 0 : (1.1+(flightHeight(this.wingPhase)-1.1)*this.openSky)*this.wingLift;
    if (retrieving && this.flightMode === "auto") this.hoverOffset = Math.max(.45, Math.min(this.hoverOffset,previousHover-5*dt));
    if (this.flyff.actor) this.flyff.actor.wingPhase = flying ? this.wingPhase : (this.flyff.worldClock / 2) % 1;

    const groundY = this.flyff.world.collision.floor(
      this.heroX,
      this.heroZ,
      this.heroY + 0.5,
      this.flyff.world.getGroundHeight(this.heroX, this.heroZ),
    );
    if (!this.isGrounded || this.heroY > groundY + 0.02) {
      this.heroVelY -= 19.6 * dt;
      this.heroY += this.heroVelY * dt;
      if (this.heroY <= groundY) {
        this.heroY = groundY;
        this.heroVelY = 0;
        this.isGrounded = true;
      }
    } else {
      this.heroY = groundY;
    }

    this.heroRoot.position.set(this.heroX, this.heroY + this.hoverOffset, this.heroZ);
    // 3rd-person camera angled above wings to see the horizon clearly ahead
    this.camera.target.set(this.heroX, this.heroY + this.hoverOffset + 1.55, this.heroZ);
    this.scene.fogStart = 230 + this.altitude;
    this.scene.fogEnd = 450 + this.altitude;

    // Keep the camera above rising ground behind the character, including while orbiting.
    // Retract the boom at terrain instead of locking the viewing angle.
    const desiredRadius = this.cameraDistance;
    const sin = Math.sin(this.camera.beta), cos = Math.cos(this.camera.beta);
    let radius = desiredRadius;
    const samples = Math.ceil(Math.min(32,desiredRadius*2));
    for (let i=1; i<=samples; i++) {
      const d = desiredRadius*i/samples;
      const ground = this.flyff.world.getGroundHeight(this.heroX + Math.cos(this.camera.alpha)*d*sin,
        this.heroZ + Math.sin(this.camera.alpha)*d*sin);
      if (this.camera.target.y + d*cos < ground + .3) { radius = Math.max(.35,d-desiredRadius/samples); break; }
    }
    this.camera.lowerRadiusLimit = .35;
    this.camera.radius = radius;
    if (this.attackSwingTimer > 0) {
      this.attackSwingTimer = Math.max(0, this.attackSwingTimer - dt);
    } else if (this.flyff.actor) {
      if (!this.isGrounded) {
        this.flyff.actor.playClip(this.heroVelY > 0 ? 'jump_rise' : 'jump_fall', true);
      } else {
        this.flyff.actor.playClip(flying ? 'flight' : moving ? (len < 0.5 ? 'walk' : 'run') : 'idle', true);
      }
    }

    const wingMode = this.flightMode === 'landing' ? 'landing' : flying ? 'walk' : 'stand';
    this.flyff.update(dt, this.heroY, wingMode, this.heroX, this.heroZ);

    this.streamAccum += dt;
    if (this.streamAccum >= 0.25 && !this.streamingDetails && (moving || this.streamAccum > 2)) {
      this.streamAccum = 0;
      this.streamingDetails = true;
      void this.flyff.world.stream(this.heroX, this.heroZ, 0, 450)
        .catch((error: unknown) => console.warn('No se pudo cargar el terreno cercano', error))
        .finally(() => { this.streamingDetails = false; });
    }

    this.stepMonsters(dt);
    this.stepLoots(dt);

    if (helperCanAttack && !inCity) {
      this.autoHuntAccum += dt;
      if (this.autoHuntAccum >= 1.1) {
        this.autoHuntAccum = 0;
        this.callbacks.onAutoHuntAttack?.();
      }
    }

    this.syncMoveAccum += dt;
    if (this.syncMoveAccum >= 0.45) {
      this.syncMoveAccum = 0;
      this.callbacks.onHeroMoveSync?.(this.heroX, this.heroZ, this.heroRotY, moving ? 'run' : 'idle');
    }

    this.uiTickAccum += dt;
    if (this.uiTickAccum >= 0.25) {
      this.uiTickAccum = 0;
      const region = nearestRegion(MU_MAPS,this.heroX,this.heroZ);
      if (region.id !== this.currentMap.id) this.applyRegion(region);
      this.emitTelemetry();
      this.emitMinimap();
      this.checkNearbyNpc();
      this.checkTargetMonster();
    }
  }

  private nextAmbientFlap = 0;
  private stepMonsters(dt: number): void {
    const safeCity = this.isInSafeCity();
    const normalAggro = Number(getAdminConfigSync().monsters?.aggroRadiusMeters ?? 10);

    const radius = Math.min(100, this.flyff.world.detailRadius);
    this.monsterScan -= dt;
    if (this.monsterScan <= 0) {
      this.syncInvasions(Date.now());
      this.streamMonsters(radius + 16);
      this.monsterScan = 0.2;
    }
    const now = performance.now();
    for (const mob of this.loadedMonsters) {
      const root = mob.root!;
      mob.actionTime = Math.max(0, mob.actionTime - dt);
      mob.hitCooldown = Math.max(0,mob.hitCooldown-dt);
      mob.powerCooldown = Math.max(0, mob.powerCooldown - dt);
      if (!mob.alive) {
        if (mob.model && !mob.animations.length) mob.model.rotation.z = (1 - mob.actionTime / 0.25) * Math.PI / 2;
        if (mob.actionTime <= 0) root.setEnabled(false);
        this.reviveMonster(mob, now);
        if (!mob.alive) continue;
      }

      const cruise = [2,5,7,8][Math.abs(Math.round(mob.homeX+mob.homeZ))%4];
      if (this.mobFlight(mob)) {
        const ground = this.flyff.world.getGroundHeight(mob.x,mob.z);
        const close = !safeCity && Math.hypot(this.heroX-mob.x,this.heroZ-mob.z) < normalAggro;
        const goal = close ? Math.max(1.6,Math.min(cruise,this.heroY+this.hoverOffset-ground+1)) : cruise;
        const height = mob.approachHeight ?? cruise;
        mob.approachHeight = height + Math.max(-dt*2,Math.min(dt*2,goal-height));
      }
      const d = this.distanceToMob(mob);
      if (!mob.model && !mob.modelPending && performance.now() >= (mob.retryAt || 0)) {
        mob.modelPending = true;
        void this.getOrLoadEntityContainer(mob.glbFile).then(container => {
          if (this.disposed || mob.root !== root) return;
          if (!container) { mob.retryAt = performance.now() + 10000; return; }
          const built = this.instantiateNormalizedModel(container, mob.id, mob.def.isBoss ? 3.2 : 1.75 * (mob.def.scale || 1), !!mob.invasion);
          mob.model = built.root;
          if (mob.invasion) {
            const tint = Color3.FromHexString(mob.invasion.color);
            for (const m of built.root.getChildMeshes()) {
              const material = m.material?.clone(mob.id+'-surface');
              if (!material) continue;
              if (material instanceof PBRMaterial) material.albedoColor.multiplyInPlace(Color3.Lerp(Color3.White(),tint,.65));
              if (material instanceof StandardMaterial) material.diffuseColor.multiplyInPlace(Color3.Lerp(Color3.White(),tint,.65));
              m.material = material; m.onDisposeObservable.addOnce(()=>material.dispose(false,false));
            }
          }
          mob.model.parent = root;
          mob.animations = built.animations;
          mob.activeAnim = '';
          this.playMonsterAnim(mob, 'stand');
        }).finally(() => { if (mob.root === root) mob.modelPending = false; });
      }
      if (root.isEnabled() !== (d <= radius)) root.setEnabled(d <= radius);
      if (d > radius) { mob.strike = undefined; continue; }
      mob.energy = Math.min(mob.maxEnergy, mob.energy + dt * (mob.def.isBoss ? 4 : 3));
      const aggroRadius = mob.invasion ? 22 : mob.def.isBoss ? 15 : normalAggro;
      const engaged = !safeCity && d <= aggroRadius;
      const leash = mob.def.roamRadius ?? (aggroRadius + MONSTER_WANDER_RADIUS);
      if (!mob.strike) {
        const patrol = this.flyff.worldClock * 0.36 + mob.homeX + mob.homeZ;
        const radius = Math.min(leash, MONSTER_WANDER_RADIUS) * (0.65 + 0.3 * Math.sin(patrol * 0.6));
        const chasing = engaged && d > 2.4;
        const leashFactor = Math.min(1, leash*.97 / Math.max(.01,Math.hypot(this.heroX-mob.homeX,this.heroZ-mob.homeZ)));
        const tx = chasing ? mob.homeX + (this.heroX-mob.homeX)*leashFactor : mob.homeX + Math.cos(patrol) * radius;
        const tz = chasing ? mob.homeZ + (this.heroZ-mob.homeZ)*leashFactor : mob.homeZ + Math.sin(patrol) * radius;
        let dx = tx - mob.x, dz = tz - mob.z;
        let distance = Math.hypot(dx, dz);
        const speed = chasing ? mob.def.moveSpeed ?? 3.4 : 2.1;
        const advance = () => {
          if (distance < 0.12) return false;
          const step = Math.min(distance, speed * dt) / distance;
          const nx = mob.x + dx * step, nz = mob.z + dz * step;
          if (!this.flyff.world.isHuntingLand(nx, nz) || this.isSafePoint(nx, nz, 2) ||
              Math.hypot(nx - mob.homeX, nz - mob.homeZ) > leash) return false;
          mob.x = nx;
          mob.z = nz;
          mob.rotY = Math.atan2(dx, dz);
          root.rotation.y = mob.rotY;
          return true;
        };
        let moving = (!engaged || chasing) && advance();
        if (!moving && (!engaged || chasing) && distance > .15) {
          const ax=dx, az=dz;
          for (const angle of [.65,-.65,1.3,-1.3]) {
            dx=ax*Math.cos(angle)-az*Math.sin(angle); dz=ax*Math.sin(angle)+az*Math.cos(angle);
            if (advance()) { moving=true; break; }
          }
        }
        if (!moving && !engaged) {
          dx = mob.homeX - mob.x; dz = mob.homeZ - mob.z;
          distance = Math.hypot(dx, dz);
          moving = distance > .2 && advance();
        }
        this.playMonsterAnim(mob, this.mobFlight(mob) ? 'fly' : moving ? 'walk' : 'stand', true);
      }

      const my = this.mobY(mob);
      root.position.set(mob.x, my, mob.z);
      if (mob.activeAnim === 'fly' && d < 12 && now >= this.nextAmbientFlap) {
        this.nextAmbientFlap = now + 1400;
        soundSynth.playWingFlap();
        void this.flyff.fx.play('sfx_hitbow01', new Vector3(mob.x,my-.4,mob.z),.24,{colorHex:'#badce5'});
      }

      if (mob.model && !mob.animations.length) {
        const stride = Math.sin(this.flyff.worldClock * 9 + mob.homeX);
        const strikePhase = 1 - mob.actionTime / 0.6;
        // Pull back first, then lunge as the hit lands.
        const windup = mob.activeAnim === 'atk1' && strikePhase < 0.5 ? Math.sin(strikePhase * 2 * Math.PI) : 0;
        const lunge = mob.activeAnim === 'atk1' && strikePhase >= 0.5 ? Math.sin((strikePhase - 0.5) * 2 * Math.PI) : 0;
        const style = mob.strike?.style ?? monsterAttackProfile(mob.glbFile).style;
        const pitch = style === 'pulse' ? 0.54 : style === 'bolt' ? 0.23 : 0.4;
        mob.model.position.set(0, mob.activeAnim === 'walk' ? Math.abs(stride) * 0.13 : windup * (style === 'pulse' ? 0.4 : 0.08), lunge * 0.85 - windup * 0.22);
        mob.model.rotation.x = mob.activeAnim === 'hit' ? -mob.actionTime : (lunge - windup) * pitch;
        mob.model.rotation.z = mob.activeAnim === 'walk' ? stride * 0.08 : style === 'cleave' ? lunge * 0.24 : 0;
      }

      if (mob.strike) {
        const strike = mob.strike;
        strike.remaining -= dt;
        if (strike.remaining > 0) continue;
        mob.strike = undefined;
        const source = new Vector3(mob.x, my + 0.8, mob.z);
        const target = new Vector3(this.heroX, this.heroY + this.hoverOffset + 0.7, this.heroZ);
        const fx = creatureFx(this.scene, this.creatureEffectsRoot, source, target, strike.element, strike.style);
        window.setTimeout(() => fx.dispose(), 450);
        this.playMonsterSound(mob, 'atk1');
        if (safeCity || this.isSafePoint(mob.x, mob.z) || d > strike.range) continue;
        if (strike.power) void this.flyff.fx.play(mob.attackFx, target, 1.1, { colorHex: strike.power.colorHex });
        const gear = equippedGearBonuses(this.flyff.getLastEquippedItems());
        if (gear.evasionPct && Math.random() * 100 < gear.evasionPct) {
          this.callbacks.onFloatingText?.('Esquiva', '#93c5fd');
          continue;
        }
        const blocked = gear.blockPct && Math.random() * 100 < gear.blockPct;
        const damage = Math.round(mob.attack * (strike.power?.damageMult ?? 1) * (blocked ? .5 : 1));
        this.callbacks.onPlayerDamaged?.(damage, !blocked && Math.random() < 0.12);
        const reflected = Math.round(damage * (gear.reflectPct ?? 0) / 100);
        if (reflected > 0) {
          const dealt=this.damageToMonster(mob, reflected, 0);
          if (!this.callbacks.onGroupHit?.(this.groupMobId(mob),dealt,mob.maxHp)) mob.hp = Math.max(0, mob.hp - dealt);
          if (!mob.hp) this.handleMonsterDefeated(mob);
        }
        soundSynth.playHit(this.heroStats?.sex);
        if (strike.power) this.callbacks.onMonsterPowerHit?.(strike.power, damage);
        continue;
      }
      if (!engaged || this.isSafePoint(mob.x, mob.z) || mob.actionTime > 0) continue;
      const profile = monsterAttackProfile(mob.glbFile);
      const species = mob.originalSpecies ? SPECIES_BY_ID.get(mob.originalSpecies) : undefined;
      const special = mob.powerCooldown <= 0 && mob.energy >= MONSTER_POWER_ENERGY;
      const style = special ? (species?.power.style ?? profile.style) : 'cleave';
      const range = style === 'bolt' ? 9 : style === 'pulse' ? 5.5 : 2.9;
      if (d > range) continue;

      if (mob.hitCooldown <= 0) {
        mob.hitCooldown = 1.65;
        const power = special ? this.monsterPowers(mob, profile.name)[0] : undefined;
        if (special) {
          mob.energy -= MONSTER_POWER_ENERGY;
          mob.powerCooldown = species?.power.cooldownSec ?? 5;
        }
        root.rotation.y = Math.atan2(this.heroX - mob.x, this.heroZ - mob.z);
        this.playMonsterAnim(mob, 'atk1', false);
        mob.strike = { remaining: 0.32, power, range: range + 0.6, element: species?.power.element ?? profile.element, style };
      }

    }
  }

  private stepLoots(dt: number): void {
    for (let i = this.loots.length - 1; i >= 0; i--) {
      const loot = this.loots[i];
      const age = (performance.now()-loot.createdAt)/1000;
      loot.mesh.rotation.y += dt * 1.8;
      loot.mesh.position.y = loot.info.y + (age < .5 ? Math.sin(age*2*Math.PI)*.7 : .09*Math.sin((age-.5)*3));
      if (performance.now() - loot.createdAt > 45000) {
        loot.mesh.dispose();
        this.loots.splice(i, 1);
      }
    }
  }

  private checkNearbyNpc(): void {
    const interactRadius = Number(getAdminConfigSync().npcs?.interactRadiusMeters || 6.5);
    let closest: ActiveNpc | null = null;
    let bestD = interactRadius;
    for (const n of this.npcs) {
      const d = Math.hypot(n.def.x - this.heroX, n.def.z - this.heroZ);
      if (d < bestD) {
        bestD = d;
        closest = n;
      }
    }
    const nextId = closest?.def.id ?? null;
    if (nextId !== this.lastNearbyNpcId) {
      this.lastNearbyNpcId = nextId;
      this.callbacks.onNearbyNpcChange?.(closest?.def ?? null);
    }
  }

  private monsterPowers(mob: ActiveMonster, fallbackName = monsterAttackProfile(mob.glbFile).name): MonsterPower[] {
    return mob.def.powers?.length ? mob.def.powers : [
      { id: `${mob.def.id}_power`, name: fallbackName, colorHex: mob.def.colorHex, damageMult: 1.35 },
    ];
  }

  private checkTargetMonster(): void {
    if (this.isInSafeCity()) {
      if (this.lastTargetId !== null) {
        this.lastTargetId = null;
        this.callbacks.onTargetMonsterChange?.(null);
      }
      return;
    }
    const target = this.findNearestTarget(18);
    if (!target) {
      if (this.lastTargetId !== null) {
        this.lastTargetId = null;
        this.callbacks.onTargetMonsterChange?.(null);
      }
      return;
    }
    this.lastTargetId = target.id;
    const dist = Number(Math.hypot(target.x - this.heroX, target.z - this.heroZ).toFixed(1));
    const gearItems = this.flyff.getLastEquippedItems();
    const attack = this.heroStats ? computeHeroDamageStats(this.heroStats, gearItems).avgAttack : 40;
    const gear = equippedGearBonuses(gearItems);
    const defense = target.defense * (1 - (gear.ignoreDefensePct ?? 0) / 100);
    const buffedAttack = attack * (1 + this.activeBonuses.atkBonusPct / 100);
    const powers = this.monsterPowers(target);
    this.callbacks.onTargetMonsterChange?.({
      id: target.id,
      currentHp: target.hp,
      currentEnergy: Math.floor(target.energy),
      autoAimPct: this.autoAimAssist ? 94 : 60,
      dist,
      stats: {
        name: target.def.name,
        scaledLevel: target.scaledLevel,
        maxHp: target.maxHp,
        maxEnergy: target.maxEnergy,
        strength: target.attack,
        defense: target.defense,
        powers,
        damageTable: {
          playerEstNormal: this.damageToMonster(target, buffedAttack, defense),
          playerEstCrit: this.damageToMonster(target, buffedAttack * (1.55 + (gear.critDamagePct ?? 0) / 100), defense),
          basicAttack: target.attack,
          criticalHit: Math.round(target.attack * 1.35),
          critChancePct: 12,
          specialPower: Math.round(target.attack * powers[0].damageMult),
        },
      },
    });
  }

  private emitTelemetry(): void {
    if (this.mode === 'playing') soundSynth.setShoreline(this.flyff.world.shorelineLevel(this.heroX, this.heroY, this.heroZ));
    let nearby = 0;
    for (const m of this.nearMonsters(32)) {
      if (m.alive && Math.hypot(m.x - this.heroX, m.z - this.heroZ) <= 32) {
        nearby += 1;
      }
    }
    this.callbacks.onWorldTelemetry?.({
      flightMode:this.flightMode, altitude:Math.round(this.altitude),
      x: Math.round(this.heroX),
      z: Math.round(this.heroZ),
      inSafeCity: this.isInSafeCity(),
      totalMonsters: this.monsters.length,
      nearbyMonsters: nearby,
      mapName: this.currentMap.name,
      areaKm2: this.currentMap.areaKm2,
    });
  }

  private emitMinimap(): void {
    this.callbacks.onMinimapUpdate?.({
      mapId: this.currentMap.id,
      sizeMeters: this.currentMap.worldSize || 3072,
      hero: { x: this.heroX, z: this.heroZ, heading: this.heroRotY },
      camps: this.campMarkers,
      monsters: Array.from(this.nearMonsters(150))
        .filter((m) => m.alive && Math.hypot(m.x - this.heroX, m.z - this.heroZ) <= 150)
        .map((m) => ({ id: m.id, x: m.x, z: m.z, isBoss: m.def.isBoss })),
      npcs: this.npcs.map((n) => ({ id: n.def.id, name: n.def.name, x: n.def.x, z: n.def.z })),
      friends: Array.from(this.remotePeers.values()).map((r) => ({
        id: r.peer.peerId,
        name: r.peer.name,
        x: r.peer.x,
        z: r.peer.z,
      })),
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    soundSynth.setShoreline(0);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('resize', this.onResizeBound);
    try {
      this.weatherParticles?.stop();
      this.weatherParticles?.dispose();
    } catch {
      // ignore
    }
    for (const m of this.loadedMonsters) this.unloadMonster(m);
    this.monsterGrid.clear();
    for (const n of this.npcs) {
      for (const ag of n.animations) ag.dispose();
      n.root.dispose();
    }
    for (const l of this.loots) l.mesh.dispose();
    for (const r of this.remotePeers.values()) r.node.dispose();
    for (const c of this.entityContainerCache.values()) {
      try {
        c.dispose();
      } catch {
        // ignore
      }
    }
    this.entityContainerCache.clear();
    this.monsters = [];
    this.campMarkers = [];
    this.eventMobs = []; this.eventKey = '';
    this.npcs = [];
    this.craterNpcZones = [];
    this.loots = [];
    this.remotePeers.clear();
    this.flyff.dispose();
    this.scene.dispose();
    this.engine.dispose();
    if (this.canvas && this.canvas.parentElement === this.mount) {
      this.canvas.remove();
    }
    void Matrix.Identity();
    void this.currentEventType;
  }
}

type AbstractMeshAlias = Mesh;
