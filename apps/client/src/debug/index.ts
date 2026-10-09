import { DebugCommandRegistry, type DebugCommandDef } from './registry.js';
export { DebugCommandRegistry } from './registry.js';
import { t } from '../i18n';
import { registerMovementCommands, type MovementApi } from './commands/movement.js';
import { registerMapDebugCommands, type MapDebugApi } from './commands/mapDebug.js';
import { registerNpcCommands, type NpcApi } from './commands/npc.js';
import { registerModerationCommands, type ModerationApi } from './commands/moderation.js';
import { registerUiCommands, type UiApi } from './commands/ui.js';
import { registerSystemsCommands, type SystemsApi } from './commands/systems.js';

/**
 * Bundle API debug — WorldScene dựng 1 object thoả toàn bộ interface này bằng
 * closure (không phải mở `private` thành `public`). Mỗi nhóm lệnh chỉ thấy
 * đúng phần API của mình.
 */
export interface DebugApiBundle
  extends MovementApi,
    MapDebugApi,
    NpcApi,
    ModerationApi,
    UiApi,
    SystemsApi {}

/** Dựng registry đầy đủ lệnh — WorldScene gọi 1 lần (lazy) rồi `execute()`. */
export function buildDebugRegistry(api: DebugApiBundle): DebugCommandRegistry {
  const reg = new DebugCommandRegistry();
  reg.register({
    name: 'help',
    summary: () => t('WS_HELP_HELP'),
    run: () => reg.helpText(),
  });
  registerMovementCommands(reg, api);
  registerMapDebugCommands(reg, api);
  registerNpcCommands(reg, api);
  registerModerationCommands(reg, api);
  registerUiCommands(reg, api);
  registerSystemsCommands(reg, api);
  return reg;
}

export type { DebugCommandDef };
export type { MovementApi } from './commands/movement.js';
export type { MapDebugApi, OverlayKey } from './commands/mapDebug.js';
export type { NpcApi, NpcListEntry } from './commands/npc.js';
export type { ModerationApi, PartySelectRequest } from './commands/moderation.js';
export type { UiApi } from './commands/ui.js';
export type { SystemsApi } from './commands/systems.js';
export { describeTerrainTag } from './commands/mapDebug.js';
