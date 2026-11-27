import { equippedGearBonuses } from './data/flyffEconomy';
import { watchWebUpdates } from './services/githubOtaService';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bluetooth, RotateCw, ShieldAlert, Wifi } from 'lucide-react';
import {
  DEFAULT_BUTTON_LAYOUTS,
  MU_SKILLS,
  getStarterItemsForMuClass,
  getDefaultComboConfig,
} from './data/muSkillsAndClasses';
import { ITEM_BY_ID } from './data/itemCatalog';
import { getMapById } from './data/muWorldData';
import {
  addItemToCharacter,
  db,
  allocateStatPoint,
  buyJewelFromNpc,
  buyShopItem,
  addCatalogItem,
  applyGearHealth,
  consumeInventoryPotion,
  changeAccountPassword,
  createCharacterForAccount,
  equipItem,
  executeChaosMixWing,
  getAsyncDuels,
  getChatHistory,
  getEventSessions,
  getItemsForCharacter,
  getSharedLedger,
  initDexie,
  getWorldAdminProfile,
  getLocalRecoveryQuestions,
  recoverAccountLocal,
  listAccounts,
  listCharactersByAccount,
  loadButtonLayouts,
  loadComboConfig,
  loadGameSettings,
  loadLootFilters,
  loadPotionConfig,
  loginAccount,
  normalizeCharacterRecord,
  performHeroReset,
  recordAsyncDuel,
  recordSharedLedger,
  registerAccount,
  removeItemFromCharacter,
  saveButtonLayouts,
  saveChatMessage,
  saveComboConfig,
  saveGameSettings,
  saveLootFilters,
  savePotionConfig,
  setCharacterSpecialization,
  wearEquipment,
  repairEquipment,
  sellInventoryItem,
  updateCharacter,
  upgradeItemWithJewel,
  upgradeSkillRank,
  upsertEventSession,
} from './db/dexieStore';
import {
  MAX_HERO_LEVEL,
  POINTS_PER_LEVEL,
  aggregateActiveEffects,
  buildAsyncDuelChallenge,
  computeHeroDamageStats,
  computeHeroDefenseMitigation,
  createSkillBuffEffect,
  decodeDuelToken,
  encodeDuelToken,
  evaluateAchievements,
  getSkillCooldownSec,
  getSkillRank,
  getXpRequiredForLevel,
  resolveAsyncDuel,
} from './game/combatAndProgression';
import {
  DEFAULT_CAMERA_DISTANCE,
  DEFAULT_LOOT_FILTERS,
  DEFAULT_POTION_CONFIG,
  computeDualPotionRestore,
  type LootFilterSettings,
  type PotionConfig,
} from './game/worldPhysicsMath';
import { MuWorldEngine, type EngineCallbacks, type TargetMonsterInfo } from './game/MuWorldEngine';
import { soundSynth } from './game/soundSynth';
import { cloudSyncManager } from './services/cloudSyncManager';
import { loadAdminConfig } from './services/adminConfigService';
import { LocalSyncManager } from './services/syncManager';
import { ApkSyncDrawer } from './components/ApkSyncDrawer';
import { CharacterStatsModal } from './components/CharacterStatsModal';
import { WorldAdminPanel } from './components/WorldAdminPanel';
import { isStandaloneApp } from './components/PWAInstallButton';
import { ADMIN_USERNAME, closeWorldAdmin, openWorldAdmin, refreshLiveWorld } from './services/liveWorldService';
import { ClassicLoginFlow } from './components/ClassicLoginFlow';
import { MapWarpModal } from './components/MapWarpModal';
import { MuHudOverlay, type WorldTelemetryInfo } from './components/MuHudOverlay';
import { MuInventoryModal } from './components/MuInventoryModal';
import { NpcShopModal } from './components/NpcShopModal';
import { OracleChatDrawer } from './components/OracleChatDrawer';
import { OfflineIndicator } from './components/PWAInstallButton';
import { SettingsModal } from './components/SettingsModal';
import { SyncLinkDrawer } from './components/SyncLinkDrawer';
import type {
  ActiveEffect,
  AsyncDuelChallenge,
  AsyncDuelRecord,
  ButtonLayoutItem,
  CharacterComboConfig,
  ChatMessageRecord,
  EventSessionRecord,
  FloatingDamageNumber,
  GameSettings,
  HeroClass,
  HudButtonId,
  MapId,
  MinimapEntitySnapshot,
  MuAccount,
  MuCharacter,
  MuItem,
  NpcDef,
  RoomPeer,
  RoomState,
  SharedLedgerEntry,
  ShopItemDef,
  SkillDef,
  SyncStatusInfo,
  TransportMode,
} from './types/game';

interface FloatingBanner {
  id: number;
  text: string;
  color: string;
}

const INITIAL_SETTINGS: GameSettings = {
  brightness: 1.08,
  volume: 0.75,
  muted: false,
  musicEnabled: true,
  musicVolume: 0.45,
  free3dCamera: false,
  cameraDistance: DEFAULT_CAMERA_DISTANCE,
  cameraDistanceMigratedV2: true,
  cameraDistanceMigratedV3: true,
  autoAimAssist: true,
  targetFps: 60,
};

