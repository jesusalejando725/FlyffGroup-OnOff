import {
  Color3, Constants, Material,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

/**
 * Babylon.js runtime for playing Flyff SFX JSON definitions and
 * audio mappings stored in public/mugroup/efectos-audio.json.
 */
export class FlyffEffectRuntime {
  constructor(scene) {
    this.scene = scene;
    this.manifest = null;
    this.effectCache = new Map();
    this.textureCache = new Map();
    this.activeInstances = [];
    this.activeAudioCount = 0;
  }

  async ensureManifest() {
    if (this.manifest) return this.manifest;
    try {
      const res = await fetch('./mugroup/efectos-audio.json');
      if (res.ok) {
        this.manifest = await res.json();
      }
    } catch {
      this.manifest = { sounds: {}, effects: [] };
    }
    return this.manifest;
  }

  async loadEffectDef(effectName) {
    if (!effectName) return null;
    const clean = effectName.replace(/^efectos\//, '').replace(/\.json$/, '');
    if (this.effectCache.has(clean)) return this.effectCache.get(clean);
    try {
      const url = `./mugroup/efectos/${clean}.json`;
      const res = await fetch(url);
      if (!res.ok) {
        this.effectCache.set(clean, null);
        return null;
      }
      const def = await res.json();
      this.effectCache.set(clean, def);
      return def;
    } catch {
      this.effectCache.set(clean, null);
      return null;
    }
  }

  getTexture(relPath) {
    if (!relPath) return null;
    const clean = relPath.startsWith('efectos/')
      ? `./mugroup/${relPath}`
      : `./mugroup/efectos/texturas/${relPath.replace(/^texturas\//, '')}`;
    if (this.textureCache.has(clean)) return this.textureCache.get(clean);
    try {
      const tex = new Texture(clean, this.scene, false, true);
      tex.hasAlpha = true;
      this.textureCache.set(clean, tex);
      return tex;
    } catch {
      return null;
    }
  }

  playSoundUrl(url, volume = 0.65, muted = false) {
    if (muted || !url || typeof window === 'undefined' || typeof Audio === 'undefined') return;
    if (this.activeAudioCount >= 8) return;
    try {
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, volume));
      this.activeAudioCount += 1;
      const done = () => {
        this.activeAudioCount = Math.max(0, this.activeAudioCount - 1);
      };
      audio.addEventListener('ended', done, { once: true });
      audio.addEventListener('error', done, { once: true });
      void audio.play().catch(done);
    } catch {
      // ignore autoplay blocks
    }
  }

  async playSound(soundKey, volume = 0.65, muted = false) {
    if (muted || !soundKey || typeof window === 'undefined' || typeof Audio === 'undefined') return;
    const manifest = await this.ensureManifest();
    const rel = manifest?.sounds?.[soundKey];
    if (!rel) return;
    const url = rel.startsWith('../')
      ? `./${rel.replace(/^\.\.\//, '')}`
      : `./mugroup/${rel}`;
    this.playSoundUrl(url, volume, muted);
  }

  unlockAudio() {
    void this.ensureManifest();
  }

  async play(effectName, position, scale = 1.0, opts = {}) {
    await this.playEffect(effectName, position, opts?.colorHex || '#fbbf24', scale, opts.casterPos);
  }

  async playEffect(effectName, position, colorHex = '#fbbf24', baseScale = 1.0, casterPos) {
    if (!this.scene || this.scene.isDisposed) return;
    const def = await this.loadEffectDef(effectName);
    if (this.scene.isDisposed) return;
    const root = new TransformNode(`sfx_${effectName}_${Date.now()}`, this.scene);
    root.position = position.clone ? position.clone() : new Vector3(position.x, position.y, position.z);
    if (baseScale !== 1.0) root.scaling.setAll(baseScale);

    const col = Color3.FromHexString(colorHex && colorHex.startsWith('#') ? colorHex : '#fbbf24');
    const createdMeshes = [];
    const createdMats = [];

    const fps = def?.fps || 30;
    const tracks = [];
    const parts = (def?.parts || []).filter(part => part.enabled !== false && part.textures?.length);
    const duration = Math.max(0.35, ...parts.map(p => (p.keys?.at(-1)?.frame || 20) / fps));
    if (parts.length > 0) {
      parts.forEach((part, idx) => {
        const plane = MeshBuilder.CreatePlane(`sfx_p_${idx}`, { size: 1.9 + idx * 0.45 }, this.scene);
        plane.parent = root;
        plane.position.y = 0.75 + idx * 0.28;
        plane.billboardMode = 7;
        plane.isPickable = false;

        const mat = new StandardMaterial(`sfx_mat_${Date.now()}_${idx}`, this.scene);
        mat.emissiveColor = col;
        mat.disableLighting = true;
        mat.alphaMode = Constants.ALPHA_ADD;
        mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
        mat.disableDepthWrite = true;
        mat.backFaceCulling = false;
        mat.alpha = 0.92;

        const texPath = part.textures?.[0];
        const tex = texPath ? this.getTexture(texPath) : null;
        plane.setEnabled(!!tex?.isReady());
        if (tex) {
          tex.getAlphaFromRGB = true;
          mat.emissiveTexture = mat.diffuseTexture = tex;
          mat.opacityTexture = tex;
          mat.useAlphaFromDiffuseTexture = true;
        }
        tracks.push({ plane, mat, keys: part.keys || [], frames: part.textures, loop: part.textureLoop !== 0 });
        plane.material = mat;
        createdMeshes.push(plane);
        createdMats.push(mat);
      });
    }

    if (!tracks.length) { root.dispose(); return; }

    this.activeInstances.push({
      root,
      meshes: createdMeshes,
      mats: createdMats,
      age: 0,
      duration, tracks, fps, target: root.position.clone(), origin: casterPos?.clone(),
    });
  }

  update(dt) {
    for (let i = this.activeInstances.length - 1; i >= 0; i--) {
      const inst = this.activeInstances[i];
      inst.age += dt;
      const t = Math.min(1, inst.age / inst.duration);
      if (inst.origin) Vector3.LerpToRef(inst.origin, inst.target, Math.min(1, inst.age / 0.18), inst.root.position);
      const frame = inst.age * inst.fps;
      for (const track of inst.tracks) {
        const { keys, frames, plane, mat } = track;
        const index = keys.findIndex(k => k.frame >= frame);
        const a = keys[index < 0 ? keys.length - 1 : Math.max(0, index - 1)];
        const b = index < 0 ? a : keys[index];
        const u = a && b && b.frame > a.frame ? Math.max(0, (frame - a.frame) / (b.frame - a.frame)) : 0;
        const mix = (left, right) => left + (right - left) * u;
        if (a && b) {
          for (const [i, axis] of ['x', 'y', 'z'].entries()) {
            plane.position[axis] = mix(a.position?.[i] ?? 0, b.position?.[i] ?? 0);
            plane.scaling[axis] = mix(a.scale?.[i] ?? 1, b.scale?.[i] ?? 1);
          }
          plane.rotation.z = mix(a.rotation?.[2] || 0, b.rotation?.[2] || 0) * Math.PI / 180;
        }
        const texIndex = track.loop ? Math.floor(frame) % frames.length : Math.min(frames.length - 1, Math.floor(frame));
        const texture = this.getTexture(frames[texIndex]);
        if (!texture?.isReady()) { plane.setEnabled(false); continue; }
        plane.setEnabled(true);
        texture.getAlphaFromRGB = true;
        mat.emissiveTexture = mat.diffuseTexture = mat.opacityTexture = texture;
        mat.alpha = mix(a?.opacity ?? 255, b?.opacity ?? 255) / 255 * Math.min(1, (1 - t) * 5);
      }
      if (t >= 1) {
        for (const mesh of inst.meshes) mesh.dispose(false, false);
        for (const mat of inst.mats) mat.dispose(false, false);
        inst.root.dispose();
        this.activeInstances.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const inst of this.activeInstances) {
      for (const mesh of inst.meshes) mesh.dispose(false, false);
      for (const mat of inst.mats) mat.dispose(false, false);
      inst.root.dispose();
    }
    this.activeInstances = [];
    for (const tex of this.textureCache.values()) {
      try {
        tex.dispose();
      } catch {
        // ignore
      }
    }
    this.textureCache.clear();
  }
}
