import creatureVoices from '../data/creatureVoices.json' with {type:'json'};
const monsterVoices = new Set(creatureVoices);
class MuSoundSynth {
  private ctx: AudioContext | null = null;
  private musicAudio: HTMLAudioElement | null = null;
  private activeTheme = '';
  private musicTimer: number | null = null;
  private musicStep = 0;
  private soundMapPromise: Promise<Record<string, string>> | null = null;
  private soundMap: Record<string, string> | null = null;
  private foreground = typeof document === 'undefined' || !document.hidden;
  private playingSfx = new Set<HTMLAudioElement>();

  private shorelineGain: GainNode | null = null;
  private shorelineBuffer: AudioBuffer | null = null;
  private shorelineSource: AudioBufferSourceNode | null = null;

  public setShoreline(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.foreground || this.muted || this.volume <= 0 || level <= 0) {
      this.shorelineSource?.stop();
      this.shorelineSource?.disconnect();
      this.shorelineSource = null;
      return;
    }
    if (!this.shorelineSource) {
      if (!this.shorelineBuffer) {
        const length = ctx.sampleRate * 4;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const samples = buffer.getChannelData(0);
        let ripple = 0;
        for (let i = 0; i < length; i++) {
          ripple = .91 * ripple + (Math.random() * 2 - 1) * .09;
          samples[i] = ripple * (.65 + .35 * Math.sin(4 * Math.PI * i / length)) *
            Math.min(1, i / 160, (length - 1 - i) / 160);
        }
        this.shorelineBuffer = buffer;
        this.shorelineGain = ctx.createGain();
        this.shorelineGain.gain.value = 0;
        this.shorelineGain.connect(ctx.destination);
      }
      this.shorelineSource = ctx.createBufferSource();
      this.shorelineSource.buffer = this.shorelineBuffer;
      this.shorelineSource.loop = true;
      this.shorelineSource.connect(this.shorelineGain!);
      this.shorelineSource.start();
    }
    this.shorelineGain!.gain.setTargetAtTime(.11 * this.volume * level, ctx.currentTime, .24);
  }

  public setForeground(active: boolean) {
    this.foreground = active;
    if (!active) {
      for (const audio of this.playingSfx) audio.pause();
      this.playingSfx.clear();
      this.setShoreline(0);
      void this.ctx?.suspend().catch(() => {});
    }
    this.syncMusicElement();
  }
  private monsterSfxThrottle = new Map<string, number>();

  public volume = 0.75;
  public muted = false;
  public musicEnabled = true;
  public musicVolume = 0.45;

  private ensureContext(): AudioContext | null {
    if (!this.foreground || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        try {
          this.ctx = new AC();
        } catch {
          return null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private async ensureSoundMap(): Promise<Record<string, string>> {
    if (this.soundMap) return this.soundMap;
    if (!this.soundMapPromise) {
      this.soundMapPromise = fetch('./mugroup/efectos-audio.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          this.soundMap = (data?.sounds as Record<string, string>) || {};
          return this.soundMap;
        })
        .catch(() => {
          this.soundMap = {};
          return this.soundMap;
        });
    }
    return this.soundMapPromise;
  }

  private preloadedSkills = new Map<string, HTMLAudioElement>();

  public async preloadSkill(key: string): Promise<void> {
    if (this.muted || typeof Audio === 'undefined') return;
    const file = (await this.ensureSoundMap())[key];
    if (!file) return;
    const url = this.soundUrl(file);
    if (this.preloadedSkills.has(url)) return;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    this.preloadedSkills.set(url, audio);
  }

  private soundUrl(rel: string): string {
    return rel.startsWith('../') ? `./${rel.slice(3)}` : `./mugroup/${rel}`;
  }

  private playUrl(url: string, gain = 1.0): boolean {
    if (!this.foreground || this.muted || this.volume <= 0 || typeof window === 'undefined' || typeof Audio === 'undefined') {
      return false;
    }
    if (this.playingSfx.size >= 10) return true;
    try {
      const audio = this.preloadedSkills.get(url) ?? new Audio(url);
      this.preloadedSkills.delete(url);
      audio.volume = Math.max(0, Math.min(1, this.volume * gain));
      this.playingSfx.add(audio);
      const cleanup = () => {
        this.playingSfx.delete(audio);
      };
      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });
      void audio.play().catch(cleanup);
      return true;
    } catch {
      return false;
    }
  }

  private async playSoundKey(key: string, gain = 0.9): Promise<boolean> {
    if (this.muted || this.volume <= 0 || !key) return false;
    const map = await this.ensureSoundMap();
    const rel = map[key];
    if (!rel) return false;
    return this.playUrl(this.soundUrl(rel), gain);
  }

  public unlockAudio() {
    this.ensureContext();
    void this.ensureSoundMap();
    this.syncMusicElement();
  }

  public setMusicConfig(enabled: boolean, vol: number) {
    this.musicEnabled = enabled;
    this.musicVolume = Math.max(0, Math.min(1, vol));
    this.syncMusicElement();
  }

  public setMapMusic(theme: string) {
    const clean = theme === 'login' ? 'flaris' : (theme || 'flaris').toLowerCase();
    const validThemes = new Set(['flaris', 'robledal', 'puerto', 'ceniza', 'dungeon']);
    const resolved = validThemes.has(clean)
      ? clean
      : clean.includes('puerto') || clean.includes('atlans') || clean.includes('devias')
        ? 'puerto'
        : clean.includes('ceniza') || clean.includes('icarus')
          ? 'ceniza'
          : clean.includes('tower')
            ? 'dungeon'
            : clean.includes('robledal') || clean.includes('noria')
              ? 'robledal'
              : 'flaris';
    if (this.activeTheme === resolved && this.musicAudio) {
      this.syncMusicElement();
      return;
    }
    this.activeTheme = resolved;
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    if (this.musicAudio) {
      try {
        this.musicAudio.pause();
      } catch {
        // ignore
      }
      this.musicAudio = null;
    }
    try {
      const audio = new Audio(`./mugroup/audio/music/bgm_${resolved}.ogg`);
      audio.loop = true;
      audio.volume = this.muted || !this.musicEnabled ? 0 : Math.max(0, Math.min(1, this.musicVolume));
      this.musicAudio = audio;
      this.syncMusicElement();
    } catch {
      this.syncAmbientLoop();
    }
  }

  private syncMusicElement() {
    if (typeof window === 'undefined') return;
    if (!this.foreground || !this.musicEnabled || this.muted || this.musicVolume <= 0.01) {
      if (this.musicAudio) {
        try {
          this.musicAudio.pause();
        } catch {
          // ignore
        }
      }
      if (this.musicTimer !== null) {
        window.clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      return;
    }

    if (this.musicAudio) {
      this.musicAudio.volume = Math.max(0, Math.min(1, this.musicVolume));
      void this.musicAudio.play().catch(() => {
        this.syncAmbientLoop();
      });
    } else if (!this.activeTheme) {
      this.setMapMusic('flaris');
    }
  }

  private syncAmbientLoop() {
    if (typeof window === 'undefined') return;
    if (this.musicAudio && !this.musicAudio.paused) return;
    if (!this.foreground || !this.musicEnabled || this.muted || this.musicVolume <= 0.01) {
      if (this.musicTimer !== null) {
        window.clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      return;
    }
    if (this.musicTimer !== null || !this.ctx) return;

    const notes = [220, 261.63, 329.63, 293.66, 246.94, 293.66, 392.0, 329.63];
    this.musicTimer = window.setInterval(() => {
      if (!this.foreground || !this.musicEnabled || this.muted || !this.ctx || this.ctx.state !== 'running') return;
      if (this.musicAudio && !this.musicAudio.paused) return;
      const freq = notes[this.musicStep % notes.length];
      this.musicStep += 1;
      this.tone(freq, 0.48, 'triangle', this.musicVolume * 0.045);
    }, 850);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gainScale = 0.14) {
    if (this.muted || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(Math.max(0.001, this.volume * gainScale), now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch {
      // ignore web audio throttling
    }
  }

  public playAttack(isMagic = false) {
    void this.playSoundKey(isMagic ? 'hit_magic' : 'hit_sword', 0.85);
    this.tone(isMagic ? 520 : 190, 0.1, isMagic ? 'triangle' : 'sawtooth', 0.06);
  }

  public playHit(sex: 'male' | 'female' = 'male') {
    this.playUrl(`./mugroup/audio/hurt_${sex}.wav`, 0.72);
    this.tone(135, 0.09, 'square', 0.05);
  }

  public playPotion() {
    this.playUrl('./mugroup/audio/potion.wav', 0.85);
    this.tone(540, 0.09, 'sine', 0.06);
  }

  public playEquip(isWing = false) {
    this.playUrl(`./mugroup/audio/${isWing ? 'equip_wing' : 'equip_armor'}.wav`, 0.85);
    this.tone(isWing ? 620 : 380, 0.12, 'triangle', 0.06);
  }

  public playForge(success: boolean) {
    this.playUrl(`./mugroup/audio/${success ? 'levelup' : 'dark'}.wav`, 0.85);
    if (success) {
      this.tone(523.25, 0.12, 'triangle', 0.07);
    } else {
      this.tone(190, 0.18, 'sawtooth', 0.07);
    }
  }

  public playJewelDrop() {
    this.playUrl('./mugroup/audio/drop_ding.wav', 0.85);
    this.tone(987.77, 0.1, 'sine', 0.06);
  }

  public playLevelUp() {
    this.playUrl('./mugroup/audio/levelup.wav', 0.9);
    this.tone(659.25, 0.18, 'triangle', 0.08);
  }

  public playTradeSync() {
    this.playUrl('./mugroup/audio/pickup.wav', 0.8);
    this.tone(587.33, 0.1, 'sine', 0.06);
  }

  public playJump(sex: 'male' | 'female' = 'male') {
    this.playUrl(`./mugroup/audio/jump_${sex}.wav`, 0.75);
    const base = sex === 'female' ? 320 : 240;
    this.tone(base, 0.07, 'sine', 0.05);
  }

  public playCreatureTone(frequency: number, event: 'atk1' | 'dmg1' | 'die1'): void {
    this.tone(frequency * (event === 'atk1' ? 1 : event === 'dmg1' ? 0.8 : 0.55),
      event === 'die1' ? 0.28 : 0.12, 'triangle', 0.05);
  }

  public playMonsterSound(glbFile: string, event: 'atk1' | 'dmg1' | 'die1' | 'idle1' = 'atk1') {
    if (this.muted || this.volume <= 0 || !glbFile) return;
    const base = glbFile.split('/').pop()?.replace(/\.glb$/i, '').toLowerCase() || '';
    if (!base) return;
    const cleanName = base.replace(/\d+$/, '');
    const throttleKey = `${cleanName}_${event}`;
    const now = performance.now();
    const last = this.monsterSfxThrottle.get(throttleKey) ?? -Infinity;
    if (now - last < 750) return;
    this.monsterSfxThrottle.set(throttleKey, now);
    if (base === 'besibigfoot' && event !== 'idle1') {
      this.playUrl(`./mugroup/audio/npc_besibigfoot_${event}.wav`, .65);
      return;
    }
    const voice = base+'-'+event;
    if (monsterVoices.has(voice)) { this.playUrl('./mugroup/audio/voces/'+voice+'.ogg',.65); return; }
    const heavy = ['bang', 'grrr', 'rockmuscle', 'clockwork', 'jackhammer'].includes(cleanName);
    const flying = ['aibatt', 'flybat', 'meteonyker'].includes(cleanName);
    const clip = event === 'die1' ? (heavy ? 'openmu/audio/mBullDie' : flying ? 'openmu/audio/mDrakanDie' : 'openmu/audio/mHoundDie')
      : event === 'dmg1' ? 'mugroup/audio/hit_sword' : heavy ? 'mugroup/audio/stomp' : flying ? 'mugroup/audio/wind' : 'mugroup/audio/swing';
    this.playUrl(`./${clip}.wav`, 0.65);
  }

  public playWingFlap(): void {
    void this.playSoundKey('wing_flap', 0.34);
  }

  public playSkill(soundKey?: string) {
    if (soundKey) {
      void this.playSoundKey(soundKey, 0.92).then((played) => {
        if (!played) {
          this.playFallbackTone(soundKey);
        }
      });
      return;
    }
    this.playFallbackTone(soundKey);
  }

  private playFallbackTone(soundKey?: string) {
    const key = (soundKey || '').toLowerCase();
    if (key.includes('heal') || key.includes('buff') || key.includes('swell')) {
      this.tone(523.25, 0.12, 'sine', 0.08);
      return;
    }
    if (key.includes('fire') || key.includes('meteor')) {
      this.tone(220, 0.15, 'sawtooth', 0.08);
      return;
    }
    if (key.includes('ice') || key.includes('wind') || key.includes('arrow')) {
      this.tone(640, 0.1, 'triangle', 0.08);
      return;
    }
    if (key.includes('lightning') || key.includes('thunder')) {
      this.tone(420, 0.09, 'square', 0.08);
      return;
    }
    this.tone(280, 0.11, 'sawtooth', 0.08);
  }
}

export const soundSynth = new MuSoundSynth();
