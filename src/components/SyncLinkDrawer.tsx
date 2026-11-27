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

const EVENT_LABELS: Record<EventType, string> = {
  blood_castle: 'Blood Castle (Arcángel)',
  chaos_castle: 'Chaos Castle (Supervivencia)',
  kundun_boss: 'Invasión de Kundun',
  free_trade: 'Comercio Libre en Plaza',
};

export const SyncLinkDrawer: React.FC<SyncLinkDrawerProps> = ({
  open,
  character,
  items,
  localPeerId,
  wsConnected,
  roomState,
  ledger,
  eventHistory,
  duelRecords,
  serverChallenges,
  lastDuelResult,
  statusMessage,
  onClose,
  onCreateRoom,
  onJoinRoom,
  onStartEvent,
  onSendItemToPeer,
  onEndRoom,
  onGenerateDuelToken,
  onPublishDuelChallenge,
  onRefreshDuelChallenges,
  onFightAsyncDuelToken,
  onFightChallenge,
}) => {
  const [tab, setTab] = useState<'room' | 'duels' | 'history'>('room');
  const transport: TransportMode = 'wifi';
  const [eventType, setEventType] = useState<EventType>('blood_castle');
  const [joinCode, setJoinCode] = useState('');
  const [selectedTradeItemId, setSelectedTradeItemId] = useState<string>('');
  const [myDuelToken, setMyDuelToken] = useState<string>('');
  const [opponentToken, setOpponentToken] = useState<string>('');
  const [copiedNotice, setCopiedNotice] = useState(false);

  if (!open) return null;

  const tradeableItems = items.filter((i) => !i.isEquipped);
  const chosenTradeItem =
    tradeableItems.find((i) => i.id === selectedTradeItemId) || tradeableItems[0] || null;
  const remotePeers = (roomState?.peers || []).filter((p) => p.peerId !== localPeerId);
  const isHost = roomState?.hostPeerId === localPeerId;

  const handleCopyToken = async () => {
    const token = myDuelToken || onGenerateDuelToken(transport);
    setMyDuelToken(token);
    try {
      await navigator.clipboard.writeText(token);
      setCopiedNotice(true);
      window.setTimeout(() => setCopiedNotice(false), 1800);
    } catch {
      // clipboard fallback ignored
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/80 p-0 md:p-5">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl bg-[#0e131f] border-2 border-sky-700/70 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#131b2b] border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div>
              <h2 className="font-display text-base font-bold text-sky-300">
                Salas locales y duelos asíncronos
              </h2>
              <p className="text-[11px] font-mono-tabular text-slate-400">
                Héroe: {character.name} ({character.classType} Nv.{character.level}) · WebSocket:{' '}
                {wsConnected ? 'Conectado' : 'En espera / Offline'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar Wi-Fi / BT"
            className="min-h-[40px] min-w-[40px] rounded-lg bg-[#1d2538] hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 border-b border-slate-800 bg-[#0a0e17] text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab('room')}
            className={`min-h-[42px] inline-flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'room' ? 'bg-sky-600/20 text-sky-300 border-b-2 border-sky-400' : 'text-slate-400'
            }`}
          >
            <Users className="w-4 h-4" />
            Salas &amp; Comercio
          </button>
          <button
            type="button"
            onClick={() => setTab('duels')}
            className={`min-h-[42px] inline-flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'duels' ? 'bg-rose-600/20 text-rose-300 border-b-2 border-rose-400' : 'text-slate-400'
            }`}
          >
            <Swords className="w-4 h-4" />
            Duelos Asíncronos ({duelRecords.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`min-h-[42px] inline-flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'history' ? 'bg-amber-600/20 text-amber-300 border-b-2 border-amber-400' : 'text-slate-400'
            }`}
          >
            <History className="w-4 h-4" />
            Historial ({ledger.length})
          </button>
        </div>

        {statusMessage && (
          <div className="px-5 py-2.5 bg-sky-950/75 border-b border-sky-500/35 text-xs text-sky-200">
            {statusMessage}
          </div>
        )}

        <div className="flex-1 overflow-y-auto mu-scroll p-4 sm:p-5 space-y-4">

          {tab === 'room' && <p className="text-sm text-slate-300 flex gap-2"><Wifi size={16}/> Wi-Fi local: abre el juego desde el mismo servidor en ambos dispositivos.</p>}
          {tab === 'room' && (
            <div className="space-y-4">
              {!roomState ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-[#131a2a] border border-slate-800 space-y-3">
                    <h3 className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
                      <PlusCircle className="w-4 h-4" />
                      Crear Sala Cooperativa
                    </h3>
                    <label className="block text-xs text-slate-300">
                      Modo de Evento
                      <select
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value as EventType)}
                        className="mt-1 w-full min-h-[40px] rounded-lg bg-[#090d16] border border-slate-700 px-3 text-xs text-slate-100"
                      >
                        {(Object.keys(EVENT_LABELS) as EventType[]).map((k) => (
                          <option key={k} value={k}>
                            {EVENT_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => void onCreateRoom(eventType, transport)}
                      className="w-full min-h-[42px] rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      Abrir Sala {transport.toUpperCase()}
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-[#131a2a] border border-slate-800 space-y-3">
                    <h3 className="text-sm font-bold text-sky-300 flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      Unirse con Código de Sala
                    </h3>
                    <label className="block text-xs text-slate-300">
                      Código (ej. MU-4X9K)
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="MU-XXXX"
                        className="mt-1 w-full min-h-[40px] rounded-lg bg-[#090d16] border border-slate-700 px-3 text-xs font-mono-tabular text-slate-100"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!joinCode.trim()}
                      onClick={() => void onJoinRoom(joinCode, transport)}
                      className="w-full min-h-[42px] rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold text-xs cursor-pointer"
                    >
                      Entrar a Sala
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#121a2a] border border-sky-500/45 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="text-sm font-bold text-sky-300 font-mono-tabular">
                        Sala Activa: {roomState.code} · {EVENT_LABELS[roomState.eventType]}
                      </div>
                      <div className="text-xs text-slate-400">
                        Anfitrión: {roomState.hostName} · {roomState.peers.length} jugador(es) conectado(s)
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isHost && (
                        <button
                          type="button"
                          onClick={() => onStartEvent(eventType)}
                          className="min-h-[38px] px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Flame className="w-3.5 h-3.5" />
                          Iniciar Evento 3D
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onEndRoom}
                        className="min-h-[38px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        {isHost ? 'Cerrar Sala' : 'Salir'}
                      </button>
                    </div>
                  </div>

                  {/* Connected Peers & Direct Trade */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-300">
                      Aliados en Sala &amp; Envío de Ítems (IndexedDB)
                    </div>
                    {remotePeers.length === 0 ? (
                      <div className="p-3 rounded-lg bg-[#0b0f18] border border-slate-800 text-xs text-slate-400">
                        Esperando que otro jugador se una con el código <strong className="text-amber-300">{roomState.code}</strong>.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {tradeableItems.length > 0 && (
                          <select
                            value={chosenTradeItem?.id || ''}
                            onChange={(e) => setSelectedTradeItemId(e.target.value)}
                            className="w-full min-h-[38px] rounded-lg bg-[#090d16] border border-slate-700 px-3 text-xs text-slate-100"
                          >
                            {tradeableItems.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name} +{it.enhanceLevel} ({it.rarity})
                              </option>
                            ))}
                          </select>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {remotePeers.map((peer) => (
                            <div
                              key={peer.peerId}
                              className="p-2.5 rounded-lg bg-[#0b101b] border border-slate-800 flex items-center justify-between gap-2"
                            >
                              <div>
                                <div className="text-xs font-bold text-slate-100">
                                  {peer.name} ({peer.classType} Nv.{peer.level})
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {peer.equippedWeapon} +{peer.enhanceLevel}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={!chosenTradeItem}
                                onClick={() => chosenTradeItem && onSendItemToPeer(peer.peerId, chosenTradeItem)}
                                className="min-h-[34px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-slate-950 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Send className="w-3 h-3" />
                                Enviar Ítem
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'duels' && (
            <div className="space-y-4">
              {lastDuelResult && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    lastDuelResult.won
                      ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
                      : 'bg-rose-950/60 border-rose-500/60 text-rose-200'
                  }`}
                >
                  <div className="font-bold">{lastDuelResult.summary}</div>
                  <div className="font-mono-tabular mt-0.5">
                    Poder: {lastDuelResult.myPowerScore} vs {lastDuelResult.opponentPowerScore} · Recompensa: +
                    {lastDuelResult.rewardZen.toLocaleString()} Zen
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#131a2a] border border-slate-800 space-y-2.5">
                  <div className="text-xs font-bold text-amber-300">
                    1. Tu Token de Desafío (MUDUEL1)
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Comparte este código por Bluetooth/WhatsApp o publícalo en la red local para que otros combatan contra tu héroe.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMyDuelToken(onGenerateDuelToken(transport))}
                      className="flex-1 min-h-[38px] px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      Generar Token
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyToken}
                      className="min-h-[38px] px-3 rounded-lg bg-[#1d263b] hover:bg-slate-700 text-amber-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedNotice ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  {myDuelToken && (
                    <textarea
                      readOnly
                      value={myDuelToken}
                      rows={3}
                      className="w-full rounded-lg bg-[#080c15] border border-slate-700 p-2 text-[10px] font-mono-tabular text-amber-200"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void onPublishDuelChallenge(transport)}
                    className="w-full min-h-[38px] rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Publicar Desafío en Servidor ({transport.toUpperCase()})
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-[#131a2a] border border-slate-800 space-y-2.5">
                  <div className="text-xs font-bold text-sky-300">
                    2. Retar con Token de Rival (Offline)
                  </div>
                  <textarea
                    value={opponentToken}
                    onChange={(e) => setOpponentToken(e.target.value)}
                    placeholder="Pega aquí el token MUDUEL1:... del rival"
                    rows={3}
                    className="w-full rounded-lg bg-[#080c15] border border-slate-700 p-2 text-[11px] font-mono-tabular text-slate-100"
                  />
                  <button
                    type="button"
                    disabled={!opponentToken.trim()}
                    onClick={() => void onFightAsyncDuelToken(opponentToken, transport)}
                    className="w-full min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Swords className="w-4 h-4" />
                    Iniciar Duelo Asíncrono
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#131a2a] border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Desafíos Disponibles ({serverChallenges.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => void onRefreshDuelChallenges()}
                    className="text-xs text-sky-300 hover:text-sky-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Actualizar
                  </button>
                </div>
                {serverChallenges.length === 0 ? (
                  <div className="text-xs text-slate-400">
                    No hay desafíos publicados aún. Publica el tuyo o pega un token MUDUEL1 arriba.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {serverChallenges.map((ch) => (
                      <div
                        key={ch.id}
                        className="p-2.5 rounded-lg bg-[#0a0f1a] border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-100">
                            {ch.challengerName} ({ch.classType} Nv.{ch.level})
                          </div>
                          <div className="text-[11px] font-mono-tabular text-amber-300">
                            Poder: {ch.powerScore} · {ch.equippedSummary}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onFightChallenge(ch, transport)}
                          className="min-h-[34px] px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                        >
                          Retar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#131a2a] border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-amber-300">
                  Registro de Intercambios y Recompensas ({ledger.length})
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto mu-scroll">
                  {ledger.length === 0 ? (
                    <div className="text-xs text-slate-400">Sin movimientos registrados todavía.</div>
                  ) : (
                    ledger.map((entry) => (
                      <div key={entry.id} className="p-2 rounded-lg bg-[#0a0f1a] border border-slate-800 text-[11px]">
                        <div className="font-semibold text-slate-100">{entry.itemName}</div>
                        <div className="text-slate-400 font-mono-tabular">
                          {entry.direction.toUpperCase()} · {entry.partnerName} · {entry.transportMode.toUpperCase()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#131a2a] border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-sky-300">
                  Eventos Cooperativos ({eventHistory.length})
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto mu-scroll">
                  {eventHistory.length === 0 ? (
                    <div className="text-xs text-slate-400">Sin eventos cooperativos jugados todavía.</div>
                  ) : (
                    eventHistory.map((ev) => (
                      <div key={ev.id} className="p-2 rounded-lg bg-[#0a0f1a] border border-slate-800 text-[11px]">
                        <div className="font-semibold text-slate-100">
                          {ev.sessionCode} · {EVENT_LABELS[ev.eventType]}
                        </div>
                        <div className="text-slate-400">{ev.lootSummary}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
