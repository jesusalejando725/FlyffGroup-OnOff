import { HERO_APPEARANCES, findHeroAppearance, heroAppearanceName } from '../data/heroAppearances';
import { PrivateBackupPanel } from './PrivateBackupPanel';
import React, { useState } from 'react';
import {
  Cloud,
  CloudOff,
  KeyRound,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import { MU_CLASSES } from '../data/muSkillsAndClasses';
import type { HeroClass, MuAccount, MuCharacter, SyncStatusInfo } from '../types/game';
import { PWAInstallButton, isStandaloneApp } from './PWAInstallButton';

interface ClassicLoginFlowProps {
  stage: 'login' | 'character_select';
  accounts: MuAccount[];
  currentAccount: MuAccount | null;
  characters: MuCharacter[];
  selectedCharId: string | null;
  syncStatus: SyncStatusInfo;
  onLogin: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  onRegister: (input: {
    username: string;
    password: string;
    secretQ1: string;
    secretA1: string;
    secretQ2: string;
    secretA2: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onChangePassword: (
    username: string,
    oldPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onLookupRecoveryQuestions: (
    username: string,
  ) => Promise<{ found: true; secretQ1: string; secretQ2: string; source: 'local' | 'cloud' } | { found: false; error?: string }>;
  onRecoverAccount: (input: {
    username: string;
    secondAnswer?: string;
    slot: 1|2;
    answer: string;
    newPassword: string;
  }) => Promise<{ ok: boolean; message?: string; error?: string }>;
  onSelectCharacter: (charId: string) => void;
  onCreateCharacter: (name: string, classType: HeroClass, sex: 'male' | 'female', appearanceId?: string) => Promise<void>;
  onRotatePreview: (dx:number) => void;
  onRestore: () => Promise<void>;
  onEnterWorld: () => void;
  onLogoutAccount: () => void;
  onOpenApkCenter: () => void;
  onPreviewClass: (classType: HeroClass, sex?: 'male' | 'female', appearanceId?: string) => void;
}

const PRESET_QUESTIONS_1 = [
  '¿Nombre de tu primera mascota?',
  '¿Ciudad donde naciste?',
  '¿Nombre de la ciudad inicial de MU?',
  '¿Tu comida favorita de niño?',
];

const PRESET_QUESTIONS_2 = [
  '¿Color de tu primer vehículo o joya?',
  '¿Nombre de tu mejor amigo de infancia?',
  '¿Color de la joya Jewel of Bless?',
  '¿Año de nacimiento de un familiar?',
];

export const ClassicLoginFlow: React.FC<ClassicLoginFlowProps> = ({
  stage,
  accounts,
  currentAccount,
  characters,
  selectedCharId,
  syncStatus,
  onLogin,
  onRegister,
  onChangePassword,
  onLookupRecoveryQuestions,
  onRecoverAccount,
  onSelectCharacter,
  onCreateCharacter,
  onEnterWorld, onRestore, onRotatePreview,
  onLogoutAccount,
  onOpenApkCenter,
  onPreviewClass,
}) => {
  const pointer = React.useRef<{id:number; x:number} | null>(null);
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'recover'>('login');

  // Login & Change Password state
  const [username, setUsername] = useState(() => {
    try { return isStandaloneApp() ? localStorage.getItem('mu-last-local-user') ?? '' : ''; }
    catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Register state (with 2 mandatory Secret Questions)
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
  const [secretQ1, setSecretQ1] = useState(PRESET_QUESTIONS_1[0]);
  const [secretA1, setSecretA1] = useState('');
  const [secretQ2, setSecretQ2] = useState(PRESET_QUESTIONS_2[0]);
  const [secretA2, setSecretA2] = useState('');

  // Recover Account state
  const [recUser, setRecUser] = useState('');
  const [recQuestions, setRecQuestions] = useState<{ q1: string; q2: string; source: 'local' | 'cloud' } | null>(null);
  const [secondAnswer,setSecondAnswer] = useState('');
  const [recSlot,setRecSlot] = useState<1|2>(1);
  const [recAnswer,setRecAnswer] = useState('');
  const [recNewPass, setRecNewPass] = useState('');

  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Character creation
  const [creatingChar, setCreatingChar] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [newCharSex, setNewCharSex] = useState<'male' | 'female'>('male');
  const [newAppearanceId, setNewAppearanceId] = useState('');
  const [newCharClass, setNewCharClass] = useState<HeroClass>('DK');
  const newAppearance = findHeroAppearance(newAppearanceId, newCharClass);

  const clearFeedback = () => {
    setAuthError(null);
    setAuthSuccess(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      if (showChangePwd) {
        const res = await onChangePassword(username, oldPassword, newPassword);
        if (!res.ok) {
          setAuthError(res.error || 'No se pudo cambiar la contraseña.');
        } else {
          setAuthSuccess('Contraseña actualizada en IndexedDB y marcada para sincronización.');
          setPassword(newPassword);
          setOldPassword('');
          setNewPassword('');
          setShowChangePwd(false);
        }
        return;
      }

      const res = await onLogin(username, password);
      if (!res.ok) {
        setAuthError(res.error || 'Error de acceso.');
      } else {
        setPassword('');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'No se pudo completar la solicitud. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      const res = await onRegister({
        username: regUser,
        password: regPass,
        secretQ1,
        secretA1,
        secretQ2,
        secretA2,
      });
      if (!res.ok) {
        setAuthError(res.error || 'Error al registrar cuenta.');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'No se pudo completar la solicitud. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  };

  const handleLookupQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (!recUser.trim()) {
      setAuthError('Ingresa tu nombre de usuario primero.');
      return;
    }
    setBusy(true);
    try {
      const res = await onLookupRecoveryQuestions(recUser);
      if (!res.found) {
        setSecondAnswer('');
        setRecQuestions(null);
        setAuthError(res.error || 'No se encontró esa cuenta en el dispositivo ni en la nube.');
      } else {
        setRecQuestions({ q1: res.secretQ1, q2: res.secretQ2, source: res.source });
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'No se pudo completar la solicitud. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  };

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      const res = await onRecoverAccount({
        username: recUser,
        slot:recSlot,
        secondAnswer:recQuestions?.source === 'local' ? secondAnswer : undefined,
        answer:recAnswer,
        newPassword: recNewPass,
      });
      if (!res.ok) {
        setAuthError(res.error || 'No se pudo recuperar la cuenta.');
      } else {
        setAuthSuccess(res.message || 'Cuenta recuperada y contraseña restablecida.');
        setUsername(recUser.trim().toLowerCase());
        setPassword(recNewPass);
        setSecondAnswer('');
        setRecQuestions(null);
        setRecAnswer('');
        setRecNewPass('');
        setAuthTab('login');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'No se pudo completar la solicitud. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCharName.trim()) return;
    await onCreateCharacter(newCharName.trim(), newCharClass, newCharSex, newAppearance?.id);
    setNewCharName('');
    setCreatingChar(false);
  };

  return (
    <div className={`realm-screen realm-${stage} absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto mu-scroll`}
      style={stage === 'login' ? {backgroundImage: `url(./mugroup/portadas/${{login:'acceso',register:'registro',recover:'recuperacion'}[authTab]}.webp)`} : undefined}>
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-3 text-xs text-amber-200/90 font-mono-tabular">
          <span>MuGro'up · Crónicas del reino</span>
          <span className="text-slate-500">·</span>
          <span className={`inline-flex items-center gap-1 ${syncStatus.isOnline ? 'text-emerald-300' : 'text-amber-300'}`}>
            {syncStatus.isOnline ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
            {syncStatus.isOnline
              ? syncStatus.syncing
                ? 'Sincronizando...'
                : syncStatus.pendingCount > 0
                  ? `${syncStatus.pendingCount} pendientes`
                  : 'En línea'
              : 'Guardado local'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">

          <PWAInstallButton />
          {stage === 'character_select' && currentAccount && (
            <button
              onClick={onLogoutAccount}
              className="min-h-[40px] px-3 rounded-lg bg-[#151b28] border border-slate-700 hover:border-amber-500/60 text-xs text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cuenta ({currentAccount.username})
            </button>
          )}
        </div>
      </div>

      {/* STAGE 1: 3-TAB OFFLINE-FIRST AUTHENTICATION */}
      {stage === 'login' && (
        <div className="realm-auth my-auto w-full max-w-lg space-y-3 py-2">
          <div className="text-center">
            <svg viewBox="0 0 460 80" className="w-full max-w-[330px] mx-auto h-auto" role="img" aria-label="MuGro-up'">
              <defs>
                <linearGradient id="muS6Gold" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fef3c7" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#b45309" />
                </linearGradient>
              </defs>
              <text
                x="230"
                y="46"
                textAnchor="middle"
                fill="url(#muS6Gold)"
                fontFamily="Cinzel, Georgia, serif"
                fontWeight="700"
                fontSize="40"
                letterSpacing="4"
              >
                MUGRO-UP&apos;
              </text>
              <text
                x="230"
                y="70"
                textAnchor="middle"
                fill="#cbd5e1"
                fontFamily="Plus Jakarta Sans, sans-serif"
                fontWeight="600"
                fontSize="12"
                letterSpacing="3"
              >
                MUNDO ABIERTO · {(MU_CLASSES.length + HERO_APPEARANCES.length) * 2} VARIANTES 3D
              </text>
            </svg>
          </div>

          <div className="rounded-xl bg-[#0e131f]/95 border-2 border-amber-700/70 shadow-2xl overflow-hidden">
            {/* 3 Required Tabs */}
            <div className="grid grid-cols-3 border-b border-slate-800 bg-[#0b0f18]">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('login');
                  clearFeedback();
                }}
                className={`min-h-[44px] px-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  authTab === 'login'
                    ? 'bg-amber-600/20 text-amber-300 border-b-2 border-amber-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Shield className="w-3.5 h-3.5 shrink-0" />
                Iniciar Sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('register');
                  clearFeedback();
                }}
                className={`min-h-[44px] px-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  authTab === 'register'
                    ? 'bg-amber-600/20 text-amber-300 border-b-2 border-amber-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                Registrar Cuenta
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('recover');
                  clearFeedback();
                }}
                className={`min-h-[44px] px-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  authTab === 'recover'
                    ? 'bg-amber-600/20 text-amber-300 border-b-2 border-amber-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                Recuperar Cuenta
              </button>
            </div>

            <div className="p-4 space-y-3">
              {authError && (
                <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-500/50 text-xs text-rose-200">
                  {authError}
                </div>
              )}
              {authSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-xs text-emerald-200">
                  {authSuccess}
                </div>
              )}

              {/* TAB 1: INICIAR SESIÓN (+ Cambiar Contraseña) */}
              {authTab === 'login' && (
                <form onSubmit={handleLoginSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">ID de Cuenta (Usuario)</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Tu ID de cuenta"
                      required
                      className="w-full min-h-[44px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {!showChangePwd ? (
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Contraseña</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        required
                        className="w-full min-h-[44px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2.5 p-3 rounded-lg bg-[#090d16] border border-amber-700/40">
                      <div className="text-xs font-semibold text-amber-300">
                        Cambiar Contraseña (validando clave anterior)
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-300 mb-1">Contraseña Actual</label>
                        <input
                          type="password"
                          value={oldPassword}
                          onChange={(e) => setOldPassword(e.target.value)}
                          required
                          className="w-full min-h-[40px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-300 mb-1">Nueva Contraseña</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          minLength={4}
                          className="w-full min-h-[40px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100"
                        />
                      </div>
                    </div>
                  )}

                  {isStandaloneApp() && !showChangePwd && accounts.some(acc => acc.id !== 'acc-lorencia-demo') && (
                    <div className="flex flex-wrap gap-2 text-xs" aria-label="Cuentas locales">
                      {accounts.filter(acc => acc.id !== 'acc-lorencia-demo').map(acc => (
                        <button key={acc.id} type="button" className="text-amber-300 underline"
                          onClick={() => { setUsername(acc.username); setPassword(''); }}>{acc.username}</button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowChangePwd((v) => !v);
                        clearFeedback();
                      }}
                      className="text-xs text-sky-300 hover:underline cursor-pointer"
                    >
                      {showChangePwd ? 'Volver a Iniciar Sesión' : 'Cambiar Contraseña'}
                    </button>
                    {!showChangePwd && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthTab('recover');
                          clearFeedback();
                        }}
                        className="text-xs text-slate-400 hover:text-amber-300 cursor-pointer"
                      >
                        ¿Olvidaste tu clave?
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[46px] rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-sm cursor-pointer"
                  >
                    {showChangePwd ? 'Guardar Nueva Contraseña' : 'Conectar al Servidor (Offline / Sync)'}
                  </button>
                </form>
              )}

              {/* TAB 2: REGISTRAR CUENTA (2 Preguntas Secretas Obligatorias) */}
              {authTab === 'register' && (
                <form onSubmit={handleRegisterSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Usuario *</label>
                      <input
                        type="text"
                        value={regUser}
                        onChange={(e) => setRegUser(e.target.value)}
                        placeholder="Nuevo usuario"
                        required
                        minLength={3}
                        className="w-full min-h-[42px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Contraseña *</label>
                      <input
                        type="password"
                        value={regPass}
                        onChange={(e) => setRegPass(e.target.value)}
                        placeholder="Mínimo 4 caracteres"
                        required
                        minLength={4}
                        className="w-full min-h-[42px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold text-amber-300">
                      Pregunta Secreta 1 (Obligatoria)
                    </div>
                    <select
                      value={secretQ1}
                      onChange={(e) => setSecretQ1(e.target.value)}
                      className="w-full min-h-[38px] rounded-lg bg-[#080b12] border border-slate-700 px-2.5 text-xs text-slate-100"
                    >
                      {PRESET_QUESTIONS_1.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={secretA1}
                      onChange={(e) => setSecretA1(e.target.value)}
                      placeholder="Tu respuesta secreta 1"
                      required
                      className="w-full min-h-[40px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100"
                    />
                  </div>

                  <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold text-amber-300">
                      Pregunta Secreta 2 (Obligatoria)
                    </div>
                    <select
                      value={secretQ2}
                      onChange={(e) => setSecretQ2(e.target.value)}
                      className="w-full min-h-[38px] rounded-lg bg-[#080b12] border border-slate-700 px-2.5 text-xs text-slate-100"
                    >
                      {PRESET_QUESTIONS_2.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={secretA2}
                      onChange={(e) => setSecretA2(e.target.value)}
                      placeholder="Tu respuesta secreta 2"
                      required
                      className="w-full min-h-[40px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[46px] rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-sm cursor-pointer"
                  >
                    Crear cuenta y entrar
                  </button>
                </form>
              )}

              {/* TAB 3: RECUPERAR CUENTA (Local + Descarga desde Nube) */}
              {authTab === 'recover' && (
                <div className="space-y-3">

                  <form onSubmit={handleLookupQuestions} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-300 mb-1">Nombre de Usuario a Recuperar</label>
                      <input
                        type="text"
                        value={recUser}
                        onChange={(e) => {
                          setRecUser(e.target.value);
                          setSecondAnswer('');
                          setRecQuestions(null);
                          setRecAnswer('');
                        }}
                        placeholder="Tu ID de cuenta"
                        required
                        className="w-full min-h-[42px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="min-h-[42px] px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-amber-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Buscar Preguntas
                    </button>
                  </form>

                  {recQuestions && (
                    <form onSubmit={handleRecoverSubmit} className="space-y-2.5 p-3 rounded-lg bg-[#090d16] border border-sky-500/40">
                      {recQuestions.source === 'local' ? <label htmlFor="recovery-answer" className="block text-xs text-amber-200">{recQuestions.q1}</label> : <label className="block text-xs text-amber-200">
                        Elige una pregunta de recuperación
                        <select value={recSlot} onChange={e=>{setRecSlot(e.target.value === '2' ? 2 : 1); setRecAnswer('');}}
                          className="block w-full min-h-[40px] rounded-lg bg-[#080b12] border border-slate-700 px-3">
                          <option value={1}>{recQuestions.q1}</option>
                          <option value={2}>{recQuestions.q2}</option>
                        </select>
                      </label>}
                      <input id="recovery-answer" type="password" value={recAnswer} onChange={e=>setRecAnswer(e.target.value)}
                        placeholder="Respuesta de recuperación" aria-label="Respuesta de recuperación" required
                        className="w-full min-h-[40px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100" />
                      <div>
                        {recQuestions.source === 'local' && <label className="block text-xs text-amber-200">{recQuestions.q2}
                          <input type="password" required value={secondAnswer} onChange={e=>setSecondAnswer(e.target.value)} className="block w-full min-h-[40px] rounded-lg bg-slate-900 p-2" />
                        </label>}
                        <label className="block text-xs text-slate-300 mb-1">Nueva Contraseña</label>
                        <input
                          type="password"
                          value={recNewPass}
                          onChange={(e) => setRecNewPass(e.target.value)}
                          placeholder="Mínimo 4 caracteres"
                          required
                          minLength={4}
                          className="w-full min-h-[40px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={busy}
                        className="w-full min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-sm cursor-pointer"
                      >
                        Restablecer contraseña
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2: CLASSIC MU CHARACTER SELECT & CREATE */}
      {stage === 'character_select' && (
        <div className="realm-roster">
          <div className="realm-turn" tabIndex={0} role="group" aria-label="Girar personaje"
            onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {e.preventDefault(); onRotatePreview(e.key === 'ArrowLeft' ? -18 : 18);} }}
            onPointerDown={e => {pointer.current={id:e.pointerId,x:e.clientX}; e.currentTarget.setPointerCapture(e.pointerId);}}
            onLostPointerCapture={() => {pointer.current=null;}}
            onPointerMove={e => {const p=pointer.current; if (p?.id === e.pointerId) {onRotatePreview(e.clientX-p.x); p.x=e.clientX;}}}>
            <span>↔ &nbsp; Arrastra para girar</span></div>
          <div className="realm-controls rounded-xl bg-[#0e131f]/95 border-2 border-amber-700/60 p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <h2 className="font-display text-sm font-bold text-amber-300">
                  Selección de Personaje ({characters.length}/10)
                </h2>
              </div>
              {characters.length < 10 && !creatingChar && (
                <button
                  onClick={() => {
                    setCreatingChar(true);
                    onPreviewClass(newCharClass, newCharSex, newAppearance?.id);
                  }}
                  className="min-h-[38px] px-3 rounded-lg bg-amber-600/20 border border-amber-500/60 hover:bg-amber-600/30 text-amber-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Crear Personaje
                </button>
              )}
            </div>

            {syncStatus.error && currentAccount && <p role="status" className="text-xs text-amber-300">
              No se ha confirmado la recuperación desde otro dispositivo. {syncStatus.error}
            </p>}
            {!creatingChar && <details className="text-xs text-amber-200"><summary>Copia y recuperación de cuenta</summary>
              <PrivateBackupPanel key={currentAccount?.id} onRestored={onRestore} />
              <button onClick={onOpenApkCenter}>Configurar servidor de respaldo</button></details>}
            {!creatingChar ? (
              <div className="space-y-2 max-h-[240px] overflow-y-auto mu-scroll">
                {characters.length === 0 ? (
                  <div className="p-4 rounded-lg bg-[#090d16] border border-slate-800 text-xs text-slate-400 text-center">
                    Tu cuenta nueva aún no tiene personajes. Toca "Crear Personaje" para elegir una clase y una apariencia.
                  </div>
                ) : (
                  characters.map((ch) => {
                    const clsMeta = MU_CLASSES.find((m) => m.id === ch.classType);
                    const isSelected = ch.id === selectedCharId;
                    const look = findHeroAppearance(ch.appearanceId, ch.classType);
                    return (
                      <button
                        key={ch.id}
                        onClick={() => onSelectCharacter(ch.id)}
                        className={`w-full p-3 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-[#1a2235] border-amber-500'
                            : 'bg-[#090d16] border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-bold text-slate-100">{ch.name}</div>
                          <div className="text-xs text-slate-400 font-mono-tabular">
                            {look ? heroAppearanceName(look, ch.sex) : clsMeta?.name ?? ch.classType} · {ch.sex === 'female' ? 'Femenino' : 'Masculino'} · Nv.{ch.level} · {ch.isSynced ? 'Sync OK' : 'Local'}
                          </div>
                        </div>
                        <span className="text-xs font-mono-tabular text-amber-300">
                          {isSelected ? 'Seleccionado' : 'Elegir'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <form onSubmit={handleCreateSubmit} className="space-y-3">
                <div className="text-xs font-semibold text-amber-200">
                  Nuevo héroe · Elige tu personaje
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-[215px] overflow-y-auto mu-scroll">
                  {MU_CLASSES.map((cls) => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => {
                        setNewCharClass(cls.id);
                        setNewAppearanceId('');
                        onPreviewClass(cls.id, newCharSex);
                      }}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer ${
                        newCharClass === cls.id && !newAppearance
                          ? 'bg-[#1c253b] border-amber-500 text-amber-200'
                          : 'bg-[#0a0e17] border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold">{cls.name}</div>
                      <div className="text-[11px] text-slate-400">{cls.role}</div>
                    </button>
                  ))}
                  {HERO_APPEARANCES.map(look => <button key={look.id} type="button" aria-pressed={newAppearance?.id === look.id}
                    className="realm-astral rounded-lg border p-2 text-left text-xs" onClick={() => {
                      setNewAppearanceId(look.id); setNewCharClass(look.classId); onPreviewClass(look.classId,newCharSex,look.id);
                    }}><strong>{heroAppearanceName(look,newCharSex)}</strong><br/>Magia astral · Mago</button>)}
                </div>
                <fieldset className="flex gap-2" aria-label="Variante del personaje">
                  {(['male', 'female'] as const).map(sex => <button key={sex} type="button"
                    aria-pressed={newCharSex === sex}
                    onClick={() => { setNewCharSex(sex); onPreviewClass(newCharClass, sex, newAppearance?.id); }}
                    className={`flex-1 min-h-[42px] rounded border ${newCharSex === sex ? 'border-amber-400 bg-amber-900/40' : 'border-slate-600'}`}>
                    {sex === 'male' ? 'Masculino' : 'Femenino'}
                  </button>)}
                </fieldset>
                <input
                  type="text"
                  value={newCharName}
                  onChange={(e) => setNewCharName(e.target.value)}
                  placeholder="Nombre del personaje (máx 16)"
                  maxLength={16}
                  required
                  className="w-full min-h-[42px] rounded-lg bg-[#080b12] border border-slate-700 px-3 text-sm text-slate-100"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreatingChar(false)}
                    className="flex-1 min-h-[42px] rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 min-h-[42px] rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
                  >
                    Crear Héroe
                  </button>
                </div>
              </form>
            )}
          </div>

          {!creatingChar && selectedCharId && (
            <div className="realm-enter flex flex-col gap-2">
              <button
                onClick={onEnterWorld}
                className="min-h-[54px] px-8 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-display font-bold text-base inline-flex items-center justify-center gap-2.5 shadow-2xl cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                INGREAS A MuGro'up
              </button>
              <div className="text-xs text-slate-300 font-mono-tabular flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                4 Mundos de Madrigal: Flaris · Robledal · Puerto de Bruma · Cráter de Ceniza
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-slate-400 font-mono-tabular text-center pt-2 shrink-0">
        Tu aventura se guarda en este dispositivo. <button type="button" className="underline text-amber-200" onClick={onOpenApkCenter}>Servidor de cuentas y restauración</button>
      </div>
    </div>
  );
};
