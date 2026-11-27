import type { AsyncDuelChallenge, AsyncDuelRecord, EventType, MuItem, RoomPeer, RoomState, SharedLedgerEntry, TransportMode } from '../types/game.ts';

export interface RoomConnection {
  send(message: string): void;
  isOpen(): boolean;
  onMessage(handler: (message: string) => void): void;
  onClose(handler: () => void): void;
}

interface ServerRoom {
  code: string;
  eventType: EventType;
  hostPeerId: string;
  hostName: string;
  transport: TransportMode;
  activeEvent: boolean;
  eventWave: number;
  bossHp: number;
  bossMaxHp: number;
  peers: Map<string, { peer: RoomPeer; ws: RoomConnection }>;
  sharedFeed: SharedLedgerEntry[];
  pendingTrades: Map<string,{ sender: string; recipient: string; item: MuItem; entry: SharedLedgerEntry }>;
  tradedItems: Set<string>;
  createdAt: number;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `MU-${suffix}`;
}

function serializeRoom(room: ServerRoom): RoomState {
  return {
    code: room.code,
    eventType: room.eventType,
    hostPeerId: room.hostPeerId,
    hostName: room.hostName,
    transport: room.transport,
    activeEvent: room.activeEvent,
    eventWave: room.eventWave,
    bossHp: room.bossHp,
    bossMaxHp: room.bossMaxHp,
    peers: Array.from(room.peers.values()).map((entry) => entry.peer),
    sharedFeed: room.sharedFeed.slice(-30),
  };
}

function broadcastRoom(room: ServerRoom, payload: Record<string, unknown>, excludePeerId?: string) {
  const message = JSON.stringify(payload);
  for (const [peerId, entry] of room.peers.entries()) {
    if (excludePeerId && peerId === excludePeerId) continue;
    if (entry.ws.isOpen()) {
      entry.ws.send(message);
    }
  }
}

