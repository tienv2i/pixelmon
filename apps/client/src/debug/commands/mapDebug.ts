import { MAPS, TILE_SIZE } from '@pixelmon/shared';
import { TILED_MAPS } from '../../world/TiledMapLoader';
import { MAP_LAYER_KEYS, type MapLayerKey } from '../../ui/DebugModal';
import { t } from '../../i18n';
import type { DebugCommandRegistry } from '../registry.js';

/**
 * Tên đọc được của `terrain_tag` (RMXP/Essentials) — khớp bảng trong
 * `scripts/build-server-map.ts` (`TERRAIN_TAG_TO_FLAG`). Chỉ dùng cho debug.
 * (Chuyển từ `WorldScene.ts` sang đây — nơi duy nhất dùng nó.)
 */
export function describeTerrainTag(tag: number): string {
  const names: Record<number, string> = {
    1: 'Ledge (jump down)',
    2: 'Grass',
    3: 'Sand',
    4: 'Rock',
    5: 'DeepWater',
    6: 'StillWater',
    7: 'Water',
    8: 'Waterfall',
    9: 'WaterfallCrest',
    10: 'TallGrass',
    11: 'UnderwaterGrass',
    12: 'Ice',
    13: 'Neutral',
    14: 'SootGrass',
    15: 'Bridge',
    16: 'Puddle',
  };
  return names[tag] ?? `unknown(${tag})`;
}

export type OverlayKey = 'grid' | 'collision' | 'warp';

/** API mà nhóm lệnh soi map cần — WorldScene cấp qua adapter (closure). */
export interface MapDebugApi {
  currentMapId(): string;
  mapSizePx(): { w: number; h: number };
  layersCount(): number;
  collisionFlag(tx: number, ty: number): number;
  terrainAt(tx: number, ty: number): number | undefined;
  markTile(tx: number, ty: number): void;
  clearTileMarker(): void;
  overlayVisible(key: OverlayKey): boolean;
  setOverlay(key: OverlayKey, on: boolean): void;
  layerOn(key: MapLayerKey): boolean;
  setLayer(key: MapLayerKey, on: boolean): void;
  /** Đồng bộ checkbox trong DebugModal (`setToggleState`). */
  syncToggle(key: string, on: boolean): void;
  openTownMap(): void;
  propQuery(): string;
  setPropQuery(q: string): void;
  setPropOverlay(on: boolean): void;
  propHits(): number;
  /** Ô nhân vật đang đứng (fallback khi `/tile` không kèm toạ độ). */
  playerTile(): { x: number; y: number };
}

