import { Server } from 'colyseus';
import { createServer } from 'http';
import { WorldRoom } from './modules/world/world.room.js';
import { BattleRoom } from './modules/battle/battle.room.js';
import { env } from './config/env.js';
import { app } from './app.js';

const server = createServer(app);
const gameServer = new Server({ server });

gameServer.define('world', WorldRoom);
gameServer.define('battle', BattleRoom);

const port = Number(process.env.PORT ?? env.PORT);
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

export default gameServer;
