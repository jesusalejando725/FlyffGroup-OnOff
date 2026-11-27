import { Matrix, Mesh, Quaternion, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';

// Keep the position at the upper spine and take orientation from the torso.
// Converting to actor coordinates avoids inheriting bone scale and glTF axis flips.
export class WingRig {
  private actorInverse = Matrix.Identity();
  private lower = Vector3.Zero();
  private axis = Vector3.Zero();
  private offset = Vector3.Zero();
  private readonly back = new Vector3(0, 0, -0.11);
  private readonly flex: { mesh: Mesh; rest: Float32Array; animated: Float32Array; width: number }[] = [];

  private readonly actor: TransformNode;
  private readonly mount: TransformNode;
  private readonly upper: TransformNode;
  private readonly torso: TransformNode;

  constructor(actor: TransformNode, mount: TransformNode, upper: TransformNode, torso: TransformNode) {
    this.actor = actor;
    this.mount = mount;
    this.upper = upper;
    this.torso = torso;

  }

  addUnskinned(mesh: Mesh): void {
    const data = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!data?.length) return;
    const rest = Float32Array.from(data);
    let width = 0;
    for (let i = 0; i < rest.length; i += 3) width = Math.max(width, Math.abs(rest[i]));
    if (width > 0.01) {
      mesh.setVerticesData(VertexBuffer.PositionKind, rest.slice(), true);
      this.flex.push({ mesh, rest, animated: rest.slice(), width });
    }
  }

  update(phase: number, flying: boolean): void {
    this.actor.computeWorldMatrix(true).invertToRef(this.actorInverse);
    Vector3.TransformCoordinatesToRef(this.torso.computeWorldMatrix(true).getTranslation(), this.actorInverse, this.lower);
    Vector3.TransformCoordinatesToRef(this.upper.computeWorldMatrix(true).getTranslation(), this.actorInverse, this.mount.position);
    // Spine axes differ across imported rigs. Follow the anatomical direction
    // instead of treating the attack pose at equip time as the bind pose.
    this.mount.position.subtractToRef(this.lower,this.axis);
    const limit = (angle:number)=>Math.max(-.46,Math.min(.46,angle));
    Quaternion.RotationYawPitchRollToRef(0,limit(Math.atan2(this.axis.z, Math.max(.01,this.axis.y))),
      -limit(Math.atan2(this.axis.x, Math.max(.01,this.axis.y))),this.mount.rotationQuaternion!);
    this.back.applyRotationQuaternionToRef(this.mount.rotationQuaternion!, this.offset);
    this.mount.position.addInPlace(this.offset);
    const flap = Math.sin(phase * Math.PI * 2) * (flying ? 0.62 : 0.16);
    for (const { mesh, rest, animated, width } of this.flex) {
      for (let i = 0; i < rest.length; i += 3) {
        const x = rest[i];
        const t = Math.max(0, (Math.abs(x) / width - 0.16) / 0.84);
        const angle = flap * t;
        animated[i] = x * Math.cos(angle);
        animated[i + 1] = rest[i + 1] + Math.abs(x) * Math.sin(angle);
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, animated);
    }
  }
}

// A strong downstroke gives lift; gravity takes over near the top of each cycle.
export function flightHeight(phase: number): number {
  const p = Math.min(1, Math.max(0, phase));
  return 0.35 + 2 * 4 * p * (1 - p);
}
