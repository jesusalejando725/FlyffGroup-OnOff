import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { MONSTER_ELEMENTS, type MonsterElement } from '../data/bestiary';
import type { AttackStyle } from '../data/bestiary';

function glow(root: TransformNode, name: string, color: Color3, alpha = 1) {
  const material = new StandardMaterial(name, root.getScene());
  material.emissiveColor = color;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.alpha = alpha;
  root.onDisposeObservable.addOnce(() => material.dispose());
  return material;
}

export function creatureFx(
  scene: Scene, parent: TransformNode, start: Vector3, target: Vector3,
  element: MonsterElement, style: AttackStyle | 'defeat' | 'greeting',
) {
  const root = new TransformNode(`creatureFx_${style}_${element}`, scene);
  root.parent = parent;
  root.position.copyFrom(style === 'bolt' ? start : target);
  const tint = Color3.FromHexString(MONSTER_ELEMENTS[element].color);
  const core = glow(root, 'creatureCore', tint);
  const trail = glow(root, 'creatureTrail', tint.scale(.75), .68);
  const attach = (mesh: Mesh, material = core) => {
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.material = material;
    return mesh;
  };
  if (style === 'bolt') {
    // A brief aimed streak joins the actual hit and source on uneven terrain.
    const ray = target.subtract(start);
    if (ray.lengthSquared() > .01) {
      const coords = Array.from({ length: 6 }, (_, i) => {
        const p = ray.scale(i / 5);
        if (i > 0 && i < 5) p.y += i % 2 ? .2 : -.12;
        return p;
      });
      attach(MeshBuilder.CreateTube('bolt', { path: coords, radius: .055, tessellation: 5 }, scene));
      for (let i = 1; i < coords.length; i++) {
        attach(MeshBuilder.CreatePolyhedron('rune', { type: 1, size: .13 }, scene), trail).position.copyFrom(coords[i]);
      }
    } else attach(MeshBuilder.CreatePolyhedron('spark', { type: 1, size: .35 }, scene));
  } else if (style === 'cleave') {
    root.rotation.y = Math.atan2(target.x - start.x, target.z - start.z);
    for (let i = 0; i < 2; i++) {
      const path = Array.from({ length: 8 }, (_, n) =>
        new Vector3((n - 3.5) * .18, (n - 3.5) * .14 - i * .18, Math.sin(n * Math.PI / 7) * .28 - .16));
      attach(MeshBuilder.CreateTube('slash', { path, radius: i ? .035 : .068, tessellation: 5 }, scene), i ? trail : core);
    }
  } else {
    const ring = attach(MeshBuilder.CreateTorus('pulse', { diameter: style === 'pulse' ? 1.45 : .8, thickness: .06, tessellation: 16 }, scene), trail);
    ring.position.y = -.36;
    for (let i = 0; i < 7; i++) {
      const angle = i * 2 * Math.PI / 7;
      const spark = attach(MeshBuilder.CreatePolyhedron('shard', { type: 1, size: .13 + (i % 3) * .045 }, scene));
      spark.position.set(Math.cos(angle)*.60, .04 + (i%3)*.16, Math.sin(angle)*.60);
      spark.rotation.z = angle;
    }
  }
  return root;
}
