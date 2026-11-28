import { applyWebOtaUpdate } from '../services/githubOtaService';
import { cloudSyncManager } from '../services/cloudSyncManager';
import React, { useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';
import {
  generateOfflineBuildAnalysis,
  generateOfflineOracleReply,
} from '../services/offlineOracle';
import type {
  BuildAnalysisResult,
  ChatMessageRecord,
  MuCharacter,
  MuItem,
} from '../types/game';

interface OracleChatDrawerProps {
  open: boolean;
  character: MuCharacter;
  items: MuItem[];
  ledgerCount: number;
  messages: ChatMessageRecord[];
  onClose: () => void;
  onAddMessages: (userMsg: ChatMessageRecord, modelMsg: ChatMessageRecord) => void;
}

export const OracleChatDrawer: React.FC<OracleChatDrawerProps> = ({
  open,
  character,
  items,
  ledgerCount,
  messages,
  onClose,
  onAddMessages,
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<BuildAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError(null);
    setLoading(true);

    const equippedItems = items
      .filter((i) => i.isEquipped)
      .map((i) => `${i.name} +${i.enhanceLevel}`);
    const playerContext = {
      name: character.name,
      classType: character.classType,
      level: character.level,
      zen: character.zen,
      bless: character.bless,
      soul: character.soul,
      equippedItems,
      sharedCount: ledgerCount,
    };

    try {
      let reply: string | null = null;
      if (/actualiz|\bversión\b/i.test(text)) {
        const checked = await applyWebOtaUpdate();
        reply = checked ? 'Pedí al navegador que busque una actualización de esta instalación.' :
          'Conecta a internet y abre la versión publicada para buscar actualizaciones.';
      } else if (/sincroniz|respaldo|copia privada/i.test(text)) {
        reply = (await cloudSyncManager.syncNow()).message;
      }
      if (!reply && navigator.onLine) {
        try {
          const res = await fetch('/api/gemini/chat', {
            method: 'POST',
            signal: AbortSignal.timeout(5000),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              history: messages.map((m) => ({ role: m.role, content: m.content })),
              message: text,
              playerContext,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.reply) reply = String(data.reply);
          }
        } catch {
          // Offline / static host fallback below
        }
      }

      if (!reply) {
        reply = generateOfflineOracleReply(text, playerContext);
      }

      const now = new Date().toISOString();
      onAddMessages(
        { id: `u-${Date.now()}`, role: 'user', content: text, createdAt: now },
        { id: `m-${Date.now() + 1}`, role: 'model', content: reply, createdAt: now },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error consultando el Oráculo.');
    } finally {
      setLoading(false);
    }
  };

  const runBuildAnalysis = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      let result: BuildAnalysisResult | null = null;
      if (navigator.onLine) {
        try {
          const res = await fetch('/api/gemini/analyze-build', {
            method: 'POST',
            signal: AbortSignal.timeout(5000),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ character, items, ledgerCount }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.analysis) result = data.analysis as BuildAnalysisResult;
          }
        } catch {
          // Offline fallback below
        }
      }
      setAnalysis(result || generateOfflineBuildAnalysis(character, items, ledgerCount));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error analizando build.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/75 p-0 md:p-6">
      <div className="w-full max-w-3xl h-[88vh] flex flex-col rounded-t-2xl md:rounded-2xl bg-[#111622] border border-slate-700/80 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-amber-300">
                Oráculo de MuGro-up&apos; (IA + Offline)
              </h2>
              <p className="text-xs text-slate-400">
                Asesor táctico de builds, forja +15 y estrategia cooperativa · Funciona Offline e Online
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar Oráculo"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#1a2233] hover:bg-slate-700 text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Intelligent Build Analyzer Strip */}
        <div className="px-5 py-3 bg-[#0d111a] border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs text-slate-300">
            Analiza tu equipo IndexedDB actual ({character.classType} Nv.{character.level}) y preparación para el asedio de Flaris y las invasiones de Madrigal.
          </span>
          <button
            onClick={runBuildAnalysis}
            disabled={analyzing}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {analyzing ? 'Analizando Build...' : 'Analizar Build Actual'}
          </button>
        </div>

        {error && (
          <div className="px-5 py-2.5 bg-rose-950/80 border-b border-rose-500/40 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto mu-scroll p-5 space-y-3">
          {analysis && (
            <div className="p-4 rounded-xl bg-[#162033] border border-amber-500/40 space-y-2">
              <div className="text-xs font-semibold text-amber-300">
                Diagnóstico Táctico · {analysis.combatRating}
              </div>
              <div className="text-xs text-slate-200">
                <strong>Prioridad de Forja:</strong> {analysis.upgradePriority}
              </div>
              <div className="text-xs text-slate-200">
                <strong>Distribución de Puntos:</strong> {analysis.statAdvice}
              </div>
              <div className="text-xs text-slate-200">
                <strong>Eventos:</strong> {analysis.eventReadiness}
              </div>
              {analysis.recommendations?.length > 0 && (
                <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1 pt-1">
                  {analysis.recommendations.map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {messages.length === 0 && (
            <div className="p-4 rounded-xl bg-[#141a26] border border-slate-800 text-xs text-slate-300 leading-relaxed">
              Pregunta al Oráculo sobre qué arma subir a +13 con Bless y Soul, cómo repartir STR/AGI/VIT/ENE o cómo coordinar un intercambio justo por Wi-Fi/Bluetooth.
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-amber-600 text-slate-950 font-medium'
                    : 'bg-[#171f30] border border-slate-700 text-slate-100'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="text-xs text-slate-400">El Oráculo está consultando las crónicas...</div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={sendMessage} className="p-4 border-t border-slate-800 bg-[#0d111a] flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ej: ¿Qué subo primero con mis Jewel of Soul?"
            className="flex-1 min-h-[44px] rounded-lg bg-[#141a26] border border-slate-700 px-3.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-semibold text-sm inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
};
