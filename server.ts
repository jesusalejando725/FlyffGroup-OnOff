import otaManifest from './public/ota-manifest.json' with { type: 'json' };
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { mountWorldAdmin } from './src/server/worldAdmin.ts';
import { mountPrivateBackup } from './src/server/privateBackup.ts';
import { createRoomHub } from './src/services/roomHub.ts';
import type {
  AsyncDuelChallenge,
  AsyncDuelRecord,
  HeroClass,
  MuItem,
} from './src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = otaManifest.version;
const CLOUD_STORE_PATH = path.join(__dirname, '.mugroup-duels.json');

interface CloudStoreData {
  duels: Record<string, AsyncDuelRecord>;
  challenges: Record<string, AsyncDuelChallenge>;
}

function loadCloudStore(): CloudStoreData {
  try {
    if (fs.existsSync(CLOUD_STORE_PATH)) {
      const raw = fs.readFileSync(CLOUD_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<CloudStoreData>;
      return {
        duels: parsed.duels || {},
        challenges: parsed.challenges || {},
      };
    }
  } catch {
    // fallback to empty store
  }
  return { duels: {}, challenges: {} };
}

function saveCloudStore(data: CloudStoreData) {
  try {
    fs.writeFileSync(CLOUD_STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('No se pudo guardar .mu-cloud-sync-store.json:', err);
  }
}

const cloudStore = loadCloudStore();

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  if (process.env.MU_TRUST_PROXY) app.set('trust proxy',process.env.MU_TRUST_PROXY);
  app.use(express.json({ limit: '2mb' }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (pathname === '/ws') {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  const roomHub = createRoomHub({
    onChallenge: challenge => {
      cloudStore.challenges[challenge.id] = challenge;
      saveCloudStore(cloudStore);
    },
    onDuel: record => {
      cloudStore.duels[record.id] = record;
      saveCloudStore(cloudStore);
    },
  });
  wss.on('connection', ws => roomHub.attach({
    isOpen: () => ws.readyState === WebSocket.OPEN,
    send: message => ws.send(message),
    onMessage: handler => ws.on('message', raw => handler(raw.toString())),
    onClose: handler => ws.on('close', handler),
  }));

  mountWorldAdmin(app, {
    file: process.env.MU_WORLD_FILE || path.join(__dirname, 'ADMIN', 'live-world.local.json'),
    password: process.env.MU_ADMIN_PASSWORD,
    origins: process.env.MU_WORLD_ORIGINS,
  });

  // API: configuración base de ADMIN
  const ADMIN_DIR = path.join(__dirname, 'ADMIN');
  const ADMIN_SECTIONS = new Set([
    'world-rules',
    'monsters',
    'items',
    'item-options',
    'npcs',
    'classes-skills',
  ]);

  app.get('/api/admin/config', (_req, res) => {
    try {
      const config: Record<string, unknown> = {};
      for (const key of ADMIN_SECTIONS) {
        const filePath = path.join(ADMIN_DIR, `${key}.json`);
        if (fs.existsSync(filePath)) {
          config[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      }
      res.json({ ok: true, config });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Error leyendo ADMIN/' });
    }
  });

  // Vite transforms ADMIN JSON imports in development; production serves dist/ADMIN below.

  // API: OTA / APK-Web Manifest
  app.get('/api/ota/manifest', (req, res) => {
    const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    res.json({
      appName: "MuGro-up'",
      version: APP_VERSION,
      buildTimestamp: new Date().toISOString(),
      webEntryUrl: origin,
      webManifest: '/manifest.webmanifest',
      offlineEngine: 'Dexie.js (IndexedDB Offline-First) + Service Worker Precache + Babylon.js',
      transports: ['wifi-websocket'],
      githubWorkflow: '.github/workflows/deploy-pages.yml',
    });
  });

  mountPrivateBackup(
    app,
    process.env.MU_BACKUP_DIR || path.join(__dirname, '.mugroup-backups'),
    process.env.MU_BACKUP_ORIGINS || '',
    process.env.MU_RECOVERY_KEY || '',
  );

  // API: Publish & List Async Duel Challenges (Wi-Fi / Offline Sync)
  app.get('/api/duels/challenges', (_req, res) => {
    const list = Object.values(cloudStore.challenges)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);
    res.json({ challenges: list });
  });

  app.post('/api/duels/challenge', (req, res) => {
    const challenge = req.body as AsyncDuelChallenge;
    if (!challenge?.id || !challenge?.challengerName) {
      res.status(400).json({ ok: false, error: 'Snapshot de duelo inválido.' });
      return;
    }
    cloudStore.challenges[challenge.id] = challenge;
    saveCloudStore(cloudStore);
    res.json({ ok: true, challenge });
  });

  // API: List active Wi-Fi rooms on local server
  app.get('/api/rooms', (_req, res) => {
    const active = roomHub.listRooms();
    res.json({ rooms: active });
  });

  // API: Gemini Multi-Turn Chatbot (Oráculo de MuGro-up')
  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const { history = [], message, playerContext } = req.body as {
        history?: Array<{ role: 'user' | 'model'; content: string }>;
        message: string;
        playerContext?: {
          name: string;
          classType: HeroClass;
          level: number;
          zen: number;
          bless: number;
          soul: number;
          equippedItems: string[];
          sharedCount: number;
        };
      };

      if (!message || !message.trim()) {
        res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
        return;
      }

      const ai = createGeminiClient();
      const contextSummary = playerContext
        ? `Héroe actual en IndexedDB: ${playerContext.name} (Clase: ${playerContext.classType}, Nivel ${playerContext.level}). Zen: ${playerContext.zen}, Bless: ${playerContext.bless}, Soul: ${playerContext.soul}. Equipo: ${playerContext.equippedItems.join(', ') || 'Básico'}. Ítems compartidos en historial: ${playerContext.sharedCount}.`
        : 'Sin contexto de héroe cargado.';

      const systemInstruction =
        "Eres el Oráculo de MuGro-up', un maestro herrero y estratega experto. " +
        'Respondes siempre en español claro, conciso y práctico. Ayudas al jugador con builds de los 10 héroes M/F (DK, DW, ELF, DL, MG), ' +
        'zonas seguras de 500m, eventos, mejoras con joyas (+0 a +15), y sincronización segura por Wi-Fi/Bluetooth e IndexedDB. ' +
        contextSummary;

      const chat = ai.chats.create({
        model: 'gemini-4-hydrogen',
        history: history.slice(-12).map((h) => ({
          role: h.role,
          parts: [{ text: h.content }],
        })),
        config: {
          systemInstruction,
        },
      });

      const response = await chat.sendMessage({ message });
      res.json({ reply: response.text || 'El Oráculo permanece en silencio.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error consultando a Gemini.';
      console.error('Gemini chat error:', err);
      res.status(500).json({ error: message });
    }
  });

  // API: Gemini Build & Inventory Analyzer (Structured JSON)
  app.post('/api/gemini/analyze-build', async (req, res) => {
    try {
      const { character, items, ledgerCount } = req.body as {
        character: Record<string, unknown>;
        items: MuItem[];
        ledgerCount: number;
      };

      const ai = createGeminiClient();
      const equipped = (items || [])
        .filter((i) => i.isEquipped)
        .map((i) => `${i.slot}: ${i.name} +${i.enhanceLevel} (${i.rarity})`)
        .join('; ');

      const prompt = `Analiza este personaje de MuGro-up' guardado en IndexedDB y devuelve recomendaciones tácticas en español:
Personaje: ${JSON.stringify(character)}
Equipo equipado: ${equipped || 'Ninguno'}
Total ítems en inventario: ${items?.length || 0}
Registros en historial compartido Wi-Fi/Bluetooth: ${ledgerCount || 0}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction:
            "Eres un analista táctico de MuGro-up'. Evalúa equipo, distribución de stats (STR/AGI/VIT/ENE), joyas Bless/Soul y preparación para mapas y jefes.",
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              combatRating: {
                type: Type.STRING,
                description: 'Rango de poder corto, ej: Grado A · Veterano de MuGro-up\'',
              },
              upgradePriority: {
                type: Type.STRING,
                description: 'Qué arma o pieza de set subir primero con Bless/Soul',
              },
              statAdvice: {
                type: Type.STRING,
                description: 'Consejo corto para repartir STR, AGI, VIT y ENE',
              },
              eventReadiness: {
                type: Type.STRING,
                description: 'Evaluación para mapas de alto nivel y jefes',
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Lista de 3 acciones concretas',
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ analysis: parsed });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error analizando build.';
      console.error('Gemini analyze error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MuGro-up' Web & APK-Web server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
