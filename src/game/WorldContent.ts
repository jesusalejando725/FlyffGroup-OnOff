import { craterMaterial } from './content/CraterSurface';
import { findHeroAppearance, heroAppearanceName, heroAppearancePath } from '../data/heroAppearances';
import { HeroMotion } from './content/HeroMotion';
import { createWaterMaterial, createWaterMesh, updateWaterMaterial } from './content/WaterSurface';
import type { WingRig } from './content/WingRig';
import {
  AbstractMesh,
  AnimationGroup,
  AssetContainer,
  Color3,
  Mesh, PBRMaterial, Texture,
  Node,
  ParticleSystem,
  PointLight,
  Scene,
  SceneLoader,
  Skeleton,
  ShaderMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders';
import type { HeroClass, MuItem } from '../types/game';
import { EquipmentAppearance, type GearSlotState } from './content/EquipmentAppearance';
import { GarmentFragment } from './content/GarmentFragment.js';
import { FlyffEffectRuntime } from './content/runtime.js';
import { SurfaceCollision, type CollisionGeometryData } from './content/SurfaceCollision';

export interface PersonajeConfig {
  id: string;
  classId: HeroClass;
  sex: 'male' | 'female';
  name: string;
  model: string;
  body: string;
  costume?: boolean;
  color: string;
  clips: string[];
  outfit: string;
  weapon: string;
}

export interface MundoObjectEntry {
  model: string;
  x: number;
  y: number;
  z: number;
  rotationY?: number;
  scale?: [number, number, number];
}

export interface MundoTileDef {
  id: string;
  x: number;
  z: number;
  sizeMeters: number;
  terrain: string;
  height: string;
  surface: string;
  objects: MundoObjectEntry[];
  water?: Array<{ x: number; z: number; height: number; size: number; textureId: number }>;
}

export interface MundoModelDef {
  file: string;
  min: number[];
  max: number[];
  collision?: string;
  collisionBounds?: { min: number[]; max: number[] };
}

export interface MundoManifest {
  name: string;
  sizeMeters: number;
  areaKm2: number;
  heightResolution: number;
  heightSpacing: number;
  spawn: { x: number; z: number };
  cities: Array<{ name: string; x: number; z: number; sizeMeters: number; y?: number }>;
  volcano?: { name: string; x: number; z: number; radius: number; lavaY: number };
  tiles: MundoTileDef[];
  models: Record<string, MundoModelDef>;
}

export interface LoadedTileState {
  id: string;
  def: MundoTileDef;
  root: TransformNode;
  terrainContainer: AssetContainer;
  details: Map<number, TransformNode>;
  waterMeshes: Mesh[];
  loadedAt: number;
  volcanicSurfaces: ShaderMaterial[];
}

// The source uses abbreviations (Tr/Ro/Gr) as well as full names. Keep
// identified natural models; unknown placements can be inspected in the source manifest.
const NATURAL_MODEL = /(?:tree|plant|root|rock|boulder|mountain|grass|flower|shrub|bush|obj_ma(?:copr(?:tr|ro|gr(?:ge)?|fl)|flprtr|saprro)\d)/i;

let cachedPersonajes: PersonajeConfig[] | null = null;
export async function loadPersonajesManifest(): Promise<PersonajeConfig[]> {
  if (cachedPersonajes) return cachedPersonajes;
  const res = await fetch('./mugroup/personajes.json');
  cachedPersonajes = (await res.json()) as PersonajeConfig[];
  return cachedPersonajes;
}

export class FlyffActor {
  public config: PersonajeConfig;
  public scene: Scene;
  public root: TransformNode;
  public outfit: {
    container: AssetContainer | null;
    root: Node | null;
    meshes: AbstractMesh[];
    skeletons: Skeleton[];
    nodes: Node[];
    animations: AnimationGroup[];
  };
  public body: {
    container: AssetContainer | null;
    root: Node | null;
    meshes: AbstractMesh[];
  };
  public gear: Record<string, GearSlotState>;
  public fragments: GarmentFragment[] = [];
  public wingAnimations: AnimationGroup[] = [];
  public wingSocket: TransformNode | null = null;
  public wingRig: WingRig | null = null;
  public wingPhase = 0;
  public wingLight: PointLight | null = null;
  public wingParticles: ParticleSystem | null = null;
  public enhanceParticles: ParticleSystem[] = [];
  public wingScaleMultiplier = 1;
  private activeClip = '';
  private combatMotion: HeroMotion | null = null;
  private wingMode: 'stand' | 'walk' | '' = '';

  constructor(scene: Scene, config: PersonajeConfig) {
    this.scene = scene;
    this.config = config;
    this.root = new TransformNode(`flyff_actor_${config.id}`, scene);
    const restorePose = scene.onBeforeAnimationsObservable.add(() => this.combatMotion?.restore());
    const followSpine = scene.onAfterAnimationsObservable.add(() => {
      this.combatMotion?.pose();
      this.wingRig?.update(this.wingPhase, this.wingMode === 'walk');
    });
    this.root.onDisposeObservable.addOnce(() => {
      scene.onBeforeAnimationsObservable.remove(restorePose);
      scene.onAfterAnimationsObservable.remove(followSpine);
    });

    const slots = ['torso', 'helmet', 'pants', 'hands', 'feet', 'weapon', 'offhand', 'wings', 'pet', 'ring1', 'ring2', 'pendant'];
    this.gear = {};
    for (const s of slots) {
      this.gear[s] = { slot: s, equipped: false, meshes: [], containers: [] };
    }

    this.outfit = {
      container: null,
      root: null,
      meshes: [],
      skeletons: [],
      nodes: [],
      animations: [],
    };
    this.body = {
      container: null,
      root: null,
      meshes: [],
    };
  }

  public async load(): Promise<void> {
    const splitPath = (rel: string) => {
      const full = `./mugroup/${rel}`;
      const idx = full.lastIndexOf('/');
      return { rootUrl: full.slice(0, idx + 1), fileName: full.slice(idx + 1) };
    };
    const oPath = splitPath(this.config.model);
    const bPath = splitPath(this.config.body);

    const [outfitContainer, bodyContainer] = await Promise.all([
      SceneLoader.LoadAssetContainerAsync(oPath.rootUrl, oPath.fileName, this.scene),
      this.config.costume ? null : SceneLoader.LoadAssetContainerAsync(bPath.rootUrl, bPath.fileName, this.scene),
    ]);

    outfitContainer.addAllToScene();
    bodyContainer?.addAllToScene();

    const outfitRoot =
      outfitContainer.meshes.find((m) => m.name === '__root__') ||
      outfitContainer.transformNodes[0] ||
      null;
    const bodyRoot =
      bodyContainer?.meshes.find((m) => m.name === '__root__') ||
      bodyContainer?.transformNodes[0] ||
      null;

    if (outfitRoot) outfitRoot.parent = this.root;
    if (bodyRoot) bodyRoot.parent = this.root;

    const actorSkel = outfitContainer.skeletons[0] || null;
    for (const bm of bodyContainer?.meshes ?? []) {
      if (bm.name === '__root__') continue;
      if (actorSkel && bm.skeleton) {
        bm.skeleton = actorSkel;
      }
      bm.isPickable = false;
      bm.setEnabled(false);
    }

    for (const om of outfitContainer.meshes) {
      if (om.name === '__root__') continue;
      om.isPickable = false;
    }

    this.outfit = {
      container: outfitContainer,
      root: outfitRoot,
      meshes: [...outfitContainer.meshes],
      skeletons: [...outfitContainer.skeletons],
      nodes: [...outfitContainer.transformNodes, ...outfitContainer.meshes],
      animations: [...outfitContainer.animationGroups],
    };
    this.body = {
      container: bodyContainer,
      root: bodyRoot,
      meshes: [...(bodyContainer?.meshes ?? [])],
    };

    this.combatMotion = new HeroMotion(this.config.classId, outfitContainer.transformNodes);
    this.playClip('idle', true);
  }

  public setCombatMotion(seconds: number, slot: number, support: boolean): void {
    this.combatMotion?.start(seconds, slot, support);
  }

  public hasClip(name: string): boolean {
    const lower = name.toLowerCase();
    return this.outfit.animations.some((a) => a.name.toLowerCase() === lower);
  }

  public playClip(name: string, loop = true): number {
    if (this.activeClip === name && loop && this.outfit.animations.some(g => g.name === name && g.isPlaying)) return 0;
    const lower = name.toLowerCase();
    const group =
      this.outfit.animations.find((a) => a.name === name) ||
      this.outfit.animations.find((a) => a.name.toLowerCase() === lower) ||
      this.outfit.animations.find((a) => a.name.toLowerCase().includes(lower)) ||
      (loop ? this.outfit.animations.find((a) => a.name === 'idle') : this.outfit.animations.find((a) => a.name === 'attack')) ||
      this.outfit.animations[0];
    if (!group) return 0;
    for (const a of this.outfit.animations) {
      if (a !== group && a.isPlaying) a.stop();
    }
    this.activeClip = group.name;
    try {
      if (!loop) {
        group.stop();
      }
      group.start(loop, !loop ? 1.18 : 1.0, group.from, group.to, false);
    } catch {
      return 0;
    }
    const fps = group.targetedAnimations[0]?.animation.framePerSecond || 30;
    return Math.max(0.16, (group.to - group.from) / (fps * (loop ? 1 : 1.18)));
  }

  public playWingAnimation(mode: 'stand' | 'walk'): void {
    if (!this.gear.wings?.equipped) return;
    if (this.wingMode === mode && this.wingAnimations.some((a) => a.isPlaying)) {
      return;
    }
    this.wingMode = mode;
    const target =
      this.wingAnimations.find((a) => a.name.toLowerCase() === mode) ||
      this.wingAnimations.find((a) => a.name.toLowerCase().includes(mode)) ||
      this.wingAnimations[0];
    if (!target) return;
    const speedRatio =
      target.name.toLowerCase().includes('action') || target.name.toLowerCase().includes('wing')
        ? mode === 'walk'
          ? 1.45
          : 0.8
        : mode === 'walk'
          ? 1.25
          : 0.9;
    for (const ag of this.wingAnimations) {
      if (ag !== target && ag.isPlaying) ag.stop();
    }
    try {
      if (target.isPlaying) target.speedRatio = speedRatio;
      else target.start(true, speedRatio, target.from, target.to, false);
    } catch {
      // ignore in NullEngine
    }
  }

  public resetWingMode(): void {
    this.wingMode = '';
  }

  public equip(slot: string, enabled: boolean): void {
    if (slot === 'wings' && !enabled && this.gear.wings?.equipped) {
      // Never disable active wings unintentionally
      enabled = true;
    }
    const state = this.gear[slot];
    if (state) {
      state.equipped = enabled;
      for (const m of state.meshes) {
        if (!m.isDisposed()) m.setEnabled(enabled);
      }
    }
    const bodyPrefixMap: Record<string, string> = {
      torso: 'body_torso',
      pants: 'body_legs',
      hands: 'body_hands',
      feet: 'body_feet',
    };
    const bodyPrefix = bodyPrefixMap[slot];
    if (bodyPrefix) {
      for (const bm of this.body.meshes) {
        if (bm.name.startsWith(bodyPrefix) && !bm.isDisposed()) {
          bm.setEnabled(!enabled);
        }
      }
    }
  }

  public detach(slot: string): void {
    // Wings and equipped combat gear must NEVER drop to the ground when taking damage
    if (slot === 'wings') return;
    const state = this.gear[slot];
    if (!state) return;
    const activeMesh = state.meshes.find((m: AbstractMesh) => m.isEnabled() && !m.isDisposed());
    if (!activeMesh) return;

    while (this.fragments.length >= 8) {
      const oldest = this.fragments.shift();
      oldest?.dispose();
    }
    const frag = new GarmentFragment(activeMesh, this.scene);
    this.fragments.push(frag);
    this.equip(slot, false);
  }

  public update(dt: number, groundInfo: { height?: number } = { height: 0 }): void {
    this.combatMotion?.tick(dt);
    const normalizedGround = { height: groundInfo.height ?? 0 };
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const alive = this.fragments[i].update(dt, normalizedGround);
      if (!alive) {
        this.fragments[i].dispose();
        this.fragments.splice(i, 1);
      }
    }
  }

  public dispose(appearance?: EquipmentAppearance): void {
    for (const f of this.fragments) f.dispose();
    this.fragments = [];
    appearance?.clearDynamicGear(this);
    try {
      this.outfit.container?.dispose();
    } catch {
      // ignore
    }
    try {
      this.body.container?.dispose();
    } catch {
      // ignore
    }
    try {
      this.root.dispose();
    } catch {
      // ignore
    }
  }
}

