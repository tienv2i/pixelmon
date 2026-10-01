import { createServer } from 'http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { createApp } from './app.js';
import { config, initDatabase, closeDatabase } from './config/index.js';
import { WorldRoom } from './modules/world/index.js';
import { BattleRoom } from './modules/battle/index.js';

async function bootstrap(): Promise<void> {
  // 1. Database
  await initDatabase();

  // 2. Express app
  const app = createApp();
  const httpServer = createServer(app);

  // 3. Colyseus game server
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });

  gameServer.define('world', WorldRoom);
  gameServer.define('battle', BattleRoom);

  // 4. Start
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
