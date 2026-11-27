import { Color3, Mesh, MeshBuilder, PBRMaterial, Scene, Vector3 } from '@babylonjs/core';
import type { ArtisanWeapon } from '../../data/artisanEquipment';
import { bakeColored, paintPart } from '../OriginalCreature';

export function buildArtisanWeapon(scene: Scene, spec: ArtisanWeapon) {
  const parts: Mesh[] = [];
  const add = (part: Mesh, color: number, x: number, z = 0) => {
    part.position.set(x, 0, z);
    parts.push(paintPart(part, color));
    return part;
  };
  const barrel = (x: number, z: number, width: number, length: number, color: number, side = 0, point = false) => {
    const part = add(MeshBuilder.CreateCylinder('forge', {
      diameterBottom: width, diameterTop: point ? 0 : width * .88, height: length, tessellation: 5 + spec.style,
    }, scene), color, x, z);
    part.rotation.set(side, 0, -Math.PI / 2);
    return part;
  };
  const crystal = (x: number, z: number, size: number) => {
    const part = add(MeshBuilder.CreatePolyhedron('forge_gem', { type: spec.style % 3, size }, scene), spec.trim, x, z);
    part.scaling.set(1.08, .58, 1);
  };
  const L = spec.length;
  if (spec.classType === 'ELF') {
    const curve = Array.from({ length: 9 }, (_, i) => {
      const x = (i - 4) / 8 * L;
      return new Vector3(x, 0, -.23 * Math.pow(Math.abs(i - 4) / 4, 1.7));
    });
    parts.push(paintPart(MeshBuilder.CreateTube('stave', { path: curve, radius: .021 + spec.style * .002, tessellation: 6 }, scene), spec.metal));
    parts.push(paintPart(MeshBuilder.CreateTube('string', { path: [curve[0], curve[8]], radius: .006, tessellation: 4 }, scene), 0xffebce));
    for (const x of [-L * .39, L * .39]) crystal(x, -.135, .063);
    barrel(0, 0, .068, .2, 0x423147);
  } else {
    const extend = spec.classType === 'DW' ? .36 : .18;
    if (spec.classType === 'DW' || spec.classType === 'DL') {
      barrel(-.10, 0, .068, .20, 0x423147);
      crystal(-.22, 0, .048 + spec.style * .005);
      const shaftLen = .62 + extend;
      barrel(.28 + extend * .28, 0, .061, shaftLen, spec.metal);
      for (let i = 0; i < spec.style + 2; i++) {
        const angle = i * 2 * Math.PI / (spec.style + 2);
        const prong = barrel(L * .64, Math.cos(angle) * .125, .041, .19, spec.metal, 0, true);
        prong.position.y = Math.sin(angle) * .125;
      }
      crystal(L * .70, 0, .14 + spec.style * .012);
    } else {
      barrel(-extend * .55, 0, .07, .19, 0x423147);
      crystal(-extend * .83, 0, .052 + spec.style * .006);
      const guard = add(MeshBuilder.CreateBox('crossguard', { width: .09, height: .08, depth: .30 + spec.style * .025 }, scene), spec.trim, .14);
      guard.rotation.y = spec.classType === 'MG' ? .31 : -.08 * spec.style;
      const blade = barrel(L * .56, 0, .14 + spec.style * .023, L * .83, spec.metal, 0, true);
      blade.scaling.z = .42;
      for (let i = 0; i <= spec.style; i++) crystal(.20 + i * .09, .065, .04);
    }
  }
  const mesh = bakeColored(parts, spec.key);
  const material = new PBRMaterial(`${spec.key}_material`, scene);
  material.albedoColor = Color3.White();
  material.metallic = .25;
  material.roughness = .5;
  mesh.material = material;
  return mesh;
}

export function buildAuroraWings(scene: Scene) {
  const parts: Mesh[] = [];
  for (const side of [-1, 1]) {
    for (let feather = 0; feather < 7; feather++) {
      const rise = .24 - feather * .07;
      const reach = .73 - feather * .042;
      const plume = MeshBuilder.CreateSphere('aurora_feather', {
        diameterX: reach * .96, diameterY: .12, diameterZ: .10, segments: 6,
      }, scene);
      plume.position.set(side * (.14 + reach * .43), rise, .12 + feather * .035);
      plume.rotation.set(0, side * .25, side * (.53 - feather * .12));
      parts.push(paintPart(plume, feather % 2 ? 0x8edaff : 0xd49dff));
      const tip = MeshBuilder.CreatePolyhedron('aurora_tip', { type: 1, size: .083 }, scene);
      tip.position.set(side * (.13 + reach * .79), rise + (3 - feather) * .07, .16 + feather * .055);
      parts.push(paintPart(tip, 0xe8f1ff));
    }
  }
  const join = MeshBuilder.CreatePolyhedron('aurora_mount', { type: 1, size: .15 }, scene);
  join.position.z = .10;
  parts.push(paintPart(join, 0xcdb5ff));
  const mesh = bakeColored(parts, 'aurora');
  const material = new PBRMaterial('aurora_fabric', scene);
  material.albedoColor = Color3.White();
  material.emissiveColor = Color3.FromHexString('#814df7').scale(.28);
  material.roughness = .62;
  mesh.material = material;
  return mesh;
}
