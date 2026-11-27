import type {
  AsyncDuelChallenge,
  AsyncDuelRecord,
  EventType,
  MuItem,
  RoomPeer,
  RoomState,
  TransportMode,
} from '../types/game';

export interface TradeTransferPayload {
  tradeId: string;
  fromPeerName: string;
  fromRole: 'host' | 'guest';
  toPeerName: string;
  toRole: 'host' | 'guest';
  transport: TransportMode;
  sessionCode: string;
  item: MuItem;
  timestamp: string;
}

export interface EventRewardPayload {
  itemName: string;
  zenBonus: number;
  blessBonus: number;
  soulBonus: number;
  eventType: EventType;
  wave: number;
}

export interface LocalSyncCallbacks {
  onConnectionChange?: (connected: boolean) => void;
  onRoomState?: (room: RoomState) => void;
  onPeerMoved?: (peer: RoomPeer) => void;
  onBossHp?: (bossHp: number, bossMaxHp: number) => void;
  onEventCompleted?: (room: RoomState, reward: EventRewardPayload) => void;
  onTradeReceived?: (payload: TradeTransferPayload) => void;
  onTradeConfirmed?: (payload: TradeTransferPayload) => void;
  onDuelChallenge?: (payload: { fromPeerName: string; challenge: AsyncDuelChallenge }) => void;
  onDuelCompleted?: (payload: { record: AsyncDuelRecord }) => void;
  onRoomEnded?: (message: string) => void;
  onError?: (message: string) => void;
  onStatus?: (message: string) => void;
}

export class LocalSyncManager {
  public readonly peerId: string;
  private callbacks: LocalSyncCallbacks;
  private ws: WebSocket | null = null;
  private connectPromise: Promise<boolean> | null = null;

  constructor(callbacks: LocalSyncCallbacks) {
    this.callbacks = callbacks;
    this.peerId = `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  private getWsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  private ensureConnected(): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(true);
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<boolean>((resolve) => {
      try {
        const ws = new WebSocket(this.getWsUrl());
        const timeout = window.setTimeout(() => {
          resolve(false);
          this.connectPromise = null;
        }, 3500);

        ws.onopen = () => {
          window.clearTimeout(timeout);
          this.ws = ws;
          this.callbacks.onConnectionChange?.(true);
          this.connectPromise = null;
          resolve(true);
        };

        ws.onmessage = (event) => {
          this.handleMessage(String(event.data));
        };

        ws.onerror = () => {
          window.clearTimeout(timeout);
          this.callbacks.onConnectionChange?.(false);
          this.connectPromise = null;
          resolve(false);
        };

        ws.onclose = () => {
          if (this.ws === ws) {
            this.ws = null;
          }
          this.callbacks.onConnectionChange?.(false);
          this.connectPromise = null;
        };
      } catch {
        this.connectPromise = null;
        resolve(false);
      }
    });

    return this.connectPromise;
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as { type: string; [key: string]: unknown };
      if (msg.type === 'room:state' && msg.room) {
        this.callbacks.onRoomState?.(msg.room as RoomState);
      } else if (msg.type === 'peer:moved' && msg.peer) {
        this.callbacks.onPeerMoved?.(msg.peer as RoomPeer);
      } else if (msg.type === 'event:boss_hp') {
        this.callbacks.onBossHp?.(Number(msg.bossHp) || 0, Number(msg.bossMaxHp) || 1);
      } else if (msg.type === 'event:completed' && msg.room && msg.reward) {
        this.callbacks.onEventCompleted?.(msg.room as RoomState, msg.reward as EventRewardPayload);
      } else if (msg.type === 'trade:received') {
        this.callbacks.onTradeReceived?.(msg as unknown as TradeTransferPayload);
      } else if (msg.type === 'trade:confirmed') {
        this.callbacks.onTradeConfirmed?.(msg as unknown as TradeTransferPayload);
      } else if (msg.type === 'duel:challenge' && msg.challenge) {
        this.callbacks.onDuelChallenge?.({
          fromPeerName: String(msg.fromPeerName || 'Rival'),
          challenge: msg.challenge as AsyncDuelChallenge,
        });
      } else if (msg.type === 'duel:completed' && msg.record) {
        this.callbacks.onDuelCompleted?.({ record: msg.record as AsyncDuelRecord });
      } else if (msg.type === 'room:ended') {
        this.callbacks.onRoomEnded?.(String(msg.message || 'Sala finalizada.'));
      } else if (msg.type === 'room:error') {
        this.callbacks.onError?.(String(msg.message || 'Error en la sala local.'));
      }
    } catch {
      // ignore malformed messages
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public async createRoom(peer: RoomPeer, eventType: EventType, transport: TransportMode): Promise<void> {
    const message = { type: 'room:create', peer: { ...peer, peerId: this.peerId }, eventType, transport };
    if (transport !== 'wifi') {
      this.callbacks.onError?.('Las salas web requieren Wi-Fi.');
      return;
    }
    const ok = await this.ensureConnected();
    if (!ok) {
      this.callbacks.onError?.('No hay servidor WebSocket local activo (/ws). Usa tokens MUDUEL1 para jugar offline.');
      return;
    }
    this.send(message);
    this.callbacks.onStatus?.('Cuando aparezca el código, compártelo con los invitados.');
  }

  public async joinRoom(code: string, peer: RoomPeer, transport: TransportMode): Promise<void> {
    const message = { type: 'room:join', code: code.trim().toUpperCase(), peer: { ...peer, peerId: this.peerId }, transport };
    if (transport !== 'wifi') {
      this.callbacks.onError?.('Las salas web requieren Wi-Fi.');
      return;
    }
    const ok = await this.ensureConnected();
    if (!ok) {
      this.callbacks.onError?.('No se pudo conectar al servidor WebSocket local.');
      return;
    }
    this.send(message);
  }

  public sendPeerUpdate(patch: Partial<RoomPeer>): void {
    this.send({ type: 'peer:update', patch });
  }

  public startEvent(eventType: EventType): void {
    this.send({ type: 'event:start', eventType });
  }

  public damageBoss(damage: number, attackerName: string): void {
    this.send({ type: 'event:damage_boss', damage, attackerName });
  }

  public acknowledgeTrade(tradeId: string): void {
    this.send({ type: 'trade:saved', tradeId });
  }

  public sendTradeItem(targetPeerId: string, item: MuItem): void {
    this.send({ type: 'trade:send_item', targetPeerId, item });
  }

  public sendDuelChallenge(challenge: AsyncDuelChallenge): void {
    this.send({ type: 'duel:challenge', challenge });
  }

  public sendDuelCompleted(record: AsyncDuelRecord): void {
    this.send({ type: 'duel:completed', record });
  }

  public endRoom(): void {
    this.send({ type: 'room:end' });
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.onConnectionChange?.(false);
  }
}
