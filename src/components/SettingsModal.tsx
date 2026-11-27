import React from 'react';
import {
  Camera,
  Crosshair,
  Gauge,
  Maximize2,
  Move,
  Music,
  Sliders,
  Sun,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { GameSettings } from '../types/game';

interface SettingsModalProps {
  open: boolean;
  settings: GameSettings;
  measuredFps: number;
  onClose: () => void;
  onUpdateSettings: (next: GameSettings) => Promise<void> | void;
  onEnterButtonEditor: () => void;
  onRequestLandscapeFullscreen: () => void;
  onSwitchCharacter: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  measuredFps,
  onClose,
  onUpdateSettings,
  onEnterButtonEditor,
  onRequestLandscapeFullscreen,
  onSwitchCharacter,
}) => {
  if (!open) return null;

  const patch = (partial: Partial<GameSettings>) => {
    void onUpdateSettings({ ...settings, ...partial });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-3 sm:p-5">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-[#0e131f] border-2 border-amber-700/75 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#151c2c] border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display text-base font-bold text-amber-300">
                Ajustes de Juego y Controles
              </h2>
              <p className="text-[11px] font-mono-tabular text-slate-400">
                Rendimiento actual: {measuredFps} FPS · Meta: {settings.targetFps} FPS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar Ajustes"
            className="min-h-[40px] min-w-[40px] rounded-lg bg-[#1d2538] hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto mu-scroll p-5 space-y-4">
          {/* Brightness */}
          <div className="p-3.5 rounded-xl bg-[#131928] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
              <span className="inline-flex items-center gap-1.5">
                <Sun className="w-4 h-4 text-amber-400" />
                Brillo de Escena 3D
              </span>
              <span className="font-mono-tabular text-amber-300">
                {Math.round(settings.brightness * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.65}
              max={1.5}
              step={0.05}
              value={settings.brightness}
              onChange={(e) => patch({ brightness: Number(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Audio & Music */}
          <div className="p-3.5 rounded-xl bg-[#131928] border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5">
                {settings.muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                Efectos de Sonido ({Math.round(settings.volume * 100)}%)
              </span>
              <button
                type="button"
                onClick={() => patch({ muted: !settings.muted })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  settings.muted
                    ? 'bg-rose-700/80 text-white'
                    : 'bg-emerald-700/70 text-emerald-100'
                }`}
              >
                {settings.muted ? 'Silenciado' : 'Activo'}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => patch({ volume: Number(e.target.value) })}
              className="w-full accent-emerald-500 cursor-pointer"
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5">
                <Music className="w-4 h-4 text-sky-400" />
                Música de MuGro-up&apos; ({Math.round(settings.musicVolume * 100)}%)
              </span>
              <button
                type="button"
                onClick={() => patch({ musicEnabled: !settings.musicEnabled })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  settings.musicEnabled
                    ? 'bg-sky-700/80 text-sky-100'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {settings.musicEnabled ? 'Música ON' : 'Música OFF'}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.musicVolume}
              onChange={(e) => patch({ musicVolume: Number(e.target.value) })}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>

          {/* Camera & Combat */}
          <div className="p-3.5 rounded-xl bg-[#131928] border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
              <span className="inline-flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-purple-400" />
                Distancia de Cámara 3D
              </span>
              <span className="font-mono-tabular text-purple-300">
                {(settings.cameraDistance ?? 15.5).toFixed(1)} m
              </span>
            </div>
            <input
              type="range"
              min={7}
              max={28}
              step={0.5}
              value={settings.cameraDistance ?? 15.5}
              onChange={(e) => patch({ cameraDistance: Number(e.target.value) })}
              className="w-full accent-purple-500 cursor-pointer"
            />

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => patch({ free3dCamera: !settings.free3dCamera })}
                className={`min-h-[40px] px-3 rounded-lg border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                  settings.free3dCamera
                    ? 'bg-purple-700/35 border-purple-400 text-purple-100'
                    : 'bg-[#0c111d] border-slate-700 text-slate-300'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                Cámara Libre: {settings.free3dCamera ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => patch({ autoAimAssist: !(settings.autoAimAssist ?? true) })}
                className={`min-h-[40px] px-3 rounded-lg border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                  settings.autoAimAssist ?? true
                    ? 'bg-amber-600/30 border-amber-400 text-amber-100'
                    : 'bg-[#0c111d] border-slate-700 text-slate-300'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                Auto-Aim: {settings.autoAimAssist ?? true ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-emerald-400" />
                Límite de FPS
              </span>
              <div className="flex gap-1.5">
                {([30, 45, 60] as const).map((fps) => (
                  <button
                    key={fps}
                    type="button"
                    onClick={() => patch({ targetFps: fps })}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-mono-tabular font-bold cursor-pointer ${
                      settings.targetFps === fps
                        ? 'bg-emerald-600 text-slate-950'
                        : 'bg-[#0c111d] border border-slate-700 text-slate-300'
                    }`}
                  >
                    {fps}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* HUD & Session Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEnterButtonEditor();
              }}
              className="min-h-[42px] px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Move className="w-4 h-4" />
              Editar Botones HUD
            </button>
            <button
              type="button"
              onClick={onRequestLandscapeFullscreen}
              className="min-h-[42px] px-3 rounded-xl bg-[#182235] hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Maximize2 className="w-4 h-4 text-sky-400" />
              Pantalla Horizontal
            </button>
            <button
              type="button"
              onClick={onSwitchCharacter}
              className="min-h-[42px] px-3 rounded-xl bg-[#182235] hover:bg-slate-700 border border-rose-500/40 text-rose-200 font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Users className="w-4 h-4 text-rose-400" />
              Cambiar Héroe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
