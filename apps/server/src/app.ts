import express, { type Express } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { authRouter } from './modules/auth/index.js';
import { getPlayer, listOnlinePlayers } from './modules/player/index.js';
import {
  getPokemonList,
  swapPokemon,
  depositPokemon,
  withdrawPokemon,
  releasePokemon,
  renamePokemon,
  getPokedexHandler,
} from './modules/pokemon/index.js';
import {
  getAdminStatus,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  resetAdminUserPassword,
  deleteAdminUser,
  banAdminUser,
  unbanAdminUser,
  listAdminPokemon,
  listAdminPlayers,
} from './modules/admin/index.js';
import {
  listAdminSprites,
  listPublicSprites,
  getAdminSprite,
  createAdminSprite,
  updateAdminSprite,
  deleteAdminSprite,
  spriteUploadMiddleware,
} from './modules/admin/sprite.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { rateLimit, securityHeaders } from './middleware/security.js';
import { getUserInfo, updateUserInfo } from './modules/user/index.js';
import { bagRouter } from './modules/items/bagApi.js';
import {
  getItemOverview,
  listTopSpenders,
  listEvolutionHistory,
  listEventLog,
} from './modules/admin/items.js';
import {
  getGameDataSummary,
  listGameDataSpecies,
  getGameDataSpeciesDetail,
  listGameDataMoves,
  listGameDataItems,
  listGameDataAbilities,
  getGameDataTypes,
} from './modules/admin/gamedata.js';
import {
  listAdminMaps,
  getAdminMapDetail,
  updateAdminMap,
  importEssentialsMap,
  regenerateAdminMap,
} from './modules/admin/maps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): Express {
  const app = express();

  // Bảo mật cho trang server tự phục vụ + API (CSP, chống clickjacking...).
  app.use(securityHeaders());

  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true,
    }),
  );
  app.use(express.json());

  // ── Health ──
  app.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  // ── Shared assets (pokemon icons, battlers, items, audio) ──
  app.use(
    '/assets',
    express.static(path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'assets')),
  );

  // ── Static pages (landing + admin) ──
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ── Tiled maps (.tmj) — runtime fetch fallback cho client ──
  // Client bundle dùng `import.meta.glob`; đây là bản backup nếu cần tải map
  // ngoài bundle. Mỗi world có bộ riêng: /maps/worlds/<world>/tiled/<id>.tmj.
  app.use(
    '/maps/worlds',
    express.static(
      path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'data', 'maps', 'worlds'),
    ),
  );

  // ── Auth ──
  // Rate-limit chống brute-force: 10 lần / 15 phút / IP cho login, 5 / giờ cho
  // register (đăng ký tài khoản là hành động nặng + nhạy cảm).
  app.use(
    '/api/auth/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Đăng nhập quá nhiều lần. Thử lại sau ít phút.' }),
  );
  app.use(
    '/api/auth/register',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Đăng ký quá nhiều lần. Thử lại sau.' }),
  );
  app.use('/api/auth', authRouter);

  // ── Admin API (chỉ role=admin) ──
  app.get('/api/admin/status', requireAuth, requireAdmin, getAdminStatus);
  app.get('/api/admin/users', requireAuth, requireAdmin, listAdminUsers);
  app.post('/api/admin/users', requireAuth, requireAdmin, createAdminUser);
  app.patch('/api/admin/users/:id', requireAuth, requireAdmin, updateAdminUser);
  app.post('/api/admin/users/:id/password', requireAuth, requireAdmin, resetAdminUserPassword);
  app.post('/api/admin/users/:id/ban', requireAuth, requireAdmin, banAdminUser);
  app.post('/api/admin/users/:id/unban', requireAuth, requireAdmin, unbanAdminUser);
  app.delete('/api/admin/users/:id', requireAuth, requireAdmin, deleteAdminUser);
  app.get('/api/admin/pokemon', requireAuth, requireAdmin, listAdminPokemon);
  app.get('/api/admin/players', requireAuth, requireAdmin, listAdminPlayers);

  // ── Plan 45 Phase 7 — Items & Trades ──
  app.get('/api/admin/items/overview', requireAuth, requireAdmin, getItemOverview);
  app.get('/api/admin/items/top-spenders', requireAuth, requireAdmin, listTopSpenders);
  app.get('/api/admin/evolution/history', requireAuth, requireAdmin, listEvolutionHistory);
  app.get('/api/admin/events', requireAuth, requireAdmin, listEventLog);

  // ── Dữ liệu game (Essentials Game Data) ──
  app.get('/api/admin/gamedata/summary', requireAuth, requireAdmin, getGameDataSummary);
  app.get('/api/admin/gamedata/species', requireAuth, requireAdmin, listGameDataSpecies);
  app.get('/api/admin/gamedata/species/:id', requireAuth, requireAdmin, getGameDataSpeciesDetail);
  app.get('/api/admin/gamedata/moves', requireAuth, requireAdmin, listGameDataMoves);
  app.get('/api/admin/gamedata/items', requireAuth, requireAdmin, listGameDataItems);
  app.get('/api/admin/gamedata/abilities', requireAuth, requireAdmin, listGameDataAbilities);
  app.get('/api/admin/gamedata/types', requireAuth, requireAdmin, getGameDataTypes);

  // ── Quản lý Maps ──
  app.get('/api/admin/maps', requireAuth, requireAdmin, listAdminMaps);
  app.get('/api/admin/maps/:id', requireAuth, requireAdmin, getAdminMapDetail);
  app.patch('/api/admin/maps/:id', requireAuth, requireAdmin, updateAdminMap);
  app.post('/api/admin/maps/:id/regenerate', requireAuth, requireAdmin, regenerateAdminMap);
  app.post('/api/admin/maps/import', requireAuth, requireAdmin, importEssentialsMap);

  // ── Thư viện sprite nhân vật ──
  app.get('/api/sprites', listPublicSprites);

  // Upload dùng multipart; các route JSON vẫn đi qua cùng handler (multer bỏ qua khi
  // không có Content-Type multipart).
  app.post(
    '/api/admin/sprites',
    requireAuth,
    requireAdmin,
    spriteUploadMiddleware,
    createAdminSprite,
  );
  app.get('/api/admin/sprites', requireAuth, requireAdmin, listAdminSprites);
  app.get('/api/admin/sprites/:id', requireAuth, requireAdmin, getAdminSprite);
  app.patch(
    '/api/admin/sprites/:id',
    requireAuth,
    requireAdmin,
    spriteUploadMiddleware,
    updateAdminSprite,
  );
  app.delete('/api/admin/sprites/:id', requireAuth, requireAdmin, deleteAdminSprite);

  // ── User profile API (cùng mình hoặc admin) ──
  app.get('/api/users/:id/info', requireAuth, getUserInfo);
  app.put('/api/users/:id/info', requireAuth, updateUserInfo);

  // ── Game API (bảo vệ bằng JWT) ──
  app.get('/api/players/:userId', requireAuth, getPlayer);
  app.get('/api/players', requireAuth, listOnlinePlayers);
  app.get('/api/pokemon', requireAuth, getPokemonList);
  app.get('/api/pokemon/pokedex', requireAuth, getPokedexHandler);
  app.get('/api/pokemon/:userId', requireAuth, getPokemonList);
  app.post('/api/pokemon/swap', requireAuth, swapPokemon);
  app.post('/api/pokemon/deposit', requireAuth, depositPokemon);
  app.post('/api/pokemon/withdraw', requireAuth, withdrawPokemon);
  app.post('/api/pokemon/release', requireAuth, releasePokemon);
  app.post('/api/pokemon/rename', requireAuth, renamePokemon);

  // ── Túi đồ / Store / Event feed (Plan 45) ──
  app.use('/api/inventory', bagRouter);

  // ── Serve admin.html (chỉ admin vào được — client-side check role) ──
  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
  });

  // ── 404 handler ──
  app.use((_req, res) => {
    res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Endpoint not found' });
  });

  // ── Central error handler ──
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('[server:error]', err);
      res.status(500).json({ ok: false, code: 'INTERNAL', message: 'Internal server error' });
    },
  );

  return app;
}
