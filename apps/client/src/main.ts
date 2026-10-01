import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LoginScene } from './scenes/LoginScene';
import { WorldScene } from './scenes/WorldScene';
import { BattleScene } from './scenes/BattleScene';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@pixelmon/shared';
import { C } from './ui/theme';

/**
 * Scale manager config:
 * - RESIZE: canvas tự động fill theo cửa sổ, giữ nguyên aspect ratio 4:3.
 * - antialias: BẬT để text HUD sắc nét. (pixelArt=true sẽ tắt antialias và làm mờ text.)
 *
 * Khi resize, scene.scale.width/height thay đổi → UI elements tự cập nhật
 * thông qua scene.scale.on('resize').
 */
// Dùng Phaser.CANVAS để render bộ tileset chuẩn Pokémon Essentials (Outdoor.png cao 16096px).
// WebGL có giới hạn MAX_TEXTURE_SIZE (thường là 8192px trên nhiều GPU) sẽ gây lỗi
// "texImage2D: width or height out of range". Canvas 2D không bị giới hạn này
// và render pixel-perfect 100% khớp với Admin map canvas.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  parent: 'game-container',
  backgroundColor: C.bg,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    min: { width: 400, height: 300 },
    max: { width: 3840, height: 2160 },
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [BootScene, LoginScene, WorldScene, BattleScene],
};

const game = new Phaser.Game(config);

// Chặn context menu chuột phải trên canvas — chuột phải dùng cho click-to-move,
// và chuột giữa dùng để pan camera. Không có `contextmenu` là Firefox/Chrome
// sẽ hiện menu ngữ cảnh che mất gameplay.
game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Debug hook: expose game handle in dev để inspect scene graph từ console.
if (import.meta.env.DEV) {
  (window as unknown as { __game?: Phaser.Game }).__game = game;
}

// Game zoom bằng scroll wheel — CHỈ zoom phần thế giới (map + nhân vật).
// Mặc định TẮT — chỉ hoạt động khi người chơi bật trong bảng Settings ('pixelmon.scrollToZoom' === 'true').
function handleWheelZoom(e: WheelEvent) {
  try {
    if (localStorage.getItem('pixelmon.scrollToZoom') !== 'true') return;
  } catch {
    return;
  }

  const active = game.scene.scenes.find((s) => s.scene.isActive());
  if (!active) return;
  // Chỉ WorldScene có gameZoomBy — các scene khác (Login/Battle) bỏ qua.
  const zoomFn = (active as unknown as { zoomGameBy?: (d: number, x: number, y: number) => void })
    .zoomGameBy;
  if (typeof zoomFn !== 'function') return;

  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  zoomFn.call(active, delta, e.clientX, e.clientY);
}

// Throttle zoom events
let lastZoom = 0;
window.addEventListener(
  'wheel',
  (e) => {
    if (Date.now() - lastZoom < 50) return;
    lastZoom = Date.now();
    handleWheelZoom(e);
  },
  { passive: true },
);