export class FlyffWorldStreamer {
  public scene: Scene;
  public manifest: MundoManifest | null = null;
  public heightmap: Float32Array | null = null;
  public tiles = new Map<string, LoadedTileState>();
  public containers = new Map<string, AssetContainer>();
  public collision = new SurfaceCollision();
  public detailRadius = 100;
  public stripManmadeStructures = true;

  private volcanicTextures?: [Texture,Texture];
  private collisionCache = new Map<string, CollisionGeometryData>();
  private streamingLock: Promise<void> | null = null;
  private manifestRequest: Promise<MundoManifest> | null = null;
  private getWorldClock: () => number;
  private waterMaterial: ShaderMaterial | null = null;
  private lastHeroX = 1336;
  private lastHeroZ = 1281;
  private lastVisibilityX = NaN;
  private lastVisibilityZ = NaN;

  constructor(scene: Scene, getWorldClock: () => number) {
    this.scene = scene;
    this.getWorldClock = getWorldClock;
  }

  public setDetailRadius(radiusMeters: number): void {
    this.detailRadius = Math.max(40, Math.min(480, Number(radiusMeters) || 100));
    this.updateDetailVisibility(this.lastHeroX, this.lastHeroZ, true);
  }

  public setStripManmadeStructures(strip: boolean): void {
    this.stripManmadeStructures = strip;
  }

