import { createServer } from 'http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { createApp } from './app.js';
import { config, initDatabase, closeDatabase } from './config/index.js';
import { WorldRoom } from './modules/world/index.js';
import { BattleRoom } from './modules/battle/index.js';
import { mapLoader, gameData } from '@pixelmon/shared/data';
import { setTypeChart } from '@pixelmon/shared';

async function bootstrap(): Promise<void> {
  // 1. Database
  await initDatabase();

  // 2. Nạp toàn bộ map collision (ServerMap) — cache cho WorldRoom validate.
  try {
    const maps = await mapLoader.loadAll();
    console.log(`[server] loaded ${maps.length} maps: ${maps.map((m) => m.mapId).join(', ')}`);
  } catch (err) {
    console.warn('[server] map preload failed (world room sẽ tự load khi onCreate):', err);
  }

  // 2b. Nạp game data (species/moves/encounters) + type chart thật cho battle.
  try {
    await gameData.load();
    setTypeChart(gameData.getTypeChart());
    console.log(`[server] game data loaded: ${gameData.stats().speciesCount} species`);
  } catch (err) {
    console.warn('[server] game data preload failed (dùng FALLBACK_TYPE_CHART):', err);
  }

  // 3. Express app
  const app = createApp();
  const httpServer = createServer(app);

  // 4. Colyseus game server
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });

  // filterBy(['mapId']) → mỗi map có 1 room riêng; joinOrCreate('world', { mapId })
  // chỉ vào đúng room của map đó (không còn 1 room chung cho mọi map).
  gameServer.define('world', WorldRoom).filterBy(['mapId']);
  gameServer.define('battle', BattleRoom);

  // 5. Start
  await gameServer.listen(config.port);
  console.log(`[server] listening on port ${config.port} (${config.nodeEnv})`);

  // 5. Graceful shutdown
  const shutdown = async () => {
    console.log('[server] shutting down...');
    await gameServer.gracefullyShutdown(true);
    await closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[server] fatal:', err);
  process.exit(1);
});
