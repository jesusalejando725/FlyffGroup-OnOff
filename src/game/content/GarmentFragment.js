import {
  Mesh,
  StandardMaterial,
  Color3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';

/**
 * Detached garment / armor piece simulation with damped Verlet cloth springs
 * so detached pieces fall, flex gently against the ground, and never mutate
 * source mesh buffers.
 */
export class GarmentFragment {
  constructor(sourceMesh, scene, impulse = { x: 0, y: 1.4, z: 0 }) {
    this.cloth = true;
    this.scene = scene;
    this.age = 0;
    this.maxAge = 2.8;
    this.disposed = false;

    const rawPos = sourceMesh.getVerticesData(VertexBuffer.PositionKind) || [];
    const rawNormals = sourceMesh.getVerticesData(VertexBuffer.NormalKind) || [];
    const rawUvs = sourceMesh.getVerticesData(VertexBuffer.UVKind) || [];
    const rawIndices = sourceMesh.getIndices() || [];

    sourceMesh.computeWorldMatrix(true);
    const worldMat = sourceMesh.getWorldMatrix();
    const m = worldMat.asArray();

    const vCount = Math.floor(rawPos.length / 3);
    this.current = new Float32Array(rawPos.length);
    this.prev = new Float32Array(rawPos.length);
    this.velocities = new Float32Array(rawPos.length);
    this.pinned = new Uint8Array(vCount);

    let maxY = -Infinity;
    for (let i = 0; i < vCount; i++) {
      const ix = i * 3;
      const lx = rawPos[ix];
      const ly = rawPos[ix + 1];
      const lz = rawPos[ix + 2];
      const wx = lx * m[0] + ly * m[4] + lz * m[8] + m[12];
      const wy = lx * m[1] + ly * m[5] + lz * m[9] + m[13];
      const wz = lx * m[2] + ly * m[6] + lz * m[10] + m[14];
      this.current[ix] = Number.isFinite(wx) ? wx : 0;
      this.current[ix + 1] = Number.isFinite(wy) ? wy : 1;
      this.current[ix + 2] = Number.isFinite(wz) ? wz : 0;
      this.prev[ix] = this.current[ix];
      this.prev[ix + 1] = this.current[ix + 1];
      this.prev[ix + 2] = this.current[ix + 2];
      this.velocities[ix] = impulse.x + (Math.random() - 0.5) * 0.6;
      this.velocities[ix + 1] = impulse.y + Math.random() * 0.4;
      this.velocities[ix + 2] = impulse.z + (Math.random() - 0.5) * 0.6;
      if (this.current[ix + 1] > maxY) maxY = this.current[ix + 1];
    }

    // Build edge constraints for cloth flexibility
    this.edges = [];
    const seen = new Set();
    const addEdge = (a, b) => {
      if (a === b || a >= vCount || b >= vCount) return;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (seen.has(key)) return;
      seen.add(key);
      const ia = a * 3;
      const ib = b * 3;
      const rest = Math.hypot(
        this.current[ib] - this.current[ia],
        this.current[ib + 1] - this.current[ia + 1],
        this.current[ib + 2] - this.current[ia + 2],
      );
      if (rest > 1e-4) {
        this.edges.push([a, b, rest]);
      }
    };

    for (let i = 0; i + 2 < rawIndices.length && this.edges.length < 900; i += 3) {
      const a = rawIndices[i];
      const b = rawIndices[i + 1];
      const c = rawIndices[i + 2];
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    }

    const mesh = new Mesh(`garment_frag_${Date.now()}`, scene);
    const vdata = new VertexData();
    vdata.positions = new Float32Array(this.current);
    if (rawNormals.length === this.current.length) {
      vdata.normals = new Float32Array(rawNormals);
    }
    if (rawUvs.length > 0) {
      vdata.uvs = new Float32Array(rawUvs);
    }
    vdata.indices = Array.from(rawIndices);
    vdata.applyToMesh(mesh, true);

    const mat = sourceMesh.material?.clone?.(`frag_mat_${Date.now()}`) || new StandardMaterial(`frag_mat_${Date.now()}`, scene);
    if (mat instanceof StandardMaterial) {
      mat.emissiveColor = new Color3(0.08, 0.06, 0.04);
    }
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.isPickable = false;
    this.mesh = mesh;
    this.material = mat;
  }

  update(dt, groundInfo = { height: 0 }) {
    if (this.disposed) return false;
    const step = Math.min(0.033, Math.max(0.001, dt || 1 / 60));
    this.age += step;
    if (this.age >= this.maxAge) {
      return false;
    }

    const floorY = Number.isFinite(groundInfo?.height) ? groundInfo.height + 0.03 : 0.03;
    const vCount = Math.floor(this.current.length / 3);
    const gravity = -9.2;

    for (let i = 0; i < vCount; i++) {
      const ix = i * 3;
      this.velocities[ix] *= 0.985;
      this.velocities[ix + 1] = (this.velocities[ix + 1] + gravity * step) * 0.99;
      this.velocities[ix + 2] *= 0.985;

      this.current[ix] += this.velocities[ix] * step;
      this.current[ix + 1] += this.velocities[ix + 1] * step;
      this.current[ix + 2] += this.velocities[ix + 2] * step;

      if (this.current[ix + 1] < floorY) {
        this.current[ix + 1] = floorY;
        this.velocities[ix + 1] = -this.velocities[ix + 1] * 0.18;
        this.velocities[ix] *= 0.7;
        this.velocities[ix + 2] *= 0.7;
      }
    }

    // Distance relaxation pass
    for (let e = 0; e < this.edges.length; e++) {
      const [a, b, rest] = this.edges[e];
      const ia = a * 3;
      const ib = b * 3;
      const dx = this.current[ib] - this.current[ia];
      const dy = this.current[ib + 1] - this.current[ia + 1];
      const dz = this.current[ib + 2] - this.current[ia + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d > 1e-5) {
        const diff = ((d - rest) / d) * 0.35;
        this.current[ia] += dx * diff;
        this.current[ia + 1] += dy * diff;
        this.current[ia + 2] += dz * diff;
        this.current[ib] -= dx * diff;
        this.current[ib + 1] -= dy * diff;
        this.current[ib + 2] -= dz * diff;
      }
    }

    if (this.mesh && !this.mesh.isDisposed()) {
      this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.current);
    }
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.mesh?.dispose(false, true);
    } catch {
      // ignore disposal error
    }
    try {
      this.material?.dispose?.();
    } catch {
      // ignore disposal error
    }
  }
}