  public async ensureManifest(): Promise<MundoManifest> {
    if (this.manifest && this.heightmap) return this.manifest;
    this.manifestRequest ??= this.loadTerrainManifest().finally(() => { this.manifestRequest = null; });
    return this.manifestRequest;
  }

  private async loadTerrainManifest(): Promise<MundoManifest> {
    const [mRes, hRes] = await Promise.all([
      fetch('./mugroup/mundo/mundo.json'),
      fetch('./mugroup/mundo/heightmap.f32'),
    ]);
    if (!mRes.ok || !hRes.ok) throw new Error('No se encontraron los datos del mundo.');
    const [manifest, buf] = await Promise.all([mRes.json() as Promise<MundoManifest>, hRes.arrayBuffer()]);
    this.manifest = manifest;
    this.heightmap = new Float32Array(buf);
    for (const tile of this.manifest.tiles) for (const w of tile.water ?? [])
      this.waterLevels.set(Math.floor(w.z / 32)*1024 + Math.floor(w.x / 32), w.height);
    return this.manifest;
  }

  private waterLevels = new Map<number,number>();

  public isHuntingLand(x:number,z:number): boolean {
    if (!this.manifest || x < 0 || z < 0 || x >= this.manifest.sizeMeters || z >= this.manifest.sizeMeters) return false;
    const water = this.waterLevels.get(Math.floor(z/32)*1024 + Math.floor(x/32)) ?? 0;
    const ground = this.getGroundHeight(x,z);
    return ground > Math.max(1,water) + .3;
  }

