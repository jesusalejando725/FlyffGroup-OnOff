import React, { useState } from 'react';
import {
  Copy,
  Flame,
  History,
  LogOut,
  PlusCircle,
  RefreshCw,
  Send,
  Swords,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import type {
  AsyncDuelChallenge,
  AsyncDuelRecord,
  EventSessionRecord,
  EventType,
  MuCharacter,
  MuItem,
  RoomState,
  SharedLedgerEntry,
  TransportMode,
} from '../types/game';

interface SyncLinkDrawerProps {
  open: boolean;
  character: MuCharacter;
  items: MuItem[];
  localPeerId: string;
  wsConnected: boolean;
  roomState: RoomState | null;
  ledger: SharedLedgerEntry[];
  eventHistory: EventSessionRecord[];
  duelRecords: AsyncDuelRecord[];
  serverChallenges: AsyncDuelChallenge[];
  lastDuelResult: AsyncDuelRecord | null;
  statusMessage: string | null;
  onClose: () => void;
  onCreateRoom: (eventType: EventType, transport: TransportMode) => Promise<void>;
  onJoinRoom: (code: string, transport: TransportMode) => Promise<void>;
  onStartEvent: (eventType: EventType) => void;
  onSendItemToPeer: (targetPeerId: string, item: MuItem) => void;
  onEndRoom: () => void;
  onGenerateDuelToken: (transport: TransportMode) => string;
  onPublishDuelChallenge: (transport: TransportMode) => Promise<void>;
  onRefreshDuelChallenges: () => Promise<void>;
  onFightAsyncDuelToken: (token: string, transport: TransportMode) => Promise<void>;
  onFightChallenge: (opponent: AsyncDuelChallenge, transport: TransportMode) => Promise<void>;
}

export function SyncLinkDrawer({open,items,character,roomState,localPeerId,statusMessage,onClose,onCreateRoom,onJoinRoom,onEndRoom,onSendItemToPeer}:SyncLinkDrawerProps) {
  const [code,setCode]=useState(''), [itemId,setItemId]=useState('');
  if (!open) return null;
  const bag=items.filter(i=>!i.isEquipped), item=bag.find(i=>i.id===itemId) ?? bag[0];
  return <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"><section role="dialog" aria-label="Invitación local" className="w-full max-w-md max-h-[90vh] overflow-auto space-y-4 rounded-xl border border-amber-700 bg-stone-900 p-5 text-stone-100">
    <header className="flex justify-between"><h2>Invitación local</h2><button aria-label="Cerrar" onClick={onClose}><X/></button></header>
    {!roomState ? <>
      <p>Abre el mismo servidor en ambos dispositivos por Wi-Fi o por una red compartida mediante Bluetooth.</p>
      <button className="rounded bg-amber-700 p-2" onClick={()=>void onCreateRoom('free_trade','wifi')}>Generar invitación</button>
      <label className="block">Código de 32 dígitos<input className="block w-full bg-stone-800 p-2" inputMode="numeric" maxLength={32} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>
      <button disabled={code.length!==32} className="rounded bg-sky-700 p-2 disabled:opacity-40" onClick={()=>void onJoinRoom(code,'wifi')}>Unirse con código</button>
    </> : <><p>{roomState.hostName} · {roomState.peers.length}/32 {roomState.peers.length>1 && '· EXP ×2'}</p><code className="block break-all select-all">{roomState.code}</code>
      <button onClick={onEndRoom}>{roomState.hostPeerId===localPeerId?'Cerrar invitación':'Salir del grupo'}</button>
      {roomState.peers.length>1 && <><label className="block">Intercambiar objeto<select className="block bg-stone-800" value={item?.id||''} onChange={e=>setItemId(e.target.value)}>{bag.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
      {roomState.peers.filter(p=>p.peerId!==localPeerId).map(p=><button key={p.peerId} disabled={!item} onClick={()=>item && onSendItemToPeer(p.peerId,item)}>Enviar a {p.name}</button>)}</>}
    </>}{statusMessage && <p role="status">{statusMessage}</p>}</section></div>;
}