export default function App() {
  const [loadingScene, setLoadingScene] = useState({ art: 'entrada', label: 'Abriendo el reino' });
  const worldLoadRef = useRef(false);
  const [worldLoading,setWorldLoading] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [worldAdmin, setWorldAdmin] = useState<Awaited<ReturnType<typeof openWorldAdmin>> | null>(null);
  const engineRef = useRef<MuWorldEngine | null>(null);
  const syncRef = useRef<LocalSyncManager | null>(null);

  const [screenStage, setScreenStage] = useState<'login' | 'character_select' | 'playing' | 'paused'>('login');
  const [accounts, setAccounts] = useState<MuAccount[]>([]);
  const [currentAccount, setCurrentAccount] = useState<MuAccount | null>(null);
  const [characters, setCharacters] = useState<MuCharacter[]>([]);
  const [character, setCharacter] = useState<MuCharacter | null>(null);
  const [items, setItems] = useState<MuItem[]>([]);
  const [ledger, setLedger] = useState<SharedLedgerEntry[]>([]);
  const [eventHistory, setEventHistory] = useState<EventSessionRecord[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageRecord[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo>(() => cloudSyncManager.getStatus());

  const [gameSettings, setGameSettings] = useState<GameSettings>(INITIAL_SETTINGS);
  const [buttonLayouts, setButtonLayouts] = useState<Record<HudButtonId, ButtonLayoutItem>>(DEFAULT_BUTTON_LAYOUTS);
  const [comboConfig, setComboConfig] = useState<CharacterComboConfig>(getDefaultComboConfig('DK'));
  const [helperEnabled, setHelperEnabled] = useState(false);
  const [comboArmed, setComboArmed] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [measuredFps, setMeasuredFps] = useState(60);
  const [worldTelemetry, setWorldTelemetry] = useState<WorldTelemetryInfo>({
    x: -200,
    z: -255,
    inSafeCity: true,
    totalMonsters: 0,
    nearbyMonsters: 0,
    mapName: 'Flaris',
    areaKm2: 9.44,
  });
  const [damageNumbers, setDamageNumbers] = useState<FloatingDamageNumber[]>([]);
  const [isPortraitMobile, setIsPortraitMobile] = useState(
    () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth && window.innerWidth < 900,
  );

  const [activeDrawer, setActiveDrawer] = useState<
    'none' | 'inventory' | 'sync' | 'oracle' | 'apk' | 'settings' | 'mapWarp' | 'stats' | 'npc'
  >('none');
  const [nearbyNpc, setNearbyNpc] = useState<NpcDef | null>(null);
  const [activeNpc, setActiveNpc] = useState<NpcDef | null>(null);
  const [npcStatusMessage, setNpcStatusMessage] = useState<string | null>(null);
  const [forgeMessage, setForgeMessage] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [banners, setBanners] = useState<FloatingBanner[]>([]);
  const [activeEffects, setActiveEffects] = useState<ActiveEffect[]>([]);
  const [targetMonster, setTargetMonster] = useState<TargetMonsterInfo | null>(null);
  const [skillCooldowns, setSkillCooldowns] = useState<Record<string, number>>({});
  const [duelRecords, setDuelRecords] = useState<AsyncDuelRecord[]>([]);
  const [serverChallenges, setServerChallenges] = useState<AsyncDuelChallenge[]>([]);
  const [lastDuelResult, setLastDuelResult] = useState<AsyncDuelRecord | null>(null);
  const [skillNotice, setSkillNotice] = useState<string | null>(null);
  const [lootFilters, setLootFilters] = useState<LootFilterSettings>(DEFAULT_LOOT_FILTERS);
  const [potionConfig, setPotionConfig] = useState<PotionConfig>(DEFAULT_POTION_CONFIG);
  const [minimapData, setMinimapData] = useState<MinimapEntitySnapshot | null>(null);

  const autoStartedRef = useRef(false);
  const ledgerRef = useRef<SharedLedgerEntry[]>([]);
  const eventsRef = useRef<EventSessionRecord[]>([]);
  const skillCooldownsRef = useRef<Record<string, number>>({});
  const charRef = useRef<MuCharacter | null>(null);
  const itemsRef = useRef<MuItem[]>([]);
  const roomRef = useRef<RoomState | null>(null);
  const settingsRef = useRef<GameSettings>(INITIAL_SETTINGS);
  const screenStageRef = useRef(screenStage);
  const [updateState,setUpdateState] = useState('');
  useEffect(() => watchWebUpdates(async () => {
    if (worldLoadRef.current) return false;
    const c = charRef.current;
    const pose = screenStageRef.current === 'playing' && engineRef.current?.getHeroPose();
    await db.transaction('rw', db.tables, async () => {
      if (c && pose) await db.characters.update(c.id, {
        currentMapId:pose.mapId,lastX: pose.x, lastZ: pose.z, lastRotY: pose.rotY, updatedAt: Date.now(), isSynced: false,
      });
    });
    return !worldLoadRef.current;
  },setUpdateState), []);
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;
    const observer = new ResizeObserver(() => engineRef.current?.resizeView());
    observer.observe(mount);
    return () => observer.disconnect();
  }, []);
  const currentAccRef = useRef<MuAccount | null>(null);
  const lootFiltersRef = useRef<LootFilterSettings>(DEFAULT_LOOT_FILTERS);
  const potionConfigRef = useRef<PotionConfig>(DEFAULT_POTION_CONFIG);
  const autoHealAtRef = useRef<number>(0);
  const pressAttackRef = useRef<(useCombo?: boolean, helper?: boolean) => void>(() => {});
  charRef.current = character;
  itemsRef.current = items;
  roomRef.current = roomState;
  settingsRef.current = gameSettings;
  screenStageRef.current = screenStage;
  currentAccRef.current = currentAccount;
  ledgerRef.current = ledger;
  eventsRef.current = eventHistory;
  skillCooldownsRef.current = skillCooldowns;
  lootFiltersRef.current = lootFilters;
  potionConfigRef.current = potionConfig;

  const pushBanner = useCallback((text: string, color = '#fbbf24') => {
    const id = Date.now() + Math.random();
    setBanners((prev) => [...prev.slice(-3), { id, text, color }]);
    window.setTimeout(() => {
      setBanners((prev) => prev.filter((b) => b.id !== id));
    }, 2200);
  }, []);

  const pushDamageNumber = useCallback((dmg: FloatingDamageNumber) => {
    setDamageNumbers((prev) => [...prev.slice(-14), dmg]);
    window.setTimeout(() => {
      setDamageNumbers((prev) => prev.filter((d) => d.id !== dmg.id));
    }, 950);
  }, []);

  const requestLandscapeFullscreen = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      const orient = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
      if (orient?.lock) {
        await orient.lock('landscape');
      }
    } catch {
      // Ignore browser orientation lock restrictions
    }
  }, []);

  useEffect(() => {
    const checkOrient = () => {
      setIsPortraitMobile(window.innerHeight > window.innerWidth && window.innerWidth < 900);
    };
    window.addEventListener('resize', checkOrient);
    return () => window.removeEventListener('resize', checkOrient);
  }, []);

  // Unlock Web Audio on first gesture so background music starts smoothly
  useEffect(() => {
    const visibility = () => soundSynth.setForeground(!document.hidden);
    const hide = () => soundSynth.setForeground(false);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    const unlock = () => {
      soundSynth.unlockAudio();
      void engineRef.current?.unlockAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibility);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const selectAndHydrateCharacter = useCallback(async (charObj: MuCharacter) => {
    const norm = normalizeCharacterRecord(charObj);
    setCharacter(norm);
    engineRef.current?.updateHeroStats(norm);
    const [charItems, charCombo] = await Promise.all([
      getItemsForCharacter(norm.id),
      loadComboConfig(norm.id, norm.classType),
    ]);
    setItems(charItems);
    setComboConfig(charCombo);
    engineRef.current?.syncHeroAppearance(
      norm.classType,
      charItems.filter((i) => i.isEquipped),
      norm.sex,
      norm.appearanceId,
    ).catch(console.error);
    return { char: norm, charItems };
  }, []);

  const checkAndGrantAchievements = useCallback(
    async (
      charObj: MuCharacter,
      charItems: MuItem[],
      ledgerCount: number,
      eventCount: number,
    ): Promise<MuCharacter> => {
      const res = evaluateAchievements(charObj, charItems, ledgerCount, eventCount);
      if (res.newlyUnlocked.length === 0) return charObj;
      let bonusZen = 0;
      let bonusBless = 0;
      let bonusSkillPts = 0;
      const unlockedIds = new Set(charObj.unlockedAchievements || []);
      for (const ach of res.newlyUnlocked) {
        unlockedIds.add(ach.id);
        bonusZen += ach.rewardZen;
        bonusBless += ach.rewardBless;
        bonusSkillPts += ach.rewardSkillPoints;
        pushBanner(`Logro: ${ach.title} (+${ach.rewardZen} Zen, +${ach.rewardSkillPoints} SkillPt)`, '#34d399');
      }
      const saved = await updateCharacter({
        ...charObj,
        zen: charObj.zen + bonusZen,
        bless: charObj.bless + bonusBless,
        skillPoints: (charObj.skillPoints ?? 0) + bonusSkillPts,
        unlockedAchievements: Array.from(unlockedIds),
      });
      const norm = normalizeCharacterRecord(saved);
      setCharacter(norm);
      return norm;
    },
    [pushBanner],
  );

  const loadAllFromDexie = useCallback(
    async (preferAccountId?: string, preferCharId?: string) => {
      await initDexie();
      const [accList, loadedSettings, loadedLayouts, loadedFilters, loadedPotions, led, evs, chats, duels, challenges] = await Promise.all([
        listAccounts(),
        loadGameSettings(),
        loadButtonLayouts(),
        loadLootFilters(),
        loadPotionConfig(),
        getSharedLedger(),
        getEventSessions(),
        getChatHistory(),
        getAsyncDuels(),
        cloudSyncManager.fetchDuelChallenges(),
      ]);

      setAccounts(accList);
      setGameSettings(loadedSettings);
      setButtonLayouts(loadedLayouts);
      setLootFilters(loadedFilters);
      setPotionConfig(loadedPotions);
      setLedger(led);
      setEventHistory(evs);
      setChatMessages(chats);
      setDuelRecords(duels);
      setServerChallenges(challenges);

      const activeAccId = preferAccountId || currentAccRef.current?.id;
      if (activeAccId) {
        const chars = await listCharactersByAccount(activeAccId);
        setCharacters(chars);
        const chosen = (preferCharId && chars.find((c) => c.id === preferCharId)) || chars[0] || null;
        if (chosen) {
          await selectAndHydrateCharacter(chosen);
        } else {
          setCharacter(null);
          engineRef.current?.updateHeroStats(null);
          setItems([]);
        }
      }
    },
    [selectAndHydrateCharacter],
  );

  // Expose screenStage state attribute for accessibility and testing
  useEffect(() => {
    document.body.dataset.state = screenStage === 'login' ? 'title' : screenStage;
  }, [screenStage]);

  // Sync engine hero stats snapshot whenever character changes
  useEffect(() => {
    engineRef.current?.updateHeroStats(character);
  }, [character]);

  // Support ?autostart=1 and optional ?map=lorencia to jump directly into active gameplay
  useEffect(() => {
    if (autoStartedRef.current || !currentAccount || screenStage !== 'character_select') return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('autostart')) return;
    if (!character || !engineRef.current || worldLoadRef.current) return;

    autoStartedRef.current = true;
    const requestedMap = params.get('map') as MapId | null;
    const targetChar = requestedMap ? { ...character, currentMapId: getMapById(requestedMap).id } : character;
    if (requestedMap) {
      charRef.current = targetChar;
      setCharacter(targetChar);
      void updateCharacter(targetChar);
    }
    (async () => {
      worldLoadRef.current = true;
      setWorldLoading(true);
      try {
        const engine = engineRef.current;
        if (!engine) return;
        engine.updateHeroStats(targetChar);
        await engine.syncHeroAppearance(
          targetChar.classType,
          itemsRef.current.filter((i) => i.isEquipped),
          targetChar.sex,
          targetChar.appearanceId,
        );
        const savedPose =
          !requestedMap && typeof targetChar.lastX === 'number' && typeof targetChar.lastZ === 'number'
            ? { x: targetChar.lastX, z: targetChar.lastZ, rotY: targetChar.lastRotY }
            : undefined;
        await engine.loadMap(targetChar.currentMapId || 'flaris', true, savedPose);
        engine.setMode('playing');
        setScreenStage('playing');
      } finally {
        worldLoadRef.current = false;
        setWorldLoading(false);
      }
    })();
  }, [character, currentAccount, screenStage]);

  const applyPublishedWorld = useCallback(async () => {
    await refreshLiveWorld();
    if (worldLoadRef.current || (screenStageRef.current !== 'playing' && screenStageRef.current !== 'paused')) return;
    const engine = engineRef.current;
    if (!engine) return;
    await engine.applyWorldRevision(() => {
      setActiveNpc(null);
      setActiveDrawer(drawer => drawer === 'npc' ? 'none' : drawer);
    });
  }, []);

  useEffect(() => {
    const check = () => { void applyPublishedWorld().catch(console.error); };
    check();
    window.addEventListener('online', check);
    const timer = window.setInterval(check, 15_000);
    return () => { window.removeEventListener('online', check); clearInterval(timer); };
  }, [applyPublishedWorld]);

  // Boot Dexie IndexedDB & CloudSyncManager (Golden Rule timestamp sync)
  useEffect(() => {
    let unsubStatus = () => {};
    let unsubCloudApplied = () => {};

    void loadAdminConfig();
    loadAllFromDexie().then(() => {
      cloudSyncManager.start();
      unsubStatus = cloudSyncManager.subscribeStatus((st) => {
        setSyncStatus(st);
      });
      unsubCloudApplied = cloudSyncManager.onCloudDataApplied(() => {
        loadAllFromDexie(currentAccRef.current?.id, charRef.current?.id);
      });
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('sala')) {
      setActiveDrawer('sync');
    }

    return () => {
      unsubStatus();
      unsubCloudApplied();
      cloudSyncManager.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    soundSynth.volume = gameSettings.volume;
    soundSynth.muted = gameSettings.muted;
    engineRef.current?.setAudio(gameSettings.volume, gameSettings.muted);
    soundSynth.setMusicConfig(gameSettings.musicEnabled, gameSettings.musicVolume);
    engineRef.current?.setBrightness(gameSettings.brightness);
    engineRef.current?.setFree3dMode(gameSettings.free3dCamera);
    engineRef.current?.setCameraDistance(gameSettings.cameraDistance ?? DEFAULT_CAMERA_DISTANCE);
    engineRef.current?.setAutoAimAssist(gameSettings.autoAimAssist ?? true);
    engineRef.current?.setTargetFps(gameSettings.targetFps);
  }, [gameSettings]);

  // Tick active effects & skill cooldowns every 250ms while playing
  useEffect(() => {
    if (screenStage !== 'playing') return;
    const timer = window.setInterval(() => {
      setActiveEffects((prev) => {
        if (prev.length === 0) return prev;
        const next = prev
          .map((e) => ({ ...e, remainingSec: Number((e.remainingSec - 0.25).toFixed(2)) }))
          .filter((e) => e.remainingSec > 0);
        return next;
      });
      setSkillCooldowns((prev) => {
        const keys = Object.keys(prev);
        if (keys.length === 0) return prev;
        let changed = false;
        const next: Record<string, number> = {};
        for (const k of keys) {
          const rem = Number((prev[k] - 0.25).toFixed(2));
          if (rem > 0) {
            next[k] = rem;
          }
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [screenStage]);

  useEffect(() => {
    const agg = aggregateActiveEffects(activeEffects);
    engineRef.current?.setActiveEffectBonuses({
      atkBonusPct: agg.atkBonusPct,
      speedBonusPct: agg.speedBonusPct,
      critBonusPct: agg.critBonusPct,
    });
  }, [activeEffects]);

  // Persist exact player coordinates continuously so re-entering resumes in the exact same spot
  useEffect(() => {
    if (screenStage !== 'playing') return;
    const saveCurrentPose = () => {
      const c = charRef.current;
      const pose = engineRef.current?.getHeroPose();
      if (!c || !pose) return;
      const movedEnough =
        typeof c.lastX !== 'number' ||
        typeof c.lastZ !== 'number' ||
        Math.hypot(pose.x - c.lastX, pose.z - c.lastZ) >= 0.75;
      if (!movedEnough) return;
      const next = { ...c, currentMapId:pose.mapId,lastX: Number(pose.x.toFixed(2)), lastZ: Number(pose.z.toFixed(2)), lastRotY: Number(pose.rotY.toFixed(3)) };
      charRef.current = next;
      void updateCharacter(next);
    };
    const timer = window.setInterval(saveCurrentPose, 2400);
    window.addEventListener('beforeunload', saveCurrentPose);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', saveCurrentPose);
      saveCurrentPose();
    };
  }, [screenStage]);

  // Passive MU SD / MP / AG regeneration while playing
  useEffect(() => {
    if (screenStage !== 'playing') return;
    const timer = window.setInterval(() => {
      setCharacter((prev) => {
        if (!prev) return prev;
        const recovery = prev.hp < prev.maxHp ? equippedGearBonuses(itemsRef.current).hpRecoveryPct ?? 0 : 0;
        if (!recovery && prev.mp >= prev.maxMp && prev.ag >= prev.maxAg && prev.sd >= prev.maxSd) return prev;
        return {
          ...prev,
          hp: Math.min(prev.maxHp, prev.hp + Math.round(prev.maxHp * recovery / 100)),
          mp: Math.min(prev.maxMp, prev.mp + 6),
          ag: Math.min(prev.maxAg, prev.ag + 8),
          sd: Math.min(prev.maxSd, prev.sd + 5),
        };
      });
    }, 1100);
    return () => window.clearInterval(timer);
  }, [screenStage]);

  useEffect(() => {
    const manager = new LocalSyncManager({
      onConnectionChange: (connected) => setWsConnected(connected),
      onRoomState: (room) => {
        setRoomState(room);
        engineRef.current?.setEventActive(room.activeEvent, room.eventType);
        if (syncRef.current) {
          engineRef.current?.syncRemotePeers(room.peers, syncRef.current.peerId).catch(console.error);
        }
        upsertEventSession({
          id: `sess-${room.code}`,
          sessionCode: room.code,
          eventType: room.eventType,
          hostName: room.hostName,
          transportMode: room.transport,
          startedAt: new Date().toISOString(),
          endedAt: null,
          wavesCleared: Math.max(0, room.eventWave - 1),
          bossDefeated: false,
          lootSummary: `En curso (${room.peers.length} jugadores)`,
        }).then(async () => setEventHistory(await getEventSessions()));
      },
      onPeerMoved: (peer) => {
        setRoomState((prev) => {
          if (!prev) return prev;
          const peers = prev.peers.map((p) => (p.peerId === peer.peerId ? peer : p));
          if (syncRef.current) {
            engineRef.current?.syncRemotePeers(peers, syncRef.current.peerId).catch(console.error);
          }
          return { ...prev, peers };
        });
      },
      onBossHp: (bossHp, bossMaxHp) => {
        setRoomState((prev) => (prev ? { ...prev, bossHp, bossMaxHp } : prev));
      },
      onEventCompleted: async (room, reward) => {
        setRoomState(room);
        engineRef.current?.setEventActive(false);
        soundSynth.playTradeSync();
        const activeChar = charRef.current;
        if (activeChar) {
          const updated: MuCharacter = {
            ...activeChar,
            zen: activeChar.zen + reward.zenBonus,
            bless: activeChar.bless + reward.blessBonus,
            soul: activeChar.soul + reward.soulBonus,
          };
          const savedChar = await updateCharacter(updated);
          setCharacter(savedChar);

          const rewardItem: MuItem = {
            id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            charId: savedChar.id,
            name: reward.itemName,
            slot: reward.itemName.includes('Báculo') || reward.itemName.includes('Espada') ? 'weapon' : 'armor',
            category:
              reward.itemName.includes('Alas')
                ? 'wings'
                : reward.itemName.includes('Báculo') || reward.itemName.includes('Espada')
                  ? 'weapon'
                  : 'armor',
            setName: 'Evento Cooperativo',
            rarity: 'excellent',
            enhanceLevel: 7,
            minDmg: 54,
            maxDmg: 82,
            defense: 42,
            magicPower: 68,
            luck: true,
            excellentOpt: 'Recompensa de Evento Guardada en IndexedDB',
            isEquipped: false,
            originalOwner: room.hostName,
            sharedFromSession: room.code,
            acquiredAt: new Date().toISOString(),
          };
          const nextItems = await addItemToCharacter(savedChar.id, rewardItem);
          setItems(nextItems);

          await recordSharedLedger({
            id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            sessionId: room.code,
            transportMode: room.transport,
            partnerName: room.hostName,
            role: room.hostPeerId === syncRef.current?.peerId ? 'host' : 'guest',
            direction: 'event_reward',
            itemId: rewardItem.id,
            itemName: `${rewardItem.name} +7`,
            itemSnapshotJson: JSON.stringify(rewardItem),
            status: 'committed',
            createdAt: new Date().toISOString(),
          });
          await upsertEventSession({
            id: `sess-${room.code}`,
            sessionCode: room.code,
            eventType: reward.eventType,
            hostName: room.hostName,
            transportMode: room.transport,
            startedAt: new Date().toISOString(),
            endedAt: null,
            wavesCleared: reward.wave,
            bossDefeated: true,
            lootSummary: `${reward.itemName} +7 · +${reward.zenBonus} Zen`,
          });
          setLedger(await getSharedLedger());
          setEventHistory(await getEventSessions());
        }
        pushBanner(`¡Evento completado! Recibido ${reward.itemName} +7`, '#34d399');
      },
      onTradeReceived: async (payload) => {
        const activeChar = charRef.current;
        if (!activeChar) return;
        const incomingItem: MuItem = {
          ...payload.item,
          id: `${activeChar.id}-trade-${payload.tradeId}`,
          charId: activeChar.id,
          isEquipped: false,
          sharedFromSession: payload.sessionCode,
          acquiredAt: payload.timestamp,
        };
        if (await db.items.get(incomingItem.id)) {
          syncRef.current?.acknowledgeTrade(payload.tradeId);
          return;
        }
        const nextItems = await addItemToCharacter(activeChar.id, incomingItem);
        setItems(nextItems);

        await recordSharedLedger({
          id: payload.tradeId,
          sessionId: payload.sessionCode,
          transportMode: payload.transport,
          partnerName: payload.fromPeerName,
          role: 'guest',
          direction: 'received',
          itemId: incomingItem.id,
          itemName: `${incomingItem.name} +${incomingItem.enhanceLevel}`,
          itemSnapshotJson: JSON.stringify(incomingItem),
          status: 'committed',
          createdAt: payload.timestamp,
        });
        syncRef.current?.acknowledgeTrade(payload.tradeId);
        setLedger(await getSharedLedger());
        soundSynth.playTradeSync();
        setSyncMessage(
          `Recibiste ${incomingItem.name} +${incomingItem.enhanceLevel} de ${payload.fromPeerName}. Guardado en IndexedDB.`,
        );
        pushBanner(`Recibido: ${incomingItem.name} +${incomingItem.enhanceLevel}`, '#38bdf8');
      },
      onTradeConfirmed: async (payload) => {
        const activeChar = charRef.current;
        if (!activeChar) return;
        const nextItems = await removeItemFromCharacter(activeChar.id, payload.item.id);
        setItems(nextItems);
        engineRef.current?.syncHeroAppearance(
          activeChar.classType,
          nextItems.filter((i) => i.isEquipped),
          activeChar.sex,
          activeChar.appearanceId,
        ).catch(console.error);

        await recordSharedLedger({
          id: payload.tradeId,
          sessionId: payload.sessionCode,
          transportMode: payload.transport,
          partnerName: payload.toPeerName,
          role: payload.toRole === 'host' ? 'guest' : 'host',
          direction: 'sent',
          itemId: payload.item.id,
          itemName: `${payload.item.name} +${payload.item.enhanceLevel}`,
          itemSnapshotJson: JSON.stringify(payload.item),
          status: 'committed',
          createdAt: payload.timestamp,
        });
        setLedger(await getSharedLedger());
        soundSynth.playTradeSync();
        setSyncMessage(
          `Transferido ${payload.item.name} +${payload.item.enhanceLevel} a ${payload.toPeerName}. Guardado en IndexedDB.`,
        );
      },
      onDuelChallenge: ({ fromPeerName, challenge }) => {
        setServerChallenges((prev) => [challenge, ...prev.filter((c) => c.id !== challenge.id)].slice(0, 24));
        pushBanner(`${fromPeerName} publicó un desafío de Duelo Asíncrono`, '#fb7185');
      },
      onDuelCompleted: ({ record }) => {
        pushBanner(`Duelo en sala: ${record.summary}`, '#fbbf24');
      },
      onRoomEnded: async (message) => {
        setRoomState(null);
        engineRef.current?.setEventActive(false);
        engineRef.current?.syncRemotePeers([], syncRef.current?.peerId || '');
        setSyncMessage(message);
        pushBanner('Invitación finalizada · Ítems y duelos asegurados en IndexedDB', '#fbbf24');
      },
      onError: setSyncMessage,
      onStatus: setSyncMessage,
    });
    syncRef.current = manager;
    return () => {
      manager.disconnect();
    };
  }, [pushBanner]);

  // Mount Babylon.js Web3D Engine once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const callbacks: EngineCallbacks = {
      onEquipmentWear: (slot, durability) => {
        const char = charRef.current; if (!char) return;
        const next = itemsRef.current.map(i => i.isEquipped && i.slot === slot ? { ...i, durability } : i);
        itemsRef.current = next; setItems(next);
        setCharacter(prev => prev?.id === char.id ? { ...applyGearHealth(prev, next), equipment: next.filter(i=>i.isEquipped), inventory: next.filter(i=>!i.isEquipped) } : prev);
        void wearEquipment(char.id, slot, durability, next.find(i => i.isEquipped && i.slot === slot)?.id).catch(error => pushBanner(String(error), '#f87171'));
      },
      onKillMonster: async (xp, zen, invasion) => {
        const c = charRef.current;
        if (!c) return;
        let nextXp = c.xp + xp;
        let nextLevel = c.level;
        let nextXpToNext = c.xpToNext;
        let nextMaxHp = c.maxHp;
        let nextMaxMp = c.maxMp;
        let nextMaxSd = c.maxSd;
        let nextMaxAg = c.maxAg;
        let unspentPoints = c.unspentPoints + (invasion?.points ?? 0);
        let skillPoints = c.skillPoints ?? 2;
        let leveledUp = false;

        let bonusLevels = invasion?.levels ?? 0;
        while ((bonusLevels > 0 || nextXp >= nextXpToNext) && nextLevel < MAX_HERO_LEVEL) {
          if (bonusLevels > 0) bonusLevels--; else nextXp -= nextXpToNext;
          nextLevel += 1;
          nextXpToNext = getXpRequiredForLevel(nextLevel);
          nextMaxHp += 28;
          nextMaxMp += 18;
          nextMaxSd += 22;
          nextMaxAg += 5;
          if (!invasion) unspentPoints += POINTS_PER_LEVEL;
          skillPoints += 1;
          leveledUp = true;
          if (nextLevel >= MAX_HERO_LEVEL) {
            nextXp = 0;
            pushBanner(`¡Nivel Máximo ${MAX_HERO_LEVEL} alcanzado! Haz RESET en Atributos (C)`, '#f43f5e');
          } else if (!invasion) {
            pushBanner(`¡Subiste a Nivel ${nextLevel}! (+${POINTS_PER_LEVEL} Pts Atributo & +1 SkillPt)`, '#fbbf24');
          }
        }
        if (nextLevel >= MAX_HERO_LEVEL) {
          nextXp = Math.min(nextXp, nextXpToNext);
        }

        if (leveledUp) {
          soundSynth.playLevelUp();
        }

        const updated = applyGearHealth({
          ...c,
          level: nextLevel,
          xp: nextXp,
          xpToNext: nextXpToNext,
          unspentPoints,
          skillPoints,
          maxHp: nextMaxHp,
          hp: leveledUp ? nextMaxHp : c.hp,
          maxMp: nextMaxMp,
          mp: leveledUp ? nextMaxMp : c.mp,
          maxSd: nextMaxSd,
          sd: leveledUp ? nextMaxSd : c.sd,
          maxAg: nextMaxAg,
          ag: leveledUp ? nextMaxAg : c.ag,
          zen: c.zen + zen,
          kills: c.kills + 1,
        }, itemsRef.current);
        if (invasion) pushBanner(`${invasion.name}: +${zen.toLocaleString()} Zen · +${nextLevel-c.level} niveles · +${invasion.points} puntos`, '#fbcf69');
        charRef.current = updated;
        setCharacter(updated);
        const saved = normalizeCharacterRecord(await updateCharacter(updated));
        if (charRef.current === updated) setCharacter(saved);
        await checkAndGrantAchievements(saved, itemsRef.current, ledgerRef.current.length, eventsRef.current.length);
      },
      onPickupLoot: async (drop) => {
        const c = charRef.current;
        if (!c) return;
        if (drop.kind === 'equipment') {
          const item = ITEM_BY_ID.get(drop.catalogId || '');
          if (item) {
            await addCatalogItem(c, item);
            if (charRef.current?.id === c.id) setItems(await getItemsForCharacter(c.id));
            pushBanner('+' + item.name, '#60a5fa');
          }
          return;
        }
        const updated: MuCharacter = {
          ...c,
          zen: c.zen + (drop.kind === 'zen' ? drop.amount : 0),
          bless: c.bless + (drop.kind === 'bless' ? drop.amount : 0),
          soul: c.soul + (drop.kind === 'soul' ? drop.amount : 0),
          chaos: c.chaos + (drop.kind === 'chaos' ? drop.amount : 0),
          life: c.life + (drop.kind === 'life' ? drop.amount : 0),
          creation: (c.creation ?? 0) + (drop.kind === 'creation' ? drop.amount : 0),
          talisman: (c.talisman ?? 0) + (drop.kind === 'talisman' ? drop.amount : 0),
        };
        charRef.current = updated;
        setCharacter(updated);
        const saved = await updateCharacter(updated);
        if (charRef.current === updated) setCharacter(saved);
        pushBanner(
          `+${drop.label}`,
          drop.kind === 'bless'
            ? '#f87171'
            : drop.kind === 'soul'
              ? '#60a5fa'
              : drop.kind === 'life'
                ? '#c084fc'
                : drop.kind === 'creation'
                  ? '#34d399'
                  : drop.kind === 'talisman'
                    ? '#fde047'
                    : '#fbbf24',
        );
      },
      onPlayerDamaged: (rawAmount, isCrit) => {
        const cur = charRef.current;
        if (!cur) return;
        const { finalDamage } = computeHeroDefenseMitigation(rawAmount, Boolean(isCrit), cur, itemsRef.current);
        const sdAbsorb = Math.min(cur.sd, Math.round(finalDamage * 0.55));
        const hpDamage = Math.max(1, finalDamage - sdAbsorb);
        const nextHp = Math.max(0, cur.hp - hpDamage);
        const nextSd = Math.max(0, cur.sd - sdAbsorb);

        if (nextHp <= 0) {
          const respawnPose = engineRef.current?.respawnInCurrentCity();
          const mapName = getMapById(cur.currentMapId).name;
          const revived: MuCharacter = {
            ...cur,
            hp: cur.maxHp,
            mp: cur.maxMp,
            sd: cur.maxSd,
            ag: cur.maxAg,
            lastX: respawnPose?.x ?? cur.lastX,
            lastZ: respawnPose?.z ?? cur.lastZ,
            lastRotY: respawnPose?.rotY ?? cur.lastRotY,
          };
          charRef.current = revived;
          setCharacter(revived);
          void updateCharacter(revived);
          pushBanner(`¡Has muerto! Renaces en la ciudad de ${mapName}`, '#ef4444');
          return;
        }

        setCharacter((prev) => (prev ? { ...prev, sd: nextSd, hp: nextHp } : prev));
      },
      onMonsterPowerHit: (power, damage) => {
        if (power.effectDebuff) {
          setActiveEffects((prev) => [
            ...prev.filter((e) => e.id !== `debuff-${power.id}`),
            {
              id: `debuff-${power.id}`,
              name: `${power.effectDebuff} (${power.name})`,
              kind: 'debuff',
              statHint: `-${damage} HP`,
              color: power.colorHex,
              remainingSec: 4,
              totalSec: 4,
            },
          ]);
        }
        pushBanner(`${power.name} (-${damage})`, power.colorHex);
      },
      onTargetMonsterChange: (target) => {
        setTargetMonster(target);
      },
      onHeroMoveSync: (x, z, rotY, action) => {
        if (roomRef.current && syncRef.current) {
          syncRef.current.sendPeerUpdate({ x, z, rotY, action, currentMapId: charRef.current?.currentMapId, sex: charRef.current?.sex, equipment: itemsRef.current.filter(i => i.isEquipped) });
        }
      },
      onBossHitInEvent: (damage) => {
        syncRef.current?.damageBoss(damage, charRef.current?.name || 'Héroe');
      },
      onFloatingText: (text, color) => {
        pushBanner(text, color);
      },
      onDamageNumber: (dmg) => {
        pushDamageNumber(dmg);
      },
      onNearbyNpcChange: (npc) => {
        setNearbyNpc(npc);
      },
      onOpenNpc: (npc) => {
        setActiveNpc(npc);
        setNpcStatusMessage(null);
        setActiveDrawer('npc');
      },
      onFpsUpdate: (fps) => {
        setMeasuredFps(fps);
      },
      onMinimapUpdate: (snap) => {
        setMinimapData(snap);
      },
      onAutoHuntAttack: () => {
        pressAttackRef.current(true, true);
      },
      onWorldTelemetry: (info) => {
        setWorldTelemetry(info);
      },
    };

    let engine: MuWorldEngine;
    try { engine = new MuWorldEngine(mount, callbacks, { headless: import.meta.env.DEV && new URLSearchParams(location.search).has('headless') }); }
    catch (error) { console.error(error);setEngineError('No hay aceleración WebGL disponible en este navegador. Abre el juego en un navegador con WebGL para ver el mundo 3D.');return; }
    if (import.meta.env.DEV) (window as any).__muEngine = engine;
    engineRef.current = engine;
    engine.setBrightness(settingsRef.current.brightness);
    engine.setAudio(settingsRef.current.volume, settingsRef.current.muted);
    engine.setFree3dMode(settingsRef.current.free3dCamera);
    engine.setCameraDistance(settingsRef.current.cameraDistance ?? DEFAULT_CAMERA_DISTANCE);
    engine.setAutoAimAssist(settingsRef.current.autoAimAssist ?? true);
    engine.setTargetFps(settingsRef.current.targetFps);

    if (charRef.current) {
      engine.updateHeroStats(charRef.current);
      engine.syncHeroAppearance(
        charRef.current.classType,
        itemsRef.current.filter((i) => i.isEquipped),
        charRef.current.sex,
        charRef.current.appearanceId,
      ).catch(console.error);
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
      if (import.meta.env.DEV) delete (window as any).__muEngine;
    };
  }, [checkAndGrantAchievements, pushBanner, pushDamageNumber]);

  const computeBonusStatPower = (c: MuCharacter) =>
    computeHeroDamageStats(c, itemsRef.current).avgAttack;

  const handleCastSkill = useCallback(
    (skill: SkillDef) => {
      const c = charRef.current;
      if (!c || screenStageRef.current !== 'playing' || !MU_SKILLS[c.classType].some(allowed => allowed.id === skill.id)) return;

      const remainingCd = skillCooldownsRef.current[skill.id] ?? 0;
      if (remainingCd > 0) {
        pushBanner(`${skill.shortName} en recarga (${remainingCd.toFixed(1)}s)`, '#94a3b8');
        return;
      }

      // Safe city blocks offensive skills cleanly without spending MP/AG
      if (engineRef.current?.isInSafeCity() && !skill.isBuff) {
        engineRef.current.executeSkill(skill, 1, computeBonusStatPower(c));
        return;
      }

      const useSkill =
        c.mp >= skill.mpCost && c.ag >= skill.agCost
          ? skill
          : MU_SKILLS[c.classType][0];

      if (useSkill.id !== skill.id) {
        pushBanner('MP/AG bajo · Ataque básico', '#f87171');
      }

      const cdSec = getSkillCooldownSec(useSkill);
      if (cdSec > 0.4) {
        setSkillCooldowns((prev) => ({ ...prev, [useSkill.id]: cdSec }));
      }

      if (useSkill.isBuff) {
        const eff = createSkillBuffEffect(useSkill, getSkillRank(c, useSkill.id));
        setActiveEffects((prev) => [...prev.filter((e) => e.id !== eff.id), eff]);
      }

      setCharacter((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          mp: Math.max(0, prev.mp - useSkill.mpCost),
          ag: Math.max(0, prev.ag - useSkill.agCost),
          hp: useSkill.isBuff ? Math.min(prev.maxHp, prev.hp + 55) : prev.hp,
          sd: useSkill.isBuff ? Math.min(prev.maxSd, prev.sd + 45) : prev.sd,
        };
      });

      engineRef.current?.executeSkill(useSkill, 1, computeBonusStatPower(c));
    },
    [pushBanner],
  );

  const handlePressAttack = useCallback((useCombo = comboArmed, helper = false) => {
    const c = charRef.current;
    if (!c || screenStageRef.current !== 'playing') return;
    const classSkills = MU_SKILLS[c.classType] || MU_SKILLS.DK;

    if (engineRef.current?.isInSafeCity()) {
      const def = classSkills.find((s) => s.id === comboConfig.defaultSkillId) || classSkills[0];
      engineRef.current.executeSkill(def, 1, computeBonusStatPower(c));
      return;
    }

    if (useCombo) {
      if (!engineRef.current?.canStartCombo()) return;
      const selectedIds = comboConfig.comboSkillIds.slice(0, 5);
      const comboSkills: SkillDef[] = [];
      for (const id of selectedIds) {
        const found = classSkills.find((s) => s.id === id && (!helper || !s.isBuff));
        if (found) comboSkills.push(found);
      }
      for (let idx = 1; comboSkills.length < 5 && idx < classSkills.length; idx++) {
        if ((!helper || !classSkills[idx].isBuff) && !comboSkills.some((s) => s.id === classSkills[idx].id)) {
          comboSkills.push(classSkills[idx]);
        }
      }
      const totalMp = Math.round(comboSkills.reduce((sum, s) => sum + s.mpCost, 0) * 0.55);
      const totalAg = Math.round(comboSkills.reduce((sum, s) => sum + s.agCost, 0) * 0.55);

      if (c.mp < totalMp || c.ag < totalAg) {
        pushBanner('MP/AG insuficiente para Combo x5 · Ataque base', '#fbbf24');
        const def = helper ? classSkills[0] : classSkills.find((s) => s.id === comboConfig.defaultSkillId) || classSkills[0];
        handleCastSkill(def);
        return;
      }

      setCharacter((prev) =>
        prev
          ? {
              ...prev,
              mp: Math.max(0, prev.mp - totalMp),
              ag: Math.max(0, prev.ag - totalAg),
            }
          : prev,
      );
      engineRef.current?.executeComboChain(comboSkills, computeBonusStatPower(c));
    } else {
      const def = classSkills.find((s) => s.id === comboConfig.defaultSkillId) || classSkills[0];
      handleCastSkill(def);
    }
  }, [comboArmed, comboConfig, handleCastSkill, pushBanner]);

  pressAttackRef.current = handlePressAttack;

  useEffect(() => {
    const basic = MU_SKILLS[character?.classType ?? 'DK'][0];
    engineRef.current?.setAutoHuntEnabled(
      helperEnabled && screenStage === 'playing' && !adminPanelOpen && activeDrawer === 'none' && !editMode,
      Math.min(...MU_SKILLS[character?.classType ?? 'DK'].filter(skill => !skill.isBuff).map(skill => skill.range), basic.range) + 1.4,
      lootFilters,
    );
  }, [helperEnabled, screenStage, adminPanelOpen, activeDrawer, editMode, character?.classType, lootFilters]);

  // Global keyboard shortcuts while playing/paused
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (adminPanelOpen) return;
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }
      if (e.code === 'Escape') {
        if (activeDrawer !== 'none') {
          setActiveDrawer('none');
        } else if (editMode) {
          setEditMode(false);
        } else if (screenStage === 'playing') {
          setScreenStage('paused');
        } else if (screenStage === 'paused') {
          setScreenStage('playing');
        }
        return;
      }

      if (screenStage !== 'playing' || activeDrawer !== 'none') return;
      const c = charRef.current;
      if (!c) return;
      const skills = MU_SKILLS[c.classType];

      if (e.code === 'Space') {
        e.preventDefault();
        handlePressAttack();
      } else if (e.code === 'KeyJ') {
        engineRef.current?.jump();
      } else if (e.code === 'Digit1' && skills[0]) {
        handleCastSkill(skills[0]);
      } else if (e.code === 'Digit2' && skills[1]) {
        handleCastSkill(skills[1]);
      } else if (e.code === 'Digit3' && skills[2]) {
        handleCastSkill(skills[2]);
      } else if (e.code === 'Digit4' && skills[3]) {
        handleCastSkill(skills[3]);
      } else if (e.code === 'Digit5' && skills[4]) {
        handleCastSkill(skills[4]);
      } else if (e.code === 'Digit6' && skills[5]) {
        handleCastSkill(skills[5]);
      } else if (e.code === 'Digit7' && skills[6]) {
        handleCastSkill(skills[6]);
      } else if (e.code === 'Digit8' && skills[7]) {
        handleCastSkill(skills[7]);
      } else if (e.code === 'Digit9' && skills[8]) {
        handleCastSkill(skills[8]);
      } else if (e.code === 'Digit0' && skills[9]) {
        handleCastSkill(skills[9]);
      } else if (e.code === 'KeyM') {
        setActiveDrawer('mapWarp');
      } else if (e.code === 'KeyC') {
        setActiveDrawer('stats');
      } else if (e.code === 'KeyV' || e.code === 'KeyI') {
        setActiveDrawer('inventory');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screenStage, activeDrawer, editMode, handlePressAttack, handleCastSkill, adminPanelOpen]);

  const handleLogin = async (username: string, password: string) => {
    const wantsAdmin = username.trim().toLowerCase() === ADMIN_USERNAME;
    let account: MuAccount;
    if (wantsAdmin) {
      try {
        const access = await openWorldAdmin(password);
        account = await getWorldAdminProfile(ADMIN_USERNAME);
        setWorldAdmin(access);
        setAdminPanelOpen(true);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'No se pudo abrir ADMIN.' };
      }
    } else {
      let res = await loginAccount(username, password);
      if (res.ok && await cloudSyncManager.refreshLinkedLogin(res.account)) res = await loginAccount(username,password);
      if (!res.ok && navigator.onLine) {
        try {
          await cloudSyncManager.restoreLogin(username,password);
          res = await loginAccount(username,password);
        } catch (e) { return {ok:false, error:e instanceof Error ? e.message : 'No se pudo abrir la cuenta.'}; }
      }
      if (!res.ok) return { ok: false, error: res.error };
      account = res.account;
      try {
        if (isStandaloneApp() && account.id !== 'acc-lorencia-demo') localStorage.setItem('mu-last-local-user', account.username);
      } catch { /* remembering the local ID is optional */ }
    }
    setCurrentAccount(account);
    cloudSyncManager.setActiveAccountId(wantsAdmin ? null : account.id);
    const chars = await listCharactersByAccount(account.id);
    setCharacters(chars);
    if (chars[0]) {
      await selectAndHydrateCharacter(chars[0]);
    } else {
      setCharacter(null);
      engineRef.current?.updateHeroStats(null);
      setItems([]);
    }
    engineRef.current?.setMode('character_select');
    setScreenStage('character_select');
    return { ok: true };
  };

  const handleRegister = async (input: {
    username: string;
    password: string;
    secretQ1: string;
    secretA1: string;
    secretQ2: string;
    secretA2: string;
  }) => {
    if (input.username.trim().toLowerCase() === ADMIN_USERNAME) return { ok: false, error: 'Ese ID está reservado.' };
    if (await cloudSyncManager.nameTaken(input.username)) return {ok:false,error:'Ese ID ya está registrado. Entra con tu contraseña.'};
    const res = await registerAccount(input);
    if (!res.ok) return { ok: false, error: res.error };
    setAccounts(await listAccounts());
    try { if (isStandaloneApp()) localStorage.setItem('mu-last-local-user', res.account.username); }
    catch { /* remembering the local ID is optional */ }
    setCurrentAccount(res.account);
    cloudSyncManager.setActiveAccountId(res.account.id);
    setCharacters([]);
    setCharacter(null);
    engineRef.current?.updateHeroStats(null);
    setItems([]);
    engineRef.current?.setMode('character_select');
    setScreenStage('character_select');
    return { ok: true };
  };

  const handleChangePassword = async (
    username: string,
    oldPassword: string,
    newPassword: string,
  ) => {
    const res = await changeAccountPassword(username, oldPassword, newPassword);
    if (res.ok) {
      setAccounts(await listAccounts());
    }
    return res;
  };

  const handleLookupRecoveryQuestions = async (
    username: string,
  ): Promise<
    | { found: true; secretQ1: string; secretQ2: string; source: 'local' | 'cloud' }
    | { found: false; error?: string }
  > => {
    try {
      const [secretQ1,secretQ2] = await cloudSyncManager.recoveryQuestions(username);
      return {found:true,secretQ1,secretQ2,source:'cloud'};
    } catch (e) {
      const local = await getLocalRecoveryQuestions(username);
      if (local.found) return {...local, source:'local'};
      return {found:false,error:e instanceof Error ? e.message : 'La recuperación no está disponible.'};
    }
  };

  const handleRecoverAccount = async (input: {username:string; slot:1|2; answer:string; secondAnswer?:string; newPassword:string}) => {
    try {
      if (input.secondAnswer !== undefined) {
        const result = await recoverAccountLocal(input.username,input.answer,input.secondAnswer,input.newPassword);
        if (!result.ok) return result;
        setAccounts(await listAccounts());
        return {ok:true,message:'Contraseña cambiada en este dispositivo. Entra para sincronizar tu partida.'};
      }
      await cloudSyncManager.recoverLogin(input.username,input.slot,input.answer,input.newPassword);
      setAccounts(await listAccounts());
      return {ok:true,message:'Cuenta recuperada. Entra con tu nueva contraseña.'};
    } catch (e) {
      return {ok:false,error:e instanceof Error ? e.message : 'No se pudo recuperar la cuenta.'};
    }
  };

  const handleCreateCharacter = async (name: string, classType: HeroClass, sex: 'male' | 'female', appearanceId?: string) => {
    if (!currentAccount || worldLoadRef.current) return;
    worldLoadRef.current = true;
    setLoadingScene({art:'entrada', label:'Creando tu personaje'});
    setWorldLoading(true);
    try {
    const created = await createCharacterForAccount(currentAccount.id, name, classType, sex, appearanceId);
    const chars = await listCharactersByAccount(currentAccount.id);
    setCharacters(chars);
    await selectAndHydrateCharacter(created);
    soundSynth.playForge(true);
    } finally { worldLoadRef.current = false; setWorldLoading(false); }
  };

  const handleEnterWorld = async () => {
    const engine = engineRef.current;
    if (!character || !engine || worldLoadRef.current) return;
    setLoadingScene({art:'entrada', label:'Entrando con ' + character.name});
    worldLoadRef.current = true; setWorldLoading(true);
    try {
      if (window.innerWidth < 1024) await requestLandscapeFullscreen();
      engine.updateHeroStats(character);
      await engine.syncHeroAppearance(character.classType, items.filter(i => i.isEquipped), character.sex, character.appearanceId);
      const savedPose =
        typeof character.lastX === 'number' && typeof character.lastZ === 'number'
          ? { x: character.lastX, z: character.lastZ, rotY: character.lastRotY }
          : undefined;
      await engine.loadMap(character.currentMapId || 'flaris', true, savedPose);
      engine.setMode('playing'); setScreenStage('playing');
    } catch(error) {
      pushBanner(`No se pudo cargar el personaje o mapa: ${String(error)}`, '#f87171');
    } finally { worldLoadRef.current = false; setWorldLoading(false); }
  };

  const handleWarpToMap = async (mapId: MapId) => {
    const engine = engineRef.current;
    if (!character || !engine || worldLoadRef.current) return;
    const mapCfg = getMapById(mapId);
    if (character.zen < mapCfg.warpZen) {
      pushBanner(`Necesitas ${mapCfg.warpZen.toLocaleString()} Zen para viajar a ${mapCfg.name}`, '#f87171'); return;
    }
    setLoadingScene({art:'viaje', label:'Viajando a ' + mapCfg.name});
    worldLoadRef.current = true; setWorldLoading(true);
    try {
      await engine.loadMap(mapId, true);
      const latest = charRef.current;
      if (!latest || latest.id !== character.id) return;
      const pose = engine.getHeroPose();
      const saved = await updateCharacter({
        ...latest,
        zen: latest.zen - mapCfg.warpZen,
        currentMapId: mapId,
        lastX: pose?.x ?? mapCfg.spawn?.x,
        lastZ: pose?.z ?? mapCfg.spawn?.z,
        lastRotY: pose?.rotY,
      });
      setCharacter(saved); setActiveDrawer('none');
      pushBanner(`Teletransportado a ${mapCfg.name} (Nv.${mapCfg.minLevel}–${mapCfg.maxLevel})`, '#38bdf8');
    } catch(error) {
      pushBanner(`No se pudo viajar: ${String(error)}`, '#f87171');
      try { await engine.loadMap(character.currentMapId, true); }
      catch { engine.setMode('character_select'); setScreenStage('character_select'); }
    } finally { worldLoadRef.current = false; setWorldLoading(false); }
  };

  const handleUpdateSettings = async (next: GameSettings) => {
    setGameSettings(next);
    await saveGameSettings(next);
  };

  const handleUpdateButtonLayouts = async (next: Record<HudButtonId, ButtonLayoutItem>) => {
    setButtonLayouts(next);
    await saveButtonLayouts(next);
  };

  const handleUpdateComboConfig = async (next: CharacterComboConfig) => {
    setComboConfig(next);
    if (character) {
      await saveComboConfig(character.id, next);
    }
  };

  const handleUpdateLootFilters = (next: LootFilterSettings) => {
    setLootFilters(next);
    void saveLootFilters(next);
  };

  const handleUpdatePotionConfig = (next: PotionConfig) => {
    setPotionConfig(next);
    void savePotionConfig(next);
  };

  const handleHealPotion = useCallback(async () => {
    const c = charRef.current;
    if (!c) return;
    const cfg = potionConfigRef.current;
    let res = computeDualPotionRestore({
      hp: c.hp,
      maxHp: c.maxHp,
      mp: c.mp,
      maxMp: c.maxMp,
      sd: c.sd,
      maxSd: c.maxSd,
      ag: c.ag,
      maxAg: c.maxAg,
      tierId: cfg.tierId,
    });
    if (c.zen < res.tier.zenCost) {
      res = computeDualPotionRestore({
        hp: c.hp,
        maxHp: c.maxHp,
        mp: c.mp,
        maxMp: c.maxMp,
        sd: c.sd,
        maxSd: c.maxSd,
        ag: c.ag,
        maxAg: c.maxAg,
        tierId: 'menor',
      });
    }
    const updated: MuCharacter = {
      ...c,
      hp: res.nextHp,
      mp: res.nextMp,
      sd: res.nextSd,
      ag: res.nextAg,
      zen: Math.max(0, c.zen - res.tier.zenCost),
    };
    charRef.current = updated;
    setCharacter(updated);
    soundSynth.playPotion();
    pushBanner(
      `+${res.restoredHp} HP / +${res.restoredMp} MP${res.tier.zenCost > 0 ? ` (-${res.tier.zenCost} Zen)` : ''}`,
      '#4ade80',
    );
    const saved = await updateCharacter(updated);
    setCharacter(normalizeCharacterRecord(saved));
  }, [pushBanner]);

  // Auto-loot (filtered) & auto-heal loop when playing
  useEffect(() => {
    if (screenStage !== 'playing') return;
    const timer = window.setInterval(() => {
      if (!helperEnabled && lootFiltersRef.current.autoLootEnabled) {
        engineRef.current?.collectAutoLoot(lootFiltersRef.current);
      }
      if (document.hidden || activeDrawer !== 'none' || adminPanelOpen || editMode) return;
      if (helperEnabled || comboArmed) {
        const c = charRef.current;
        if (c && (c.hp < c.maxHp || c.mp < c.maxMp)) {
          const hpPct = (c.hp / Math.max(1, c.maxHp)) * 100;
          const mpPct = (c.mp / Math.max(1, c.maxMp)) * 100;
          const threshold = potionConfigRef.current.autoHealThresholdPct;
          if (hpPct < threshold || mpPct < Math.min(45, threshold)) {
            const now = Date.now();
            if (now - autoHealAtRef.current > 1700) {
              autoHealAtRef.current = now;
              void handleHealPotion();
            }
          }
        }
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [screenStage, comboArmed, helperEnabled, handleHealPotion, activeDrawer, adminPanelOpen, editMode]);

  const handleEquip = async (itemId: string) => {
    if (!character) return;
    const nextItems = await equipItem(character.id, itemId);
    setItems(nextItems);
    setCharacter(current => current?.id === character.id ? applyGearHealth(current, nextItems) : current);
    engineRef.current?.syncHeroAppearance(
      character.classType,
      nextItems.filter((i) => i.isEquipped),
      character.sex,
      character.appearanceId,
    ).catch(console.error);
    const toggled = nextItems.find((i) => i.id === itemId);
    soundSynth.playEquip(toggled?.slot === 'wings');
    setForgeMessage('Equipo actualizado y guardado en IndexedDB (Dexie).');
  };

  const handleUsePotion = async (itemId: string) => {
    const c = charRef.current;
    if (!c) return;
    const updated = await consumeInventoryPotion(c.id, itemId);
    if (!updated) { setForgeMessage('No necesitas recuperar PV o PM con esta poción.'); return; }
    if (charRef.current?.id !== c.id) return;
    setCharacter(updated);
    setItems(await getItemsForCharacter(c.id));
    soundSynth.playPotion();
  };

  const handleUpgrade = async (itemId: string, jewel: 'bless' | 'soul' | 'life' | 'harmony') => {
    if (!character) return;
    const result = await upgradeItemWithJewel(character, itemId, jewel);
    setCharacter(result.character);
    setItems(result.items);
    setForgeMessage(result.message);
    soundSynth.playForge(result.success);
    engineRef.current?.syncHeroAppearance(
      result.character.classType,
      result.items.filter((i) => i.isEquipped),
      result.character.sex,
      result.character.appearanceId,
    ).catch(console.error);
  };

  const handleAllocateStat = async (stat: 'str' | 'agi' | 'vit' | 'ene' | 'cmd', amount: number) => {
    if (!character) return;
    const res = await allocateStatPoint(character, stat, amount);
    if (res.ok) {
      setCharacter(res.character);
      soundSynth.playTradeSync();
    } else if (res.message) {
      pushBanner(res.message, '#f87171');
    }
  };

  const handlePerformReset = async () => {
    if (!character) return;
    const res = await performHeroReset(character);
    if (res.ok) {
      setCharacter(res.character);
      soundSynth.playLevelUp();
      pushBanner(res.message, '#fbbf24');
    } else {
      pushBanner(res.message, '#f87171');
    }
  };

  const handleUpgradeSkill = async (skillId: string) => {
    if (!character) return;
    const res = await upgradeSkillRank(character, skillId);
    setCharacter(res.character);
    setSkillNotice(res.message);
    soundSynth.playForge(res.ok);
    if (res.ok) {
      await checkAndGrantAchievements(res.character, items, ledger.length, eventHistory.length);
    }
  };

  const handleSelectSpecialization = async (spec: NonNullable<MuCharacter['specialization']>) => {
    if (!character) return;
    const saved = await setCharacterSpecialization(character, spec);
    setCharacter(saved);
    setSkillNotice(`Especialización cambiada a ${spec.toUpperCase()}.`);
    soundSynth.playTradeSync();
  };

  const handleGenerateDuelToken = (transport: TransportMode) => {
    if (!character) return '';
    const challenge = buildAsyncDuelChallenge(character, items, transport);
    return encodeDuelToken(challenge);
  };

  const handlePublishDuelChallenge = async (transport: TransportMode) => {
    if (!character) return;
    const challenge = buildAsyncDuelChallenge(character, items, transport);
    syncRef.current?.sendDuelChallenge(challenge);
    const posted = await cloudSyncManager.publishDuelChallenge(challenge);
    const refreshed = await cloudSyncManager.fetchDuelChallenges();
    if (refreshed.length > 0) setServerChallenges(refreshed);
    else setServerChallenges((prev) => [challenge, ...prev.filter((c) => c.id !== challenge.id)]);
    setSyncMessage(
      posted
        ? `Desafío ${challenge.challengerName} publicado en la red (${transport.toUpperCase()}) y listo para duelos asíncronos.`
        : `Desafío generado offline (${transport.toUpperCase()}). Usa el token MUDUEL1 para compartir por Bluetooth o Wi-Fi.`,
    );
  };

  const handleRefreshDuelChallenges = async () => {
    const list = await cloudSyncManager.fetchDuelChallenges();
    setServerChallenges(list);
    setSyncMessage(`Lista de desafíos actualizada (${list.length} disponibles).`);
  };

  const executeDuelAgainstChallenge = async (opponent: AsyncDuelChallenge, transport: TransportMode) => {
    if (!character) return;
    const myChallenge = buildAsyncDuelChallenge(character, items, transport);
    const result = resolveAsyncDuel(myChallenge, opponent, transport);
    await recordAsyncDuel(result);
    await recordSharedLedger({
      id: `led-duel-${result.id}`,
      sessionId: opponent.id,
      transportMode: transport,
      partnerName: opponent.challengerName,
      role: 'host',
      direction: 'duel_reward',
      itemId: result.id,
      itemName: `${result.won ? 'Victoria' : 'Participación'} (+${result.rewardZen.toLocaleString()} Zen)`,
      itemSnapshotJson: JSON.stringify(result),
      status: 'committed',
      createdAt: result.createdAt,
    });

    const updatedChar = normalizeCharacterRecord(
      await updateCharacter({
        ...character,
        zen: character.zen + result.rewardZen,
        duelWins: (character.duelWins ?? 0) + (result.won ? 1 : 0),
        duelLosses: (character.duelLosses ?? 0) + (result.won ? 0 : 1),
      }),
    );
    setCharacter(updatedChar);
    const [nextDuels, nextLedger] = await Promise.all([getAsyncDuels(), getSharedLedger()]);
    setDuelRecords(nextDuels);
    setLedger(nextLedger);
    setLastDuelResult(result);
    syncRef.current?.sendDuelCompleted(result);
    soundSynth.playForge(result.won);
    setSyncMessage(`${result.summary} · +${result.rewardZen.toLocaleString()} Zen guardado en IndexedDB.`);
    await checkAndGrantAchievements(updatedChar, items, nextLedger.length, eventHistory.length);
  };

  const handleFightAsyncDuelToken = async (token: string, transport: TransportMode) => {
    const parsed = decodeDuelToken(token);
    if (!parsed) {
      setSyncMessage('Token de duelo inválido. Asegúrate de copiar el código completo MUDUEL1:...');
      return;
    }
    await executeDuelAgainstChallenge(parsed, transport);
  };

  const handleBuyShopItem = async (shopItem: ShopItemDef) => {
    if (!character) return;
    const res = await buyShopItem(character, shopItem);
    setCharacter(res.character);
    setItems(res.items);
    setNpcStatusMessage(res.message);
    soundSynth.playForge(res.ok);
  };

  const handleBuyJewel = async (jewel: 'bless' | 'soul' | 'chaos' | 'life' | 'harmony', cost: number) => {
    if (!character) return;
    const res = await buyJewelFromNpc(character, jewel, cost);
    setCharacter(res.character);
    setNpcStatusMessage(res.message);
    soundSynth.playJewelDrop();
  };

  const handleSellItem = async (itemId: string) => {
    if (!character) return;
    const res = await sellInventoryItem(character, itemId);
    setCharacter(res.character);
    setItems(res.items);
    setNpcStatusMessage(res.message);
    soundSynth.playTradeSync();
  };

  const handleChaosMixWing = async (tier: 1 | 2 | 3 | 4) => {
    if (!character) return;
    const res = await executeChaosMixWing(character, tier);
    setCharacter(res.character);
    setItems(res.items);
    setNpcStatusMessage(res.message);
    soundSynth.playForge(res.ok);
  };

  const buildPeerSnapshot = (): RoomPeer => {
    const c = character!;
    const eqWeapon = items.find((i) => i.slot === 'weapon' && i.isEquipped);
    const eqArmor = items.find((i) => i.slot === 'armor' && i.isEquipped);
    return {
      peerId: syncRef.current?.peerId || 'peer-local',
      name: c.name,
      classType: c.classType,
      sex: c.sex ?? 'male',
      currentMapId: c.currentMapId,
      equipment: items.filter(i => i.isEquipped),
      level: c.level,
      role: 'host',
      transport: 'wifi',
      x: 0,
      z: 6,
      rotY: Math.PI,
      action: 'idle',
      equippedSet: eqArmor?.setName || 'Básico',
      equippedWeapon: eqWeapon?.name || 'Espada',
      enhanceLevel: eqWeapon?.enhanceLevel ?? 5,
    };
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0c1018]">
      {engineError && <div role="alert" className="pointer-events-none fixed bottom-2 left-2 right-2 z-50 rounded bg-red-950/95 text-red-100 p-3 text-sm">{engineError}</div>}
      <div ref={canvasMountRef} className={`absolute inset-0 w-full h-full ${screenStage === 'character_select' ? 'realm-canvas' : ''}`} />

      {worldLoading && <div role="status" className="realm-load" style={{backgroundImage: `url(./mugroup/portadas/${loadingScene.art}.webp)`}}>
        <div><small>✧ &nbsp; CRÓNICAS DEL REINO &nbsp; ✧</small><h1>MuGro'up</h1><p>{loadingScene.label}…</p>
        <progress aria-label={loadingScene.label} /></div></div>}
      <OfflineIndicator />
      {worldAdmin && !adminPanelOpen && <button type="button"
        className="fixed z-40 bottom-2 left-2 realm-button px-2 text-xs min-h-[34px]"
        onClick={() => setAdminPanelOpen(true)}>ADMIN</button>}
      {worldAdmin && adminPanelOpen && <WorldAdminPanel initial={worldAdmin.config} session={worldAdmin.session}
        onClose={() => setAdminPanelOpen(false)}
        onPublished={() => { void applyPublishedWorld().catch(console.error); }} />}

      {isPortraitMobile && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg bg-[#161c2a] border border-amber-500/70 px-3 py-1.5 shadow-xl max-w-[94vw]">
          <span className="text-[11px] text-amber-200 whitespace-nowrap">
            Recomendado en Horizontal
          </span>
          <button
            onClick={requestLandscapeFullscreen}
            className="min-h-[30px] px-2.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-[11px] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <RotateCw className="w-3 h-3" />
            Girar
          </button>
        </div>
      )}

      {(screenStage === 'login' || screenStage === 'character_select') && (
        <ClassicLoginFlow
          stage={screenStage}
          accounts={accounts}
          currentAccount={currentAccount}
          characters={characters}
          selectedCharId={character?.id || null}
          syncStatus={syncStatus}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onChangePassword={handleChangePassword}
          onLookupRecoveryQuestions={handleLookupRecoveryQuestions}
          onRecoverAccount={handleRecoverAccount}
          onSelectCharacter={(id) => {
            const found = characters.find((c) => c.id === id);
            if (found) selectAndHydrateCharacter(found);
          }}
          onCreateCharacter={handleCreateCharacter}
          onEnterWorld={handleEnterWorld}
          onLogoutAccount={() => {
            if (worldAdmin) closeWorldAdmin(worldAdmin.session.token);
            setWorldAdmin(null);
            setAdminPanelOpen(false);
            setCurrentAccount(null);
            cloudSyncManager.setActiveAccountId(null);
            engineRef.current?.setMode('title');
            setScreenStage('login');
          }}
          onOpenApkCenter={() => setActiveDrawer('apk')}
          onRotatePreview={dx => engineRef.current?.rotatePreview(dx)}
          onRestore={async () => { await loadAllFromDexie(); }}
          onPreviewClass={(cls, sex, appearanceId) => engineRef.current?.syncHeroAppearance(cls, getStarterItemsForMuClass('preview','Vista previa',cls), sex, appearanceId).catch(console.error)}
        />
      )}

      {(screenStage === 'playing' || screenStage === 'paused') && character && (
        <>
          <MuHudOverlay
            room={roomState && (
            <div className="pointer-events-none flex flex-col items-center gap-1.5">
              <div className="rounded-lg bg-[#0e131d]/92 border border-sky-500/40 px-3 py-1 text-xs font-mono-tabular text-sky-200 flex items-center gap-2">
                {roomState.transport === 'wifi' ? (
                  <Wifi className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                ) : (
                  <Bluetooth className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                )}
                <span>
                  Sala {roomState.code} · {roomState.peers.length} conectados
                </span>
              </div>

              {roomState.activeEvent && (
                <div className="w-[min(340px,70vw)] rounded-lg bg-[#1a1014]/95 border border-rose-500/60 px-3 py-1.5 shadow-xl">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-rose-200">
                    <span className="inline-flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      Jefe · Oleada {roomState.eventWave}
                    </span>
                    <span className="font-mono-tabular">
                      {roomState.bossHp} / {roomState.bossMaxHp}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-all"
                      style={{ width: `${Math.round((roomState.bossHp / roomState.bossMaxHp) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

            banners={banners.length > 0 && <div className="pointer-events-none flex flex-col items-center gap-1">
            {banners.map((b) => (
              <div
                key={b.id}
                style={{ color: b.color }}
                className="px-3 py-1 rounded bg-[#0c1018]/85 text-xs font-bold font-mono-tabular shadow"
              >
                {b.text}
              </div>
            ))}
          </div>}
            character={character}
            comboConfig={comboConfig}
            helperEnabled={helperEnabled}
            onToggleHelper={() => setHelperEnabled(v => !v)}
            comboArmed={comboArmed}
            buttonLayouts={buttonLayouts}
            editMode={editMode}
            measuredFps={measuredFps}
            free3dCamera={gameSettings.free3dCamera}
            autoAimAssist={gameSettings.autoAimAssist ?? true}
            activeEffects={activeEffects}
            targetMonster={targetMonster}
            skillCooldowns={skillCooldowns}
            nearbyNpc={nearbyNpc}
            worldTelemetry={worldTelemetry}
            damageNumbers={damageNumbers}
            syncStatus={syncStatus}
            minimapData={minimapData}
            lootFilters={lootFilters}
            potionConfig={potionConfig}
            onUpdateLootFilters={handleUpdateLootFilters}
            onUpdatePotionConfig={handleUpdatePotionConfig}
            onJoystickVector={(x, y) => engineRef.current?.setJoystickVector(x, y)}
            onPressAttack={handlePressAttack}
            onJump={() => engineRef.current?.jump()}
            onToggleComboArmed={() => {
              setComboArmed(!comboArmed);
              if (!comboArmed) handlePressAttack(true);
            }}
            onCastSkill={handleCastSkill}
            onUpdateComboConfig={handleUpdateComboConfig}
            onHealPotion={handleHealPotion}
            onPickupLoot={() => engineRef.current?.pickupNearestLoot(true, lootFiltersRef.current)}
            onTalkNpc={(npc) => {
              if (npc.warpTarget) { void handleWarpToMap(npc.warpTarget); return; }
              setActiveNpc(npc);
              setNpcStatusMessage(null);
              setActiveDrawer('npc');
            }}
            onOpenInventory={() => setActiveDrawer('inventory')}
            onOpenMapWarp={() => setActiveDrawer('mapWarp')}
            onOpenStats={() => setActiveDrawer('stats')}
            onOpenSync={() => setActiveDrawer('sync')}
            onOpenOracle={() => setActiveDrawer('oracle')}
            updateState={updateState}
            onOpenSettings={() => setActiveDrawer('settings')}
            onUpdateButtonLayouts={handleUpdateButtonLayouts}
            onExitEditMode={() => setEditMode(false)}
          />
        </>
      )}

      {screenStage === 'paused' && !editMode && activeDrawer === 'none' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#111622] border-2 border-amber-700/70 p-6 space-y-3 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-amber-300 text-center">
              Juego en Pausa
            </h2>
            <p className="text-xs text-slate-400 text-center">
              Tu progreso, botones y equipamiento están guardados en este dispositivo. Con conexión al servidor, tu cuenta se sincroniza automáticamente.
            </p>
            <button
              onClick={() => setScreenStage('playing')}
              className="w-full min-h-[44px] rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-sm cursor-pointer"
            >
              Continuar Jugando
            </button>
            <button
              onClick={() => setActiveDrawer('settings')}
              className="w-full min-h-[44px] rounded-lg bg-[#192233] hover:bg-slate-700 text-slate-100 font-semibold text-sm cursor-pointer"
            >
              Ajustes (Brillo, Música, Sonido, 3D)
            </button>
            <button
              onClick={() => {
                engineRef.current?.setMode('character_select');
                setScreenStage('character_select');
              }}
              className="w-full min-h-[44px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm cursor-pointer"
            >
              Cambiar Personaje
            </button>
          </div>
        </div>
      )}

      {character && (
        <>
          <MuInventoryModal
            open={activeDrawer === 'inventory'}
            character={character}
            items={items}
            onClose={() => {
              setActiveDrawer('none');
              setForgeMessage(null);
            }}
            onEquip={handleEquip}
            onUse={handleUsePotion}
            onRepair={async () => { if (!character) return; try { const saved=await repairEquipment(character.id); await selectAndHydrateCharacter(saved); } catch(error) { setForgeMessage(String(error)); } }}
            onUpgrade={handleUpgrade}
            forgeMessage={forgeMessage}
          />

          <MapWarpModal
            open={activeDrawer === 'mapWarp'}
            character={character}
            currentMapId={minimapData?.mapId ?? character.currentMapId}
            onClose={() => setActiveDrawer('none')}
            onWarpToMap={handleWarpToMap}
          />

          <CharacterStatsModal
            open={activeDrawer === 'stats'}
            character={character}
            items={items}
            ledgerCount={ledger.length}
            eventCount={eventHistory.length}
            skillNotice={skillNotice}
            onClose={() => {
              setActiveDrawer('none');
              setSkillNotice(null);
            }}
            onAllocateStat={handleAllocateStat}
            onPerformReset={handlePerformReset}
            onUpgradeSkill={handleUpgradeSkill}
            onSelectSpecialization={handleSelectSpecialization}
          />

          <NpcShopModal
            open={activeDrawer === 'npc'}
            npc={activeNpc}
            character={character}
            items={items}
            statusMessage={npcStatusMessage}
            onClose={() => {
              setActiveDrawer('none');
              setNpcStatusMessage(null);
            }}
            onBuyItem={handleBuyShopItem}
            onBuyJewel={handleBuyJewel}
            onSellItem={handleSellItem}
            onChaosMixWing={handleChaosMixWing}
          />

          <SyncLinkDrawer
            open={activeDrawer === 'sync'}
            character={character}
            items={items}
            localPeerId={syncRef.current?.peerId || 'peer-local'}
            wsConnected={wsConnected}
            roomState={roomState}
            ledger={ledger}
            eventHistory={eventHistory}
            duelRecords={duelRecords}
            serverChallenges={serverChallenges}
            lastDuelResult={lastDuelResult}
            statusMessage={syncMessage}
            onClose={() => setActiveDrawer('none')}
            onCreateRoom={async (evType, trans) => {
              if (!syncRef.current) return;
              await syncRef.current.createRoom(buildPeerSnapshot(), evType, trans);
            }}
            onJoinRoom={async (code, trans) => {
              if (!syncRef.current) return;
              await syncRef.current.joinRoom(code, buildPeerSnapshot(), trans);
            }}
            onStartEvent={(evType) => {
              syncRef.current?.startEvent(evType);
              setActiveDrawer('none');
            }}
            onSendItemToPeer={(targetPeerId, item) => {
              syncRef.current?.sendTradeItem(targetPeerId, item);
            }}
            onEndRoom={() => {
              syncRef.current?.endRoom();
            }}
            onGenerateDuelToken={handleGenerateDuelToken}
            onPublishDuelChallenge={handlePublishDuelChallenge}
            onRefreshDuelChallenges={handleRefreshDuelChallenges}
            onFightAsyncDuelToken={handleFightAsyncDuelToken}
            onFightChallenge={executeDuelAgainstChallenge}
          />

          <OracleChatDrawer
            open={activeDrawer === 'oracle'}
            character={character}
            items={items}
            ledgerCount={ledger.length}
            messages={chatMessages}
            onClose={() => setActiveDrawer('none')}
            onAddMessages={async (u, m) => {
              await saveChatMessage(u);
              await saveChatMessage(m);
              setChatMessages(await getChatHistory());
            }}
          />
        </>
      )}

      <SettingsModal
        open={activeDrawer === 'settings'}
        settings={gameSettings}
        measuredFps={measuredFps}
        onClose={() => setActiveDrawer('none')}
        onUpdateSettings={handleUpdateSettings}
        onEnterButtonEditor={() => setEditMode(true)}
        onRequestLandscapeFullscreen={requestLandscapeFullscreen}
        onSwitchCharacter={() => {
          setActiveDrawer('none');
          engineRef.current?.setMode('character_select');
          setScreenStage('character_select');
        }}
      />

      <ApkSyncDrawer
        open={activeDrawer === 'apk'}
        syncStatus={syncStatus}
        onClose={() => setActiveDrawer('none')}
        onDatabaseImported={async () => {
          await loadAllFromDexie();
        }}
      />
    </div>
  );
}