  public getGroundHeight(x: number, z: number): number {
    if (!this.manifest || !this.heightmap) return 0;
    const res = this.manifest.heightResolution;
    // Terrain GLBs use every second height sample and split each quad across
    // the (1,0)-(0,1) diagonal. Sample the visible triangles, including shores.
    const step = 2;
    const spacing = this.manifest.heightSpacing * step;
    const last = (res - 1) / step;
    const fx = Math.max(0, Math.min(last, x / spacing));
    const fz = Math.max(0, Math.min(last, z / spacing));
    const ix = Math.min(last - 1, Math.floor(fx)), iz = Math.min(last - 1, Math.floor(fz));
    const tx = fx - ix, tz = fz - iz;
    const i = step * (iz * res + ix);
    const h = this.heightmap, row = res * step;
    return tx + tz <= 1
      ? h[i] * (1-tx-tz) + h[i+step] * tx + h[i+row] * tz
      : h[i+row+step] * (tx+tz-1) + h[i+step] * (1-tz) + h[i+row] * (1-tx);
  }

  public shorelineLevel(x: number, y: number, z: number): number {
    let nearest = 24;
    for (const tile of this.tiles.values()) {
      if (!tile.waterMeshes.length || !tile.def.water) continue;
      for (const cell of tile.def.water) {
        if (cell.height <= 0 || Math.abs(cell.height - y) > 8) continue;
        const dx = Math.max(0, Math.abs(cell.x - x) - cell.size / 2);
        const dz = Math.max(0, Math.abs(cell.z - z) - cell.size / 2);
        nearest = Math.min(nearest, Math.hypot(dx, dz));
      }
    }
    return 1 - nearest / 24;
  }

