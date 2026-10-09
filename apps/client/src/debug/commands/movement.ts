import { TILE_SIZE } from '@pixelmon/shared';
import { t } from '../../i18n';
import type { DebugCommandRegistry } from '../registry.js';

/** API mà nhóm lệnh di chuyển cần — WorldScene cấp qua adapter (closure). */
export interface MovementApi {
  playerPos(): { x: number; y: number; dir: string };
  teleport(x: number, y: number): void;
  switchMap(mapId: string): void;
  noclip(): boolean;
  setNoclip(v: boolean): void;
  speed(): number;
  setSpeed(mult: number): void;
  camera(): { x: number; y: number; zoom: number };
}

/** Lệnh di chuyển & vị trí: `/tp`, `/speed`, `/noclip`, `/pos`. */
export function registerMovementCommands(reg: DebugCommandRegistry, api: MovementApi): void {
  reg.register({
    name: 'tp',
    summary: () => t('WS_HELP_TP'),
    run: (a) => {
      if (a.length === 1 && a[0]) {
        api.switchMap(a[0]);
        return `${t('WS_TP_MOVING')}${a[0]}`;
      }
      if (a.length >= 2) {
        const x = parseFloat(a[0] ?? '');
        const y = parseFloat(a[1] ?? '');
        if (isNaN(x) || isNaN(y)) return t('WS_CMD_TP');
        api.teleport(x, y);
        return `${t('WS_TELEPORT_TO')}(${x}, ${y})`;
      }
      return t('WS_CMD_TP');
    },
  });

  reg.register({
    name: 'speed',
    summary: () => t('WS_HELP_SPEED'),
    run: (a) => {
      const mult = parseFloat(a[0] ?? '');
      if (!isNaN(mult) && mult > 0) {
        api.setSpeed(mult);
        return `${t('WS_SPEED')}${mult}x`;
      }
      return t('WS_CMD_SPEED');
    },
  });

  reg.register({
    name: 'noclip',
    summary: () => t('WS_HELP_NOCLIP'),
    run: (a) => {
      const arg = a[0]?.toLowerCase();
      const next = arg === 'on' ? true : arg === 'off' ? false : !api.noclip();
      api.setNoclip(next);
      return `${t('WS_NOCLIP_MODE')}${next ? t('WS_NOCLIP_ON') : t('WS_NOCLIP_OFF')}`;
    },
  });

  reg.register({
    name: 'pos',
    summary: () => t('WS_HELP_POS'),
    run: () => {
      const p = api.playerPos();
      const cam = api.camera();
      return [
        `Pixel: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) | Tile: [${Math.floor(p.x / TILE_SIZE)}, ${Math.floor(p.y / TILE_SIZE)}]`,
        `Hướng: ${p.dir.toUpperCase()} | Noclip: ${api.noclip() ? 'BẬT' : 'TẮT'}`,
        `Camera: (${Math.round(cam.x)}, ${Math.round(cam.y)}) | Zoom: ${cam.zoom.toFixed(2)}x`,
      ].join('\n');
    },
  });
}
