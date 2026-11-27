import { Color3, Mesh, Scene, ShaderMaterial, VertexData } from '@babylonjs/core';

export interface WaterCell {
  x: number;
  z: number;
  height: number;
  size: number;
  textureId: number;
}

const vertexSource = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 world;
  uniform mat4 worldViewProjection;
  varying vec3 surface;
  varying float waterKind;
  void main() {
    waterKind = uv.x;
    surface = (world * vec4(position, 1.0)).xyz;
    gl_Position = worldViewProjection * vec4(position, 1.0);
  }
`;
const fragmentSource = `
  precision highp float;
  uniform float time;
  uniform vec3 eye;
  uniform vec3 sky;
  varying vec3 surface;
  varying float waterKind;
  void main() {
    // Sample in world coordinates: waves continue across tile and cell edges.
    vec2 p = surface.xz;
    vec2 k1 = vec2(.55, .36);
    vec2 k2 = vec2(-.82, 1.09);
    vec2 k3 = vec2(.26, -1.75);
    float a = dot(p, k1) + time * 1.4;
    float b = dot(p, k2) - time * 1.8;
    float c = dot(p, k3) + time * 2.2;
    vec2 slope = k1 * .14 * cos(a) + k2 * .053 * cos(b) + k3 * .032 * cos(c);
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 viewDir = normalize(eye - surface);
    vec3 reflection = reflect(-viewDir, n);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    float glint = pow(max(dot(reflection, normalize(vec3(.35, .74, .55))), 0.0), 48.0);
    vec3 horizon = mix(vec3(.36, .65, .79), sky, .40);
    vec3 reflectedSky = mix(horizon, mix(vec3(.18, .46, .70), sky, .45), max(reflection.y, 0.0));
    vec3 water = mix(vec3(.025, .24, .30), vec3(.055, .38, .43), .5 + .22 * sin(a + b) + .15 * sin(c));
    water = mix(water, water * vec3(1.23, 1.0, .72), waterKind);
    vec3 color = mix(water, reflectedSky, .30 + fresnel * .64) + vec3(1.0, .89, .66) * glint * .65;
    float fog = smoothstep(100.0, 440.0, length(eye - surface));
    gl_FragColor = vec4(mix(color, horizon, fog * .65), 1.0);
  }
`;

export function createWaterMaterial(scene: Scene): ShaderMaterial {
  const mat = new ShaderMaterial('mugroup_water_mat', scene, { vertexSource, fragmentSource }, {
    attributes: ['position', 'uv'],
    uniforms: ['world', 'worldViewProjection', 'eye', 'sky', 'time'],
  });
  mat.backFaceCulling = false;
  return mat;
}

export function updateWaterMaterial(mat: ShaderMaterial, scene: Scene, time: number): void {
  const camera = scene.activeCamera;
  if (camera) mat.setVector3('eye', camera.globalPosition);
  mat.setColor3('sky', new Color3(scene.clearColor.r, scene.clearColor.g, scene.clearColor.b));
  mat.setFloat('time', time);
}

export function waterGeometry(cells: WaterCell[]): VertexData {
  const positions: number[] = [];
  const indices: number[] = [];
  const uv: number[] = [];
  const seen = new Set<string>();
  for (const { x, z, height, size, textureId } of cells) {
    if (![x, z, height, size].every(Number.isFinite) || height <= 0 || size <= 0) continue;
    const key = `${x}:${z}:${height}:${size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = size / 2;
    const y = height + 0.055;
    const i = positions.length / 3;
    positions.push(x - r, y, z - r, x - r, y, z + r, x + r, y, z + r, x + r, y, z - r);
    const tint = textureId === 2 ? 1 : 0;
    uv.push(tint, 0, tint, 0, tint, 0, tint, 0);
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const geometry = new VertexData();
  geometry.positions = positions;
  geometry.indices = indices;
  geometry.uvs = uv;
  return geometry;
}

export function createWaterMesh(name: string, scene: Scene, cells: WaterCell[]): Mesh | null {
  const data = waterGeometry(cells);
  if (!data.indices?.length) return null;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}