  private async getCollisionGeometry(path: string): Promise<CollisionGeometryData | null> {
    if (this.collisionCache.has(path)) return this.collisionCache.get(path)!;
    try {
      const res = await fetch(`./mugroup/${path}`);
      if (!res.ok) return null;
      const data = (await res.json()) as CollisionGeometryData;
      this.collisionCache.set(path, data);
      return data;
    } catch {
      return null;
    }
  }

  public updateDetailVisibility(heroX: number, heroZ: number, force = false): void {
    this.lastHeroX = heroX;
    this.lastHeroZ = heroZ;
    if (!force && heroX === this.lastVisibilityX && heroZ === this.lastVisibilityZ) return;
    this.lastVisibilityX = heroX;
    this.lastVisibilityZ = heroZ;
    const radiusSquared = this.detailRadius ** 2;
    for (const tile of this.tiles.values()) {
      for (const instRoot of tile.details.values()) {
        const visible = (instRoot.position.x - heroX) ** 2 + (instRoot.position.z - heroZ) ** 2 <= radiusSquared;
        if (instRoot.isEnabled() !== visible) {
          instRoot.setEnabled(visible);
        }
      }
    }
  }

  public update(dt: number, heroX: number, heroZ: number): void {
    if (this.waterMaterial) updateWaterMaterial(this.waterMaterial, this.scene, this.getWorldClock());
    this.updateDetailVisibility(heroX, heroZ);
  }

  public async stream(x: number, z: number, _minRadius = 0, maxRadius = 460): Promise<void> {
    this.lastHeroX = x;
    this.lastHeroZ = z;
    while (this.streamingLock) {
      await this.streamingLock;
    }
    const run = async () => {
      const manifest = await this.ensureManifest();
      if (this.scene.isDisposed) return;

      const effectiveRadius = Math.max(120, maxRadius);
      const clock = this.getWorldClock();

      const neededTiles = manifest.tiles
        .filter((tile) => {
          const cx = Math.max(tile.x, Math.min(x, tile.x + tile.sizeMeters));
          const cz = Math.max(tile.z, Math.min(z, tile.z + tile.sizeMeters));
          return Math.hypot(x - cx, z - cz) <= effectiveRadius;
        })
        .sort((a, b) => {
          const acx = a.x + a.sizeMeters * 0.5;
          const acz = a.z + a.sizeMeters * 0.5;
          const bcx = b.x + b.sizeMeters * 0.5;
          const bcz = b.z + b.sizeMeters * 0.5;
          return Math.hypot(x - acx, z - acz) - Math.hypot(x - bcx, z - bcz);
        });
      const neededIds = new Set(neededTiles.map((t) => t.id));

      // Evict tiles outside effective radius
      let changed = false;
      for (const [id, loaded] of [...this.tiles.entries()]) {
        if (!neededIds.has(id)) {
          this.evictTile(loaded);
          this.tiles.delete(id);
          changed = true;
        }
      }

      // Load missing tiles progressively closest-first
      for (const tileDef of neededTiles) {
        if (this.tiles.has(tileDef.id)) continue;
        await this.loadTile(tileDef, clock);
        changed = true;
      }

      for (const tile of this.tiles.values()) {
        changed = (await this.updateTileDetails(tile, manifest, x, z)) || changed;
      }
      if (changed) {
        const used = new Set([...this.tiles.values()].flatMap(tile =>
          [...tile.details.keys()].map(index => tile.def.objects[index].model)));
        for (const [modelKey, container] of this.containers) {
          if (used.has(modelKey)) continue;
          container.dispose();
          this.containers.delete(modelKey);
        }
        await this.rebuildCollision();
      }
      this.updateDetailVisibility(this.lastHeroX, this.lastHeroZ);
    };

    this.streamingLock = run().finally(() => {
      this.streamingLock = null;
    });
    await this.streamingLock;
  }