export function createRoomHub(options: {
  transport?: TransportMode;
  onChallenge?: (challenge: AsyncDuelChallenge) => void;
  onDuel?: (record: AsyncDuelRecord) => void;
} = {}) {
  const rooms = new Map<string, ServerRoom>();
  function attach(ws: RoomConnection, allowCreate = true) {
    let currentRoomCode: string | null = null;
    let currentPeerId: string | null = null;

    ws.onMessage(raw => {
      try {
        const msg = JSON.parse(raw) as {
          type: string;
          [key: string]: unknown;
        };

        if (msg.type === 'room:create') {
          if (!allowCreate) return;
          const peer = msg.peer as RoomPeer;
          if (currentRoomCode && currentPeerId && rooms.get(currentRoomCode)?.peers.get(currentPeerId)?.ws === ws) return;
          if (!peer || typeof peer.peerId !== 'string' || !peer.peerId || typeof peer.name !== 'string') return;
          const eventType = (msg.eventType as EventType) || 'blood_castle';
          const transport = options.transport || (msg.transport as TransportMode) || 'wifi';
          let code = (msg.preferredCode as string) || generateRoomCode();
          while (rooms.has(code)) {
            code = generateRoomCode();
          }

          const room: ServerRoom = {
            code,
            eventType,
            hostPeerId: peer.peerId,
            hostName: peer.name,
            transport,
            activeEvent: false,
            eventWave: 1,
            bossHp: 1200,
            bossMaxHp: 1200,
            peers: new Map(),
            sharedFeed: [],
            pendingTrades: new Map(),
            tradedItems: new Set(),
            createdAt: Date.now(),
          };
          const hostPeer: RoomPeer = { ...peer, role: 'host', transport };
          room.peers.set(peer.peerId, { peer: hostPeer, ws });
          rooms.set(code, room);

          currentRoomCode = code;
          currentPeerId = peer.peerId;

          ws.send(JSON.stringify({ type: 'room:state', room: serializeRoom(room) }));
          return;
        }

        if (msg.type === 'room:join') {
          const code = String(msg.code || '').trim().toUpperCase();
          const peer = msg.peer as RoomPeer;
          if (currentRoomCode && currentPeerId && rooms.get(currentRoomCode)?.peers.get(currentPeerId)?.ws === ws) return;
          if (!peer || typeof peer.peerId !== 'string' || !peer.peerId || typeof peer.name !== 'string') return;
          const transport = options.transport || (msg.transport as TransportMode) || 'wifi';
          const room = rooms.get(code);
          if (!room || room.peers.has(peer.peerId) || (options.transport && room.peers.size >= 8)) {
            ws.send(
              JSON.stringify({
                type: 'room:error',
                message: `No se encontró la sala "${code}". Verifica el código con el patrocinador.`,
              }),
            );
            return;
          }

          const guestPeer: RoomPeer = { ...peer, role: 'guest', transport };
          room.peers.set(peer.peerId, { peer: guestPeer, ws });
          currentRoomCode = code;
          currentPeerId = peer.peerId;

          broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
          return;
        }

        if (!currentRoomCode || !currentPeerId) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.peers.get(currentPeerId)?.ws !== ws) return;

        if (msg.type === 'peer:update') {
          const entry = room.peers.get(currentPeerId);
          if (!entry) return;
          const patch = msg.patch as Partial<RoomPeer>;
          entry.peer = { ...entry.peer, ...patch, peerId: currentPeerId, role: entry.peer.role, transport: entry.peer.transport };
          broadcastRoom(
            room,
            { type: 'peer:moved', peer: entry.peer },
            currentPeerId,
          );
          return;
        }

        if (msg.type === 'event:start') {
          const eventType = (msg.eventType as EventType) || room.eventType;
          room.eventType = eventType;
          room.activeEvent = true;
          room.eventWave = 1;
          room.bossMaxHp = eventType === 'kundun_boss' ? 2400 : 1400;
          room.bossHp = room.bossMaxHp;
          broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
          return;
        }

        if (msg.type === 'event:damage_boss') {
          if (!room.activeEvent) return;
          const dmg = Math.max(10, Math.min(500, Number(msg.damage) || 50));
          room.bossHp = Math.max(0, room.bossHp - dmg);
          if (room.bossHp <= 0) {
            const rewardNames: Record<EventType, string> = {
              blood_castle: 'Espada del Arcángel Bendita',
              chaos_castle: 'Coraza del Caos Antigua',
              kundun_boss: 'Báculo de Kundun Supremo',
              free_trade: "Alas de MuGro-up' Doradas",
            };
            const rewardId = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const rewardItemName = rewardNames[room.eventType];
            const rewardEntry: SharedLedgerEntry = {
              id: `led-${Date.now()}`,
              sessionId: room.code,
              transportMode: room.transport,
              partnerName: room.hostName,
              role: 'guest',
              direction: 'event_reward',
              itemId: rewardId,
              itemName: rewardItemName,
              itemSnapshotJson: JSON.stringify({
                name: rewardItemName,
                enhanceLevel: 7,
                rarity: 'excellent',
              }),
              status: 'committed',
              createdAt: new Date().toISOString(),
            };
            room.sharedFeed.push(rewardEntry);
            room.eventWave += 1;
            room.activeEvent = false;
            broadcastRoom(room, {
              type: 'event:completed',
              room: serializeRoom(room),
              reward: {
                itemName: rewardItemName,
                zenBonus: 45000,
                blessBonus: 2,
                soulBonus: 2,
                eventType: room.eventType,
                wave: room.eventWave - 1,
              },
            });
          } else {
            broadcastRoom(room, {
              type: 'event:boss_hp',
              bossHp: room.bossHp,
              bossMaxHp: room.bossMaxHp,
              attackerName: String(msg.attackerName || 'Aliado'),
              damage: dmg,
            });
          }
          return;
        }

        if (msg.type === 'trade:send_item') {
          const item = msg.item as MuItem;
          const targetPeerId = String(msg.targetPeerId || '');
          const fromPeer = room.peers.get(currentPeerId)?.peer;
          const targetEntry = room.peers.get(targetPeerId);
          if (!fromPeer || !targetEntry || !item?.id || targetPeerId === currentPeerId) return;
          if (!targetEntry.ws.isOpen()) {
            ws.send(JSON.stringify({ type:'room:error',message:'El invitado se desconectó. El ítem sigue en tu inventario.' }));
            return;
          }

          const key = `${currentPeerId}:${item.id}`;
          if (room.tradedItems.has(key)) return;
          const pending = [...room.pendingTrades.values()].find(offer => offer.sender === currentPeerId && offer.item.id === item.id);
          if (pending && pending.recipient !== targetPeerId) return;
          if (!pending && room.pendingTrades.size >= 64) {
            ws.send(JSON.stringify({ type:'room:error',message:'Hay demasiados intercambios pendientes.' }));
            return;
          }
          const entry: SharedLedgerEntry = pending?.entry ?? {
            id: `trd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            sessionId: room.code, transportMode: room.transport,
            partnerName: `${fromPeer.name} → ${targetEntry.peer.name}`, role:fromPeer.role,
            direction:'sent',itemId:item.id,itemName:`${item.name} +${item.enhanceLevel}`,
            itemSnapshotJson:JSON.stringify(item),status:'committed',createdAt:new Date().toISOString(),
          };
          const offer = pending ?? { sender:currentPeerId,recipient:targetPeerId,item,entry };
          room.pendingTrades.set(entry.id,offer);
          targetEntry.ws.send(JSON.stringify({
            type:'trade:received',tradeId:entry.id,fromPeerName:fromPeer.name,fromRole:fromPeer.role,
            transport:room.transport,sessionCode:room.code,item:offer.item,timestamp:entry.createdAt,
          }));
          return;
        }

        if (msg.type === 'trade:saved') {
          const tradeId = String(msg.tradeId ?? '');
          const offer = room.pendingTrades.get(tradeId);
          if (!offer || offer.recipient !== currentPeerId) return;
          const from = room.peers.get(offer.sender), to = room.peers.get(offer.recipient);
          if (!from || !to || !from.ws.isOpen()) return;
          room.pendingTrades.delete(tradeId);
          room.tradedItems.add(`${offer.sender}:${offer.item.id}`);
          room.sharedFeed.push(offer.entry);
          from.ws.send(JSON.stringify({
            type:'trade:confirmed',tradeId,toPeerName:to.peer.name,toRole:to.peer.role,
            transport:room.transport,sessionCode:room.code,item:offer.item,timestamp:offer.entry.createdAt,
          }));
          broadcastRoom(room, { type:'room:state',room:serializeRoom(room) });
          return;
        }

        if (msg.type === 'duel:challenge') {
          const challenge = msg.challenge as AsyncDuelChallenge;
          const fromPeer = room.peers.get(currentPeerId)?.peer;
          if (!challenge || !fromPeer) return;
          options.onChallenge?.(challenge);
          broadcastRoom(
            room,
            { type: 'duel:challenge', fromPeerName: fromPeer.name, challenge },
            currentPeerId,
          );
          return;
        }

        if (msg.type === 'duel:completed') {
          const record = msg.record as AsyncDuelRecord;
          if (!record) return;
          options.onDuel?.(record);
          broadcastRoom(room, { type: 'duel:completed', record }, currentPeerId);
          return;
        }

        if (msg.type === 'buff:share') {
          const fromPeer = room.peers.get(currentPeerId)?.peer;
          const effect = msg.effect as Record<string, unknown> | undefined;
          if (!fromPeer || !effect) return;
          broadcastRoom(
            room,
            { type: 'buff:shared', fromPeerName: fromPeer.name, effect },
            currentPeerId,
          );
          return;
        }

        if (msg.type === 'room:end') {
          if (room.hostPeerId === currentPeerId) {
            broadcastRoom(room, {
              type: 'room:ended',
              code: room.code,
              message:
                'Invitación finalizada con éxito. Todos los ítems intercambiados, duelos y recompensas permanecen guardados de forma segura en tu IndexedDB local y listos para sincronizarse.',
            });
            rooms.delete(room.code);
          } else {
            room.peers.delete(currentPeerId);
            broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
          }
          currentRoomCode = null;
        }
      } catch (err) {
        console.error('Room message error:', err);
      }
    });

    ws.onClose(() => {
      if (!currentRoomCode || !currentPeerId) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.peers.get(currentPeerId)?.ws !== ws) return;
      room.peers.delete(currentPeerId);
      if (room.peers.size === 0) {
        rooms.delete(currentRoomCode);
      } else {
        if (room.hostPeerId === currentPeerId) {
          const nextHost = room.peers.values().next().value;
          if (nextHost) {
            nextHost.peer.role = 'host';
            room.hostPeerId = nextHost.peer.peerId;
            room.hostName = nextHost.peer.name;
          }
        }
        broadcastRoom(room, { type: 'room:state', room: serializeRoom(room) });
      }
    });
  }
  return {
    attach,
    listRooms: () => [...rooms.values()].map(room => ({
      code: room.code,
      eventType: room.eventType,
      hostName: room.hostName,
      transport: room.transport,
      activeEvent: room.activeEvent,
      peerCount: room.peers.size,
    })),
  };
}