/** Lệnh soi bản đồ: `/map`, `/tile`, `/overlay`, `/layer`, `/debug`. */
export function registerMapDebugCommands(reg: DebugCommandRegistry, api: MapDebugApi): void {
  const mapDetails = (): string => {
    const mapId = api.currentMapId();
    const meta = MAPS[mapId];
    const tmj = TILED_MAPS[mapId];
    const objGroup = tmj?.layers?.find((l: any) => l.type === 'objectgroup');
    const warpsCount = objGroup?.objects?.length ?? 0;
    const size = api.mapSizePx();
    return [
      `Bản đồ: ${meta?.name ?? mapId} (${mapId})`,
      `Kích thước: ${Math.round(size.w / TILE_SIZE)}×${Math.round(size.h / TILE_SIZE)} tiles (${size.w}×${size.h}px)`,
      `Số lớp: ${api.layersCount() || 1} | Điểm warp: ${warpsCount}`,
      `Tileset: ${mapId.includes('house') || mapId.includes('lab') ? 'Interior general.png' : 'Outside.png'}`,
    ].join('\n');
  };

  reg.register({
    name: 'map',
    aliases: ['townmap'],
    summary: () => t('WS_HELP_TOWNMAP'),
    run: (a) => {
      if (a[0] === 'info' || a[0] === 'debug') return mapDetails();
      api.openTownMap();
      return '[UI] Đã mở Bản đồ vùng Essen (Town Map).';
    },
  });

  reg.register({
    name: 'tile',
    summary: () => t('WS_HELP_TILE'),
    run: (a) => {
      const size = api.mapSizePx();
      const mapW = Math.round(size.w / TILE_SIZE);
      const mapH = Math.round(size.h / TILE_SIZE);
      const mapId = api.currentMapId();

      // `/tile off` — xoá đánh dấu ô đang hiển thị trên bản đồ.
      if (a[0]?.toLowerCase() === 'off') {
        api.clearTileMarker();
        return `${t('WS_TILE_CELL')}: ${t('WS_TILE_MARKER_CLEARED')}`;
      }

      // Bỏ trống → ô nhân vật đang đứng (center → tile).
      let tx: number;
      let ty: number;
      if (a.length >= 2) {
        tx = parseInt(a[0] ?? '', 10);
        ty = parseInt(a[1] ?? '', 10);
        if (!Number.isInteger(tx) || !Number.isInteger(ty)) return t('WS_CMD_TILE');
      } else {
        const pt = api.playerTile();
        tx = pt.x;
        ty = pt.y;
      }
      if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) {
        return `${t('WS_TILE_OOB')} (${tx}, ${ty}) — ${mapW}×${mapH}`;
      }

      // Đánh dấu ô trên bản đồ (viền + nhãn toạ độ) trước khi in thông tin.
      api.markTile(tx, ty);

      const tmj = TILED_MAPS[mapId];
      const idx = ty * mapW + tx;
      const rows: string[] = [`${t('WS_TILE_CELL')}: (${tx}, ${ty}) [map ${mapId}]`];

      // 1) gid trên từng lớp + property của tile trong Tiled (nguồn terrain thật).
      const props = new Map<string, unknown>();
      const gidLines: string[] = [];
      let firstGid = 1;
      if (tmj?.tilesets?.[0]) {
        firstGid = tmj.tilesets[0].firstgid ?? 1;
        for (const layer of tmj.layers) {
          if (layer.type !== 'tilelayer' || !layer.data) continue;
          const gid = layer.data[idx] ?? 0;
          if (gid === 0) {
            gidLines.push(`    ${layer.name}: ${t('WS_TILE_EMPTY')}`);
            continue;
          }
          gidLines.push(`    ${layer.name}: gid=${gid} tile_id=${gid - firstGid}`);
          if (layer.name.toLowerCase() !== 'ground') continue; // terrain chỉ đọc ở Ground
          const tile = tmj.tilesets[0]?.tiles?.find((x) => x.id === gid - firstGid);
          for (const p of tile?.properties ?? []) props.set(p.name, p.value);
        }
      }
      rows.push(`${t('WS_TILE_LAYERS')}:`, ...(gidLines.length ? gidLines : [`    ${t('WS_TILE_EMPTY')}`]));

      const terrain = props.get('terrain_tag');
      const passage = props.get('passage');
      rows.push(
        `${t('WS_TILE_TERRAIN')}: ${
          terrain === undefined
            ? `${t('WS_TILE_TERRAIN_NONE')} (không có terrain_tag)`
            : `terrain_tag=${String(terrain)} (${describeTerrainTag(Number(terrain))})`
        }`,
        `${t('WS_TILE_PASSAGE')}: ${passage === undefined ? '—' : String(passage)}`,
      );

      // 2) Collision flag từ server JSON (client bundle — cùng logic với server).
      const flag = api.collisionFlag(tx, ty);
      const bits: string[] = [];
      if (flag & 0x01) bits.push(t('WS_TILE_WALKABLE'));
      if (flag & 0x04) bits.push(t('WS_TILE_BLOCKED'));
      if (flag & 0x02) bits.push(t('WS_TILE_WATER'));
      if (flag & 0x08) bits.push(`** ${t('WS_TILE_GRASS')} **`);
      if (flag & 0x60) bits.push(`${t('WS_TILE_LEDGE')} 0x${(flag & 0x60).toString(16)}`);
      if (flag & 0x80) bits.push(t('WS_TILE_WARP'));
      // Bit 8-11: passage theo hướng (RMXP) — hướng bị chặn.
      const passBits: string[] = [];
      if (flag & 0x0100) passBits.push('down');
      if (flag & 0x0200) passBits.push('left');
      if (flag & 0x0400) passBits.push('right');
      if (flag & 0x0800) passBits.push('up');
      if (passBits.length) bits.push(`passage chặn: ${passBits.join(', ')}`);
      rows.push(`${t('WS_TILE_FLAG')}: 0x${flag.toString(16).padStart(4, '0')} → ${bits.join(' | ') || '—'}`);
      rows.push(`${t('WS_TILE_MARKER')}: (${tx}, ${ty})`);
      return rows.join('\n');
    },
  });

  reg.register({
    name: 'overlay',
    summary: () => t('WS_HELP_OVERLAY'),
    run: (a) => {
      const key = a[0]?.toLowerCase() as OverlayKey | undefined;
      if (!key || !['grid', 'collision', 'warp'].includes(key)) {
        return t('WS_CMD_OVERLAY');
      }
      if (a.length < 2) {
        const curr = api.overlayVisible(key);
        return `${t('WS_OVERLAY_STATE')}${key}": ${curr ? t('WS_OVERLAY_ON') : t('WS_OVERLAY_OFF')}`;
      }
      const on = a[1].toLowerCase() !== 'off';
      api.setOverlay(key, on);
      api.syncToggle(key, on);
      return `${t('WS_OVERLAY_STATE')}${key}": ${on ? t('WS_OVERLAY_ENABLED') : t('WS_OVERLAY_DISABLED')}`;
    },
  });

  reg.register({
    name: 'layer',
    summary: () => t('WS_HELP_LAYER'),
    run: (a) => {
      const key = a[0]?.toLowerCase() as MapLayerKey | undefined;
      if (!key || !MAP_LAYER_KEYS.includes(key)) {
        return t('WS_CMD_LAYER');
      }
      if (a.length < 2) {
        return `${t('WS_LAYER_STATE')}${key}": ${api.layerOn(key) ? t('WS_LAYER_ON') : t('WS_LAYER_OFF')}`;
      }
      const on = a[1].toLowerCase() !== 'off';
      api.setLayer(key, on);
      api.syncToggle(`layer_${key}`, on);
      return `${t('WS_LAYER_STATE')}${key}": ${on ? t('WS_LAYER_VISIBLE') : t('WS_LAYER_HIDDEN')}`;
    },
  });

  reg.register({
    name: 'debug',
    summary: () => t('WS_HELP_DEBUG'),
    run: (a) => {
      const sub = a[0]?.toLowerCase();

      // `/debug off` (hoặc trơ trụi) — tắt toàn bộ overlay debug.
      // (Bug cũ: nhánh này đặt SAU `if (action === '/debug') return...` nên
      // không bao giờ tới được — đã đưa lên đầu.)
      if (!sub || sub === 'off') {
        api.setOverlay('grid', false);
        api.setOverlay('collision', false);
        api.setOverlay('warp', false);
        api.setPropOverlay(false);
        api.clearTileMarker();
        api.syncToggle('grid', false);
        api.syncToggle('collision', false);
        api.syncToggle('warp', false);
        return t('WS_DEBUG_OFF');
      }

      // `/debug terrain <num|all|none>` — tô mọi ô có `terrain_tag = num`.
      if (sub === 'terrain') {
        const arg = a[1]?.toLowerCase();
        if (arg === undefined || arg === 'none' || arg === '') {
          api.setPropQuery('');
          api.setPropOverlay(false);
          return `${t('WS_TERRAIN_OVERLAY_STATE')}: ${t('WS_PROP_OVERLAY_OFF')}`;
        }
        if (arg === 'all') {
          api.setPropQuery('terrain_tag');
          api.setPropOverlay(true);
          return [
            `${t('WS_TERRAIN_OVERLAY_STATE')}: ${t('WS_PROP_OVERLAY_ON')}`,
            `${t('WS_PROP_OVERLAY_QUERY')}: terrain_tag (mọi giá trị)`,
            `${t('WS_PROP_OVERLAY_HITS')}: ${api.propHits()}`,
          ].join('\n');
        }
        const num = parseInt(arg, 10);
        if (!Number.isInteger(num) || num < 0) return t('WS_CMD_TERRAIN');
        api.setPropQuery(`terrain_tag=${num}`);
        api.setPropOverlay(true);
        return [
          `${t('WS_TERRAIN_OVERLAY_STATE')}: ${t('WS_PROP_OVERLAY_ON')}`,
          `${t('WS_PROP_OVERLAY_QUERY')}: terrain_tag=${num} (${describeTerrainTag(num)})`,
          `${t('WS_PROP_OVERLAY_HITS')}: ${api.propHits()}`,
        ].join('\n');
      }

      // `/debug is_terrain <x> <y>` — kiểm tra 1 ô có phải terrain không.
      //   Bỏ trống → ô nhân vật đang đứng. Trả về terrain_tag + tên đọc được.
      if (sub === 'is_terrain') {
        const size = api.mapSizePx();
        const mapW = Math.round(size.w / TILE_SIZE);
        const mapH = Math.round(size.h / TILE_SIZE);
        let tx: number;
        let ty: number;
        if (a.length >= 3) {
          tx = parseInt(a[1] ?? '', 10);
          ty = parseInt(a[2] ?? '', 10);
          if (!Number.isInteger(tx) || !Number.isInteger(ty)) return t('WS_CMD_IS_TERRAIN');
        } else {
          const pt = api.playerTile();
          tx = pt.x;
          ty = pt.y;
        }
        if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) {
          return `${t('WS_TILE_OOB')} (${tx}, ${ty}) — ${mapW}×${mapH}`;
        }
        const tag = api.terrainAt(tx, ty);
        const rows = [`${t('WS_TILE_CELL')}: (${tx}, ${ty}) [map ${api.currentMapId()}]`];
        if (tag === undefined) {
          rows.push(`${t('WS_TILE_TERRAIN')}: ${t('WS_TILE_TERRAIN_NONE')}`);
        } else {
          rows.push(`${t('WS_TILE_TERRAIN')}: terrain_tag=${tag} (${describeTerrainTag(tag)})`);
        }
        return rows.join('\n');
      }

      // `/debug passage <up|down|left|right|all|none>` — tô ô có `passage` chặn hướng.
      if (sub === 'passage') {
        const arg = a[1]?.toLowerCase();
        if (arg === undefined || arg === 'none' || arg === '') {
          api.setPropQuery('');
          api.setPropOverlay(false);
          return `${t('WS_PASSAGE_OVERLAY')}: ${t('WS_PROP_OVERLAY_OFF')}`;
        }
        const valid = ['up', 'down', 'left', 'right', 'all'];
        if (!valid.includes(arg)) return t('WS_CMD_PASSAGE');
        // Map hướng → bit passage của RMXP (bit 0-3).
        const bit: Record<string, number> = { down: 0x01, left: 0x02, right: 0x04, up: 0x08 };
        api.setPropQuery(arg === 'all' ? 'passage' : `passage=${bit[arg]}`);
        api.setPropOverlay(true);
        return [
          `${t('WS_PASSAGE_OVERLAY')}: ${t('WS_PROP_OVERLAY_ON')}`,
          `${t('WS_PROP_OVERLAY_QUERY')}: passage=${arg}`,
          `${t('WS_PROP_OVERLAY_HITS')}: ${api.propHits()}`,
        ].join('\n');
      }

      return t('WS_CMD_DEBUG_GRID');
    },
  });
}
