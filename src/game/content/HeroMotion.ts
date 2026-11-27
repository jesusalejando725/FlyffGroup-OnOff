import { Quaternion, TransformNode, Vector3 } from '@babylonjs/core';
import type { HeroClass } from '../../types/game';

// Add class-specific upper-body motion on top of the local GLB clips. The
// authored clip always owns the base pose; this layer is removed before it ticks.
interface CombatMotion {
  arm: Vector3;
  torso: Vector3;
  offhand: Vector3;
}
const MOTIONS: Record<HeroClass, CombatMotion> = {
  DK: { arm: new Vector3(0.42, -0.48, 0.32), torso: new Vector3(0.12, 0.44, -0.10), offhand: new Vector3(-0.10, 0.15, -0.14) },
  DW: { arm: new Vector3(-0.50, 0.25, -0.32), torso: new Vector3(-0.14, -0.20, 0.02), offhand: new Vector3(-0.40, 0.15, 0.35) },
  ELF: { arm: new Vector3(-0.21, 0.36, 0.15), torso: new Vector3(-0.03, -0.33, -0.14), offhand: new Vector3(-0.52, -0.25, 0.21) },
  DL: { arm: new Vector3(0.25, 0.22, -0.44), torso: new Vector3(0.15, 0.21, 0.21), offhand: new Vector3(0.12, -0.14, -0.28) },
  MG: { arm: new Vector3(0.36, -0.13, -0.58), torso: new Vector3(0.18, -0.45, 0.15), offhand: new Vector3(-0.30, 0.28, 0.30) },
};

export class HeroMotion {
  private duration = 0;
  private elapsed = 0;
  private power = 0;
  private slot = 0;
  private readonly profile: CombatMotion;
  private readonly bones: { node: TransformNode; offset: Vector3; base: Quaternion }[];
  private readonly delta = Quaternion.Identity();
  private applied = false;

  constructor(cls: HeroClass, nodes: TransformNode[]) {
    this.profile = MOTIONS[cls];
    this.bones = [
      ['Bip02 Spine1', this.profile.torso],
      ['Bip02 R UpperArm', this.profile.arm],
      ['Bip02 L UpperArm', this.profile.offhand],
    ].flatMap(([name, offset]) => {
      const node = nodes.find(n => n.name === name && n.rotationQuaternion);
      return node ? [{ node, offset: offset as Vector3, base: Quaternion.Identity() }] : [];
    });
  }
  start(duration: number, slot: number, support: boolean): void {
    this.duration = duration;
    this.elapsed = 0;
    this.slot = slot;
    this.power = support ? 0.55 : 0.85 + (slot % 3) * 0.12;
  }
  tick(dt: number): void { this.elapsed += dt; }
  restore(): void {
    if (!this.applied) return;
    for (const { node, base } of this.bones) node.rotationQuaternion!.copyFrom(base);
    this.applied = false;
  }
  pose(): void {
    if (!this.duration || this.elapsed >= this.duration) return;
    const p = this.elapsed / this.duration;
    const stroke = Math.sin(p * Math.PI * 2) * Math.sin(p * Math.PI) * this.power;
    for (const { node, offset, base } of this.bones) {
      base.copyFrom(node.rotationQuaternion!);
      Quaternion.RotationYawPitchRollToRef(offset.y * stroke * (this.slot % 2 ? -1 : 1), offset.x * stroke, offset.z * stroke, this.delta);
      base.multiplyToRef(this.delta, node.rotationQuaternion!);
    }
    this.applied = true;
  }
}