  private async loadTile(tileDef: MundoTileDef, clock: number): Promise<void> {
    const tFull = `./mugroup/${tileDef.terrain}`;
    const idx = tFull.lastIndexOf('/');
    const terrainContainer = await SceneLoader.LoadAssetContainerAsync(
      tFull.slice(0, idx + 1),
      tFull.slice(idx + 1),
      this.scene,
    );
    if (this.scene.isDisposed) {
      terrainContainer.dispose();
      return;
    }

    const volcano = this.manifest?.volcano;
    const volcanicSurfaces: ShaderMaterial[] = [];
    const overlaps = volcano && Math.hypot(
      Math.max(tileDef.x - volcano.x, 0, volcano.x - tileDef.x - tileDef.sizeMeters),
      Math.max(tileDef.z - volcano.z, 0, volcano.z - tileDef.z - tileDef.sizeMeters),
    ) < volcano.radius;
    const root = new TransformNode(`tile_${tileDef.id}`, this.scene);
    terrainContainer.addAllToScene();

    // Critical terrain placement fix:
    // Local terrain meshes live in [0..512, y, -512..0]; glTF __root__ defaults to rotY=180°,
    // which maps tiles to [-512..0, y, -512..0] causing a black void under spawn.
    // Zero rotation + (1, 1, -1) scaling + (tileDef.x, 0, tileDef.z) aligns tiles to world coordinates.
    for (const m of terrainContainer.meshes) {
      if (m.name === '__root__') {
        m.parent = root;
        m.rotationQuaternion = null;
        m.rotation.set(0, 0, 0);
        m.scaling.set(1, 1, -1);
        m.position.set(tileDef.x, 0, tileDef.z);
      } else if (m.material) {
        m.material.backFaceCulling = false;
        if (volcano && overlaps && m.material instanceof PBRMaterial && m.material.albedoTexture) {
          this.volcanicTextures ??= [new Texture('./mugroup/ui/basalt.webp',this.scene),new Texture('./mugroup/ui/magma.webp',this.scene)];
          const material = craterMaterial(this.scene,m.material.albedoTexture,volcano,...this.volcanicTextures);
          m.material = material;
          volcanicSurfaces.push(material);
        }
      }
      m.isPickable = false;
    }

    const waterMeshes: Mesh[] = [];

    const water = createWaterMesh(`water_${tileDef.id}`, this.scene, [
      ...(tileDef.water ?? []),
      // Extend edge tiles one sector beyond the playable shore, including the corners.
      ...[-1,0,1].flatMap(dx => [-1,0,1].flatMap(dz => {
        const size=tileDef.sizeMeters, limit=this.manifest!.sizeMeters;
        if ((!dx && !dz) || (dx<0 && tileDef.x!==0) || (dx>0 && tileDef.x+size!==limit) ||
            (dz<0 && tileDef.z!==0) || (dz>0 && tileDef.z+size!==limit)) return [];
        return [{x:tileDef.x+(dx+.5)*size,z:tileDef.z+(dz+.5)*size,size,height:1,textureId:1}];
      })),
      // The empty seabed is flat at y=0. A continuous sea surface also covers
      // cells absent from the original lake/river table, below authored land.
      { x:tileDef.x+tileDef.sizeMeters/2, z:tileDef.z+tileDef.sizeMeters/2, size:tileDef.sizeMeters, height:1, textureId:1 },
    ]);
    if (water) {
      this.waterMaterial ??= createWaterMaterial(this.scene);
      updateWaterMaterial(this.waterMaterial, this.scene, clock);
      water.parent = root;
      water.material = this.waterMaterial;
      waterMeshes.push(water);
    }

    this.tiles.set(tileDef.id, {
      id: tileDef.id,
      def: tileDef,
      root,
      terrainContainer,
      details: new Map(),
      waterMeshes,
      loadedAt: clock,
      volcanicSurfaces,
    });
  }

