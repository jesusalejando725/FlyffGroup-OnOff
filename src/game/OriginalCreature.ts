import { Color3, Mesh, MeshBuilder, Scene, Vector3, VertexBuffer } from '@babylonjs/core';
import { SPECIES_BY_ID } from '../data/bestiary';

export function bakeColored(parts: Mesh[], name: string): Mesh {
  const merged = Mesh.MergeMeshes(parts, true, true);
  if (!merged) {
    parts.forEach(part => part.dispose());
    throw new Error(`No geometry for ${name}`);
  }
  merged.name = name;
  merged.isPickable = false;
  return merged;
}

export function paintPart(mesh: Mesh, color: number): Mesh {
  const rgb = Color3.FromHexString('#' + color.toString(16).padStart(6, '0')).toLinearSpace();
  const data = new Float32Array(mesh.getTotalVertices() * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb.r; data[i + 1] = rgb.g; data[i + 2] = rgb.b; data[i + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, data);
  return mesh;
}

// A compact vertex colored model per species. Individual creatures still use
// the world's nearby thin-instance pool; large monster camps don't add meshes.
export function createCreature(scene: Scene, id: string): Mesh {
  const species = SPECIES_BY_ID.get(id);
  if (!species) throw new Error(`Unknown species: ${id}`);
  const { shape, crest, body, height } = species;
  const accent = Number.parseInt(species.power.colorHex.slice(1), 16);
  const parts: Mesh[] = [];
  const add = (mesh: Mesh, color: number, x: number, y: number, z: number) => {
    mesh.position.set(x, y, z);
    parts.push(paintPart(mesh, color));
    return mesh;
  };
  const oval = (x: number, y: number, z: number, a: number, b: number, c: number, color = body) =>
    add(MeshBuilder.CreateSphere('body', { diameterX: a, diameterY: b, diameterZ: c, segments: 5 }, scene), color, x, y, z);
  const spike = (x: number, y: number, z: number, radius: number, length: number, roll: number, pitch: number, color = accent) => {
    const point = add(MeshBuilder.CreateCylinder('tip', { diameterTop: 0, diameterBottom: radius, height: length, tessellation: 5 }, scene), color, x, y, z);
    point.rotation.set(pitch, 0, roll);
    return point;
  };
  const limb = (x: number, y: number, z: number, endX: number, endY: number, endZ: number, width: number, color = body) => {
    const delta = new Vector3(endX - x, endY - y, endZ - z);
    const shape = add(MeshBuilder.CreateCylinder('limb', { diameterTop: width * .72, diameterBottom: width, height: delta.length(), tessellation: 6 }, scene), color, (endX+x)/2, (endY+y)/2, (endZ+z)/2);
    // Align the native vertical axis with the limb direction.
    const from = Vector3.Up(), to = delta.normalize();
    const axis = Vector3.Cross(from, to);
    if (axis.lengthSquared() > 1e-8) shape.rotate(axis.normalize(), Math.acos(Math.max(-1, Math.min(1, to.y))));
    else if (to.y < 0) shape.rotation.x = Math.PI;
  };
  const eyes = (x: number, y: number, z: number, width: number) => {
    for (const side of [-1, 1]) {
      oval(x + side*width, y, z, .16, .15, .12, 0x192031);
      oval(x + side*width, y, z+.05, .085, .095, .055, accent);
    }
  };
  const plates = (length: number, y: number) => {
    for (let i = 0; i < crest; i++) spike(0, y + .035*i, -length/2 + (i+.5)*length/crest, .21, .21 + crest*.035, 0, -.25);
  };
  if (shape === 'beast' || shape === 'wyvern') {
    const wyvern = shape === 'wyvern';
    oval(0,.7,-.04,.68,.63,1.17);
    oval(0,.88,.56,.52,.54,.48);
    oval(0,.72,.78,.42,.25,.47);
    eyes(0,.96,.76,.13);
    for (const x of [-.27,.27]) for (const z of (wyvern ? [-.29] : [-.36,.34])) {
      limb(x,.65,z,x,.12,z+.05,.25);
      oval(x,.11,z+.14,.26,.21,.39,0x302831);
    }
    for (const s of [-1,1]) {
      spike(s*.21,1.19,.49,.20,.35 + crest*.06,s*-.37,-.28);
      if (wyvern) {
        limb(s*.25,.79,.12,s*1.20,1.22,-.18,.13,accent);
        const membrane=oval(s*.74,.91,-.27,1.23,.09,.72);
        membrane.rotation.z=s*.45;
        spike(s*1.23,1.20,-.25,.22,.39,-s*1.2,.18);
      }
    }
    limb(0,.54,-.58,0,.37,-1.05,.27);
    spike(0,.41,-1.04,.23,.36,0,-1.3);
    plates(.75,1.05);
  } else if (shape === 'bird') {
    oval(0,.63,0,.50,.67,.5);
    oval(0,1.04,.14,.43,.43,.48);
    spike(0,.99,.42,.23,.34,0,Math.PI/2);
    for (const side of [-1,1]) {
      const wing = oval(side*.43,.68,-.08,.76 + crest*.08,.16,.53);
      wing.rotation.z=side*.42;
      for (let i=0;i<crest;i++) spike(side*(.30+.12*i),.64+.032*i,-.32,.11,.28,-side*.35,-1.55);
      limb(side*.16,.44,0,side*.21,.11,.05,.09,accent);
      oval(side*.21,.08,.12,.17,.14,.30,accent);
    }
    eyes(0,1.10,.33,.13);
    spike(0,1.31,.10,.19,.30,0,-.48);
  } else if (shape === 'bug' || shape === 'crab') {
    const crab = shape === 'crab';
    oval(0,.47,-.13,crab ? 1.02 : .68,.57,crab ? .67 : .98);
    oval(0,.42,.33,.44,.37,.51);
    for (const side of [-1,1]) {
      for (let i=0;i<(crest > 3 ? 4 : 3);i++) {
        const z = .24-i*.20;
        const end = side*(crab ? .75 : .58);
        limb(side*.26,.42,z,end,.35,z-.11,.14);
        limb(end,.35,z-.11,end*1.17,.06,z-.13,.11,accent);
      }
      if (crab) {
        limb(side*.32,.43,.26,side*.67,.5,.62,.20);
        oval(side*.70,.52,.72,.34,.27,.45,accent);
        for (const gap of [-.08,.08]) spike(side*.70+gap,.52,.96,.13,.24,0,Math.PI/2);
      } else spike(side*.14,.72,.49,.11,.33,side*-.42,.23);
    }
    eyes(0,.46,.55,.14);
    plates(.57,.7);
  } else if (shape === 'plant') {
    limb(0,.14,0,0,.99,0,.32,0x587d44);
    for (let i=0;i<crest+3;i++) {
      const angle=i*2*Math.PI/(crest+3);
      const leaf=oval(Math.sin(angle)*.32, .88, Math.cos(angle)*.32,.33,.22,.49);
      leaf.rotation.y=angle;
    }
    oval(0,.96,0,.55,.45,.56);
    eyes(0,.97,.23,.115);
    oval(0,.18,0,.66,.34,.51,0x66483b);
    spike(0,1.18,0,.25,.28,0,-.23);
  } else if (shape === 'sentinel') {
    oval(0,.85,0,.74,.74,.45);
    oval(0,1.31,.02,.49,.42,.42,crest%2 ? accent : body);
    for (const s of [-1,1]) {
      limb(s*.23,.65,0,s*.27,.13,0,.24);
      oval(s*.27,.13,.15,.25,.23,.39,0x393246);
      limb(s*.33,1.06,0,s*.50,.60,.11,.25);
      oval(s*.43,1.01,0,.40,.29,.37);
      if (crest>2) spike(s*.43,1.25,0,.23,.32,s*-.42,0);
    }
    for(let i=0;i<crest;i++) oval(0,.7+i*.10,.23,.28-i*.02,.105,.14,accent);
    eyes(0,1.35,.20,.114);
  } else if (shape === 'serpent') {
    for (let i=0;i<6;i++) oval(Math.sin(i)*.22,.19+Math.max(0,i-2)*.22,-.6+i*.2,.65-i*.04,.37,.49);
    oval(0,1.13,.50,.46,.44,.62);
    eyes(0,1.22,.71,.13);
    for (const s of [-1,1]) {
      spike(s*.22,1.28,.48,.2,.26+crest*.033,s*-.52,-.33);
      spike(s*.38,.66,.16,.21,.42,s*-1.05,0);
    }
  } else {
    const floating = shape === 'sprite';
    oval(0,floating ? .78 : .56,0,.86,floating ? .64 : .89,.70);
    for (let i=0;i<crest+1;i++) {
      const angle=i*2*Math.PI/(crest+1);
      if (floating) spike(Math.cos(angle)*.37,.74 + .1*Math.sin(angle),Math.sin(angle)*.36,.22,.37,-Math.cos(angle)*1.3,Math.sin(angle));
      else oval(Math.cos(angle)*.36,.23,Math.sin(angle)*.25,.32,.43,.35,accent);
    }
    eyes(0,.77,.32,.17);
    spike(0,floating ? 1.15 : 1.01,0,.22,.24+crest*.06,0,-.38);
  }

  const mesh = bakeColored(parts, `creature_${id}`);
  mesh.refreshBoundingInfo();
  const { minimum, maximum } = mesh.getBoundingInfo().boundingBox;
  const scale = height / Math.max(.5,maximum.y-minimum.y);
  mesh.scaling.setAll(scale);
  if (shape !== 'sprite') mesh.position.y = -minimum.y * scale;
  mesh.bakeCurrentTransformIntoVertices();
  mesh.position.setAll(0);
  mesh.scaling.setAll(1);
  mesh.refreshBoundingInfo();
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  return mesh;
}
