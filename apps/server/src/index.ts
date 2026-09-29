import http from 'node:http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { createApp } from './app.js';
import { getDb } from './config/database.js';
import { assertEnv, env } from './config/env.js';
import { runMigrations } from './config/migrator.js';
import { UserRepository } from './repositories/user.repository.js';
import { PlayerProfileRepository } from './repositories/player-profile.repository.js';
import { WorldRoom } from './modules/world/world.room.js';
import { BattleRoom } from './modules/battle/battle.room.js';

async function bootstrap() {
  assertEnv();
  const db = getDb();
  runMigrations(db);

  const users = new UserRepository(db);
  await users.seedAdminFromEnv();

  const profiles = new PlayerProfileRepository(db);

  const gameServer = new Server({
    transport: new WebSocketTransport({ server: http.createServer() }),
  });
  gameServer.define('world', WorldRoom, { users, profiles });
  gameServer.define('battle', BattleRoom, { users });

  const app = createApp(db);
  const httpServer = http.createServer(app);
  gameServer.attach({ server: httpServer });

  await new Promise<void>((resolve) => httpServer.listen(env.PORT, resolve));
  console.log(`[server] listening on :${env.PORT}`);
}

bootstrap().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