  private async updateTileDetails(tile: LoadedTileState, manifest: MundoManifest, x: number, z: number): Promise<boolean> {
    const preload = this.detailRadius + 24;
    const keep = preload + 20;
    const allowed = (obj: MundoObjectEntry) => !this.stripManmadeStructures || NATURAL_MODEL.test(obj.model);
    let changed = false;
    for (const [index, node] of tile.details) {
      const obj = tile.def.objects[index];
      if (!allowed(obj) || Math.hypot(obj.x - x, obj.z - z) > keep) {
        node.dispose(false, false);
        tile.details.delete(index);
        changed = true;
      }
    }

    for (const [index, obj] of tile.def.objects.entries()) {
      if (this.scene.isDisposed) break;
      if (tile.details.has(index) || !allowed(obj) || Math.hypot(obj.x - x, obj.z - z) > preload) continue;
      let container = this.containers.get(obj.model);
      if (!container) {
        const file = manifest.models[obj.model]?.file;
        if (!file) continue;
        const path = `./mugroup/${file}`;
        const split = path.lastIndexOf('/') + 1;
        try {
          container = await SceneLoader.LoadAssetContainerAsync(path.slice(0, split), path.slice(split), this.scene);
        } catch {
          continue;
        }
        if (this.scene.isDisposed) {
          container.dispose();
          break;
        }
        this.containers.set(obj.model, container);
      }
      const prefix = `obj_${tile.def.id}_${index}`;
      const inst = container.instantiateModelsToScene(n => `${prefix}_${n}`, false, { doNotInstantiate: false });
      const root = new TransformNode(prefix, this.scene);
      root.parent = tile.root;
      root.position.set(obj.x, obj.y, obj.z);
      root.rotation.y = (obj.rotationY ?? 0) * Math.PI / 180;
      if (obj.scale) root.scaling.set(...obj.scale);
      for (const child of inst.rootNodes) child.parent = root;
      for (const group of inst.animationGroups) group.dispose();
      for (const skeleton of inst.skeletons) skeleton.dispose();
      root.setEnabled(Math.hypot(obj.x - this.lastHeroX, obj.z - this.lastHeroZ) <= this.detailRadius);
      tile.details.set(index, root);
      changed = true;
    }
    return changed;
  }

  private evictTile(tile: LoadedTileState): void {
    for (const material of tile.volcanicSurfaces) material.dispose();
    for (const wm of tile.waterMeshes) {
      try {
        wm.dispose(false, false);
      } catch {
        // ignore
      }
    }
    for (const instRoot of tile.details.values()) {
      try {
        for (const child of instRoot.getChildMeshes(false)) {
          child.dispose(true, false);
        }
        instRoot.dispose();
      } catch {
        // ignore
      }
    }
    try {
      tile.terrainContainer.dispose();
    } catch {
      // ignore
    }
    try {
      tile.root.dispose(true, false);
    } catch {
      // ignore
    }
  }

  private async rebuildCollision(): Promise<void> {
    if (!this.manifest) return;
    const placements: Array<{
      x: number;
      y: number;
      z: number;
      rotationY: number;
      scale: [number, number, number];
      geometry: CollisionGeometryData;
    }> = [];

    for (const tile of this.tiles.values()) {
      for (const index of tile.details.keys()) {
        const obj = tile.def.objects[index];
        const mDef = this.manifest.models[obj.model];
        if (!mDef?.collision) continue;
        const geom = await this.getCollisionGeometry(mDef.collision);
        if (!geom) continue;
        placements.push({
          x: obj.x,
          y: obj.y,
          z: obj.z,
          rotationY: obj.rotationY ?? 0,
          scale: obj.scale ?? [1, 1, 1],
          geometry: geom,
        });
      }
    }
    this.collision.rebuild(placements);
  }

  public isPointLoaded(x: number, z: number): boolean {
    if (!this.manifest) return true;
    const tx = Math.floor(x / 512);
    const tz = Math.floor(z / 512);
    return this.tiles.has(`${tx}_${tz}`);
  }

  public dispose(): void {
    for (const tile of this.tiles.values()) {
      this.evictTile(tile);
    }
    this.tiles.clear();
    for (const c of this.containers.values()) {
      try {
        c.dispose();
      } catch {
        // ignore
      }
    }
    this.containers.clear();
    try {
      this.waterMaterial?.dispose();
    } catch {
      // ignore
    }
    this.volcanicTextures?.forEach(texture=>texture.dispose());
    this.waterMaterial = null;
  }
}

export class WorldContentManager {
  public scene: Scene;
  public actor: FlyffActor | null = null;
  public world: FlyffWorldStreamer;
  public appearance: EquipmentAppearance;
  public fx: FlyffEffectRuntime;
  public worldClock = 0;

  private actorRequestToken = 0;
  private lastEquippedItems: MuItem[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    this.world = new FlyffWorldStreamer(scene, () => this.worldClock);
    this.appearance = new EquipmentAppearance(scene);
    this.fx = new FlyffEffectRuntime(scene);
  }

  public async setActor(classType: HeroClass, sex: 'male' | 'female', equippedItems: MuItem[], appearanceId?: string): Promise<FlyffActor | null> {
    const token = ++this.actorRequestToken;
    const list = await loadPersonajesManifest();
    const base =
      list.find((p) => p.classId === classType && p.sex === sex) ||
      list.find((p) => p.classId === classType) ||
      list[0];
    if (!base || token !== this.actorRequestToken || this.scene.isDisposed) return null;
    const appearance = findHeroAppearance(appearanceId, classType);
    const cfg: PersonajeConfig = appearance ? {
      ...base, id: `${appearance.id}_${sex}`, name: heroAppearanceName(appearance, sex), color: appearance.color,
      costume: true, model: `${heroAppearancePath(appearance.id, sex)}.glb`,
    } : base;

    if (this.actor && this.actor.config.id === cfg.id) {
      await this.equipment(equippedItems);
      return this.actor;
    }

    const nextActor = new FlyffActor(this.scene, cfg);
    try {
      await nextActor.load();
    } catch (error) {
      nextActor.dispose(this.appearance);
      throw error;
    }
    if (token !== this.actorRequestToken || this.scene.isDisposed) {
      nextActor.dispose(this.appearance);
      return null;
    }

    if (this.actor) {
      this.actor.dispose(this.appearance);
    }
    this.actor = nextActor;
    await this.equipment(equippedItems);
    return this.actor;
  }

  public async equipment(items: MuItem[]): Promise<void> {
    this.lastEquippedItems = items;
    if (!this.actor) return;
    await this.appearance.apply(this.actor, items);
  }

  public getLastEquippedItems(): MuItem[] {
    return this.lastEquippedItems;
  }

  public update(dt: number, groundHeight = 0, wingMode: 'stand' | 'walk' = 'stand', heroX = 1336, heroZ = 1281): void {
    this.worldClock += dt;
    this.world.update(dt, heroX, heroZ);
    if (this.actor) {
      this.actor.playWingAnimation(wingMode);
      this.actor.update(dt, { height: groundHeight });
    }
    this.fx.update(dt);
  }

  public dispose(): void {
    this.actor?.dispose(this.appearance);
    this.actor = null;
    this.world.dispose();
    this.fx.dispose();
  }
}
