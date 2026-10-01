import Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import { UiModal } from './UiModal';

export interface DebugMapInfo {
  id: string;
  name: string;
  widthTiles: number;
  heightTiles: number;
  widthPx: number;
  heightPx: number;
  layersCount: number;
  warpsCount: number;
  tilesetName: string;
}

export interface DebugPlayerInfo {
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  direction: string;
  isMoving: boolean;
  speed: number;
  fps: number;
  camX: number;
  camY: number;
  zoom: number;
}

export interface DebugModalCallbacks {
  onTeleport: (x: number, y: number) => void;
  onSwitchMap: (mapId: string, x?: number, y?: number) => void;
  onSetSpeed: (multiplier: number) => void;
  onRunCommand?: (cmd: string) => string;
  onClose?: () => void;
}

const MODAL_W = 430;
const MODAL_H = 475;
const HEADER_H = 32;

/**
 * **DebugModal** — Panel Debug & Thông số Hệ thống:
 * - Hiển thị chi tiết thời gian thực: Tên bản đồ, Kích thước map, Số layer, Cổng chuyển map.
 * - Toạ độ hiện tại của nhân vật (Pixel & Ô Tile), hướng nhìn, tốc độ, trạng thái di chuyển, FPS, Camera.
 * - Thanh phím tắt Dịch chuyển nhanh (Teleport) tới toàn bộ các Map chuẩn Essentials v21.1.
 * - Điều chỉnh tốc độ di chuyển nhân vật (1x, 2x, 3x, 5x).
 * - Khung chạy lệnh Console Command (`/tp`, `/speed`, `/pos`, `/help`).
 */
export class DebugModal extends UiModal {
  private callbacks: DebugModalCallbacks;

  // Text fields hiển thị thông số động
  private txtMapName!: Phaser.GameObjects.Text;
  private txtMapSize!: Phaser.GameObjects.Text;
  private txtMapDetails!: Phaser.GameObjects.Text;

  private txtPlayerPixel!: Phaser.GameObjects.Text;
  private txtPlayerTile!: Phaser.GameObjects.Text;
  private txtPlayerState!: Phaser.GameObjects.Text;
  private txtPerfState!: Phaser.GameObjects.Text;

  private txtLogOutput!: Phaser.GameObjects.Text;

  private commandInputEl: HTMLInputElement | null = null;
  private currentSpeedMult = 1;

  constructor(scene: Phaser.Scene, callbacks: DebugModalCallbacks) {
    super(scene, {
      title: '🛠 DEBUG & THÔNG SỐ (F3)',
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: HEADER_H,
      lockUi: false,
      depth: 180,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'bottom-left',
      defaultOffsetX: 16,
      defaultOffsetY: 16,
      onClose: () => {
        this.removeCommandInput();
        callbacks.onClose?.();
      },
    });

    this.callbacks = callbacks;
    this.buildContent();
    this.close();
  }

  private buildContent(): void {
    const padX = 14;
    let curY = 10;

    // ── 1. Khối Thông Tin Bản Đồ ──
    const gfxMapBox = this.scene.add.graphics();
    gfxMapBox.fillStyle(0x13152c, 0.9);
    gfxMapBox.fillRoundedRect(padX, curY, MODAL_W - padX * 2, 76, 6);
    gfxMapBox.lineStyle(1, 0x2e3358, 0.8);
    gfxMapBox.strokeRoundedRect(padX, curY, MODAL_W - padX * 2, 76, 6);
    this.contentContainer.add(gfxMapBox);

    const lblMapHeader = this.scene.add
      .text(padX + 8, curY + 6, '🗺 THÔNG TIN BẢN ĐỒ (MAP INFO):', ts(11, '#00cec9', FONT.ui))
      .setOrigin(0, 0);
    this.contentContainer.add(lblMapHeader);

    this.txtMapName = this.scene.add
      .text(padX + 12, curY + 24, 'Map: --', ts(11, '#ffffff', FONT.mono))
      .setOrigin(0, 0);
    this.contentContainer.add(this.txtMapName);

    this.txtMapSize = this.scene.add
      .text(padX + 12, curY + 40, 'Kích thước: --', ts(11, '#9aa0c3', FONT.mono))
      .setOrigin(0, 0);
    this.contentContainer.add(this.txtMapSize);

    this.txtMapDetails = this.scene.add
      .text(padX + 12, curY + 56, 'Chi tiết: --', ts(11, '#9aa0c3', FONT.mono))
      .setOrigin(0, 0);
    this.contentContainer.add(this.txtMapDetails);

    curY += 86;

    // ── 2. Khối Toạ Độ & Trạng Thái Nhân Vật ──
    const gfxPlayerBox = this.scene.add.graphics();
    gfxPlayerBox.fillStyle(0x13152c, 0.9);
    gfxPlayerBox.fillRoundedRect(padX, curY, MODAL_W - padX * 2, 88, 6);
    gfxPlayerBox.lineStyle(1, 0x2e3358, 0.8);
    gfxPlayerBox.strokeRoundedRect(padX, curY, MODAL_W - padX * 2, 88, 6);
    this.contentContainer.add(gfxPlayerBox);

    const lblPlayerHeader = this.scene.add
      .text(padX + 8, curY + 6, '📍 TOẠ ĐỘ & NHÂN VẬT (COORDINATES):', ts(11, '#fdcb6e', FONT.ui))
      .setOrigin(0, 0);
    this.contentContainer.add(lblPlayerHeader);

    this.txtPlayerPixel = this.scene.add
      .text(padX + 12, curY + 24, 'Toạ độ Pixel: X=--, Y=--', ts(11, '#00cec9', FONT.mono))
      .setOrigin(0, 0);
    this.contentContainer.add(this.txtPlayerPixel);

    this.txtPlayerTile = this.scene.add
      .text(padX + 12, curY + 40, 'Toạ độ Ô Tile: [X=--, Y=--]', ts(11, '#ffffff', FONT.mono))
      .setOrigin(0, 0);
    this.contentContainer.add(this.txtPlayerTile);

    this.txtPlayerState = this.scene.add
      .text(padX + 12, curY + 56, 'Hướng: -- | Trạng thái: --', ts(11, '#9aa0c3', FONT.mono))
      .setOrigin(0, 0);
    this.contentContainer.add(this.txtPlayerState);

    this.txtPerfState = this.scene.add
      .text(padX + 12, curY + 72, 'FPS: -- | Camera: (0, 0) | Zoom: 1.0x', ts(10, '#636e72', FONT.mono))
      .setOrigin(0, 0);
    this.contentContainer.add(this.txtPerfState);

    curY += 98;

    // ── 3. Khối Chuyển Nhanh Map (Teleport Presets) ──
    const lblTpHeader = this.scene.add
      .text(padX, curY, '🚀 CHUYỂN BẢN ĐỒ NHANH (QUICK TELEPORT):', ts(11, '#6c5ce7', FONT.ui))
      .setOrigin(0, 0);
    this.contentContainer.add(lblTpHeader);
    curY += 18;

    const maps = [
      { id: 'lappet-town', label: 'Lappet Town', x: 256, y: 256 },
      { id: 'players-house', label: "Nhà Player", x: 96, y: 256 },
      { id: 'pokemon-lab', label: 'Pokémon Lab', x: 192, y: 384 },
      { id: 'route-1', label: 'Route 1', x: 416, y: 704 },
      { id: 'daisys-house', label: "Nhà Daisy", x: 160, y: 224 },
    ];

    let btnX = padX;
    const btnW = 76;
    const btnH = 24;

    maps.forEach((m) => {
      this.createActionButton(
        btnX,
        curY,
        btnW,
        btnH,
        m.label,
        0x2e3358,
        () => {
          this.log(`Teleport tới ${m.label} (${m.x}, ${m.y})...`);
          this.callbacks.onSwitchMap(m.id, m.x, m.y);
        },
      );
      btnX += btnW + 5;
    });

    curY += 32;

    // ── 4. Khối Điều Chỉnh Tốc Độ Di Chuyển ──
    const lblSpeed = this.scene.add
      .text(padX, curY, '⚡ TỐC ĐỘ DI CHUYỂN:', ts(11, '#00b894', FONT.ui))
      .setOrigin(0, 0);
    this.contentContainer.add(lblSpeed);

    let speedBtnX = padX + 130;
    const speedVals = [1, 2, 3, 5];
    speedVals.forEach((mult) => {
      this.createActionButton(
        speedBtnX,
        curY - 2,
        42,
        22,
        `${mult}x`,
        mult === 1 ? 0x00cec9 : 0x2e3358,
        () => {
          this.currentSpeedMult = mult;
          this.callbacks.onSetSpeed(mult);
          this.log(`Tốc độ di chuyển nhân vật: ${mult}x`);
        },
      );
      speedBtnX += 46;
    });

    curY += 28;

    // ── 5. Khối Lệnh Console Command Runner ──
    const lblCmdHeader = this.scene.add
      .text(padX, curY, '💻 LỆNH DEBUG CONSOLE (/tp, /speed, /pos, /help):', ts(11, '#e8eaf6', FONT.ui))
      .setOrigin(0, 0);
    this.contentContainer.add(lblCmdHeader);
    curY += 18;

    // Nút mở hộp thoại gõ lệnh
    this.createActionButton(
      padX,
      curY,
      130,
      26,
      '⌨ Nhập lệnh CLI...',
      0x00cec9,
      () => this.openCommandInput(),
      0x0f1020,
    );

    // Nút Copy Toạ độ
    this.createActionButton(
      padX + 136,
      curY,
      120,
      26,
      '📋 Sao chép toạ độ',
      0x2e3358,
      () => {
        const text = this.txtPlayerPixel.text + ' | ' + this.txtPlayerTile.text;
        navigator.clipboard?.writeText(text).then(() => {
          this.log('Đã sao chép toạ độ vào Clipboard!');
        });
      },
    );

    // Nút Xoá log
    this.createActionButton(
      padX + 262,
      curY,
      80,
      26,
      '🗑 Xoá log',
      0x2e3358,
      () => {
        this.txtLogOutput.setText('[Sẵn sàng nhận lệnh debug]');
      },
    );

    curY += 34;

    // Khung log output
    const gfxLogBox = this.scene.add.graphics();
    gfxLogBox.fillStyle(0x0a0c16, 0.95);
    gfxLogBox.fillRoundedRect(padX, curY, MODAL_W - padX * 2, 48, 4);
    gfxLogBox.lineStyle(1, 0x1f233f, 1);
    gfxLogBox.strokeRoundedRect(padX, curY, MODAL_W - padX * 2, 48, 4);
    this.contentContainer.add(gfxLogBox);

    this.txtLogOutput = this.scene.add
      .text(padX + 8, curY + 6, '[Sẵn sàng nhận lệnh debug (/tp, /speed, /help)]', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#a29bfe',
        wordWrap: { width: MODAL_W - padX * 2 - 16 },
      })
      .setOrigin(0, 0);
    this.contentContainer.add(this.txtLogOutput);
  }

  private createActionButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    bgColor: number,
    onClick: () => void,
    textColor = 0xffffff,
  ): void {
    const gfx = this.scene.add.graphics();
    const txt = this.scene.add
      .text(x + w / 2, y + h / 2, label, {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: textColor === 0xffffff ? '#ffffff' : '#0f1020',
      })
      .setOrigin(0.5);

    const zone = this.scene.add
      .zone(x + w / 2, y + h / 2, w, h)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const draw = (hover: boolean) => {
      gfx.clear();
      gfx.fillStyle(hover ? 0x6c5ce7 : bgColor, 0.95);
      gfx.fillRoundedRect(x, y, w, h, 4);
      gfx.lineStyle(1, hover ? 0xa29bfe : 0x3d447a, 1);
      gfx.strokeRoundedRect(x, y, w, h, 4);
    };

    draw(false);

    zone.on('pointerover', () => draw(true));
    zone.on('pointerout', () => draw(false));
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      onClick();
    });

    this.contentContainer.add([gfx, txt, zone]);
  }

  /** Cập nhật thông số Debug thời gian thực (được gọi từ update của WorldScene) */
  public updateDebugInfo(mapInfo: DebugMapInfo, playerInfo: DebugPlayerInfo): void {
    if (!this.isOpen() || this.isMinimized) return;

    this.txtMapName.setText(`Map: ${mapInfo.name} (${mapInfo.id})`);
    this.txtMapSize.setText(
      `Kích thước: ${mapInfo.widthTiles}×${mapInfo.heightTiles} ô (${mapInfo.widthPx}×${mapInfo.heightPx} px)`,
    );
    this.txtMapDetails.setText(
      `Tileset: ${mapInfo.tilesetName} | Layers: ${mapInfo.layersCount} | Warps: ${mapInfo.warpsCount}`,
    );

    this.txtPlayerPixel.setText(
      `Toạ độ Pixel: X=${playerInfo.x.toFixed(1)} px, Y=${playerInfo.y.toFixed(1)} px`,
    );
    this.txtPlayerTile.setText(`Toạ độ Ô Tile: [X: ${playerInfo.tileX}, Y: ${playerInfo.tileY}]`);
    this.txtPlayerState.setText(
      `Hướng: ${playerInfo.direction.toUpperCase()} | Trạng thái: ${
        playerInfo.isMoving ? 'ĐANG DI CHUYỂN' : 'ĐỨNG YÊN'
      } | Speed: ${this.currentSpeedMult}x`,
    );
    this.txtPerfState.setText(
      `FPS: ${playerInfo.fps} | Camera: (${playerInfo.camX}, ${playerInfo.camY}) | Zoom: ${playerInfo.zoom.toFixed(
        2,
      )}x`,
    );
  }

  public log(msg: string): void {
    const time = new Date().toLocaleTimeString('vi-VN');
    this.txtLogOutput.setText(`[${time}] ${msg}`);
  }

  private openCommandInput(): void {
    if (this.commandInputEl) {
      this.removeCommandInput();
      return;
    }

    const { actualW, actualH } = this.getScaleAndBounds();
    const X = this.currentX;
    const Y = this.currentY;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Gõ lệnh debug: /tp 256 256 | /speed 2 | /pos | /help';
    input.style.cssText = `
      position:absolute; padding:6px 10px; font-size:12px; font-family:monospace;
      border:1px solid #00cec9; background:#0f1020; color:#55efc4;
      border-radius:4px; outline:none; z-index:1005; box-shadow: 0 4px 16px rgba(0,0,0,0.8);
    `;

    const rect = this.scene.scale.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;
    const inputH = 30;
    let inputY = Y + actualH + 4;
    if (inputY + inputH > this.scene.scale.height) {
      inputY = Math.max(4, Y - inputH - 4);
    }

    input.style.left = `${rect.left + X * scaleX}px`;
    input.style.top = `${rect.top + inputY * scaleY}px`;
    input.style.width = `${actualW * scaleX}px`;
    input.style.height = `${inputH * scaleY}px`;

    document.body.appendChild(input);
    input.focus();
    this.commandInputEl = input;

    const submit = () => {
      const cmd = input.value.trim();
      if (cmd) {
        this.executeCommand(cmd);
      }
      this.removeCommandInput();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') this.removeCommandInput();
      e.stopPropagation();
    });
  }

  private executeCommand(cmd: string): void {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();

    if (command === '/tp') {
      if (parts.length === 2) {
        // /tp <mapId>
        const targetMap = parts[1];
        this.log(`Đang chuyển tới map: ${targetMap}`);
        this.callbacks.onSwitchMap(targetMap);
      } else if (parts.length >= 3) {
        // /tp <x> <y>
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        if (!isNaN(x) && !isNaN(y)) {
          this.log(`Teleport tới: (${x}, ${y})`);
          this.callbacks.onTeleport(x, y);
        } else {
          this.log(`Lỗi: Toạ độ không hợp lệ: ${parts[1]}, ${parts[2]}`);
        }
      } else {
        this.log('Cú pháp: /tp <x> <y> hoặc /tp <mapId>');
      }
    } else if (command === '/speed') {
      const mult = parseFloat(parts[1]);
      if (!isNaN(mult) && mult > 0) {
        this.currentSpeedMult = mult;
        this.callbacks.onSetSpeed(mult);
        this.log(`Đã đổi tốc độ sang: ${mult}x`);
      } else {
        this.log('Cú pháp: /speed <hệ số> (ví dụ: /speed 2)');
      }
    } else if (command === '/pos') {
      this.log(`Toạ độ hiện tại: ${this.txtPlayerPixel.text} | ${this.txtPlayerTile.text}`);
    } else if (command === '/help') {
      this.log('Lệnh có sẵn: /tp <x> <y>, /tp <mapId>, /speed <hệ_số>, /pos, /clear');
    } else if (command === '/clear') {
      this.txtLogOutput.setText('[Sẵn sàng nhận lệnh debug]');
    } else {
      if (this.callbacks.onRunCommand) {
        const res = this.callbacks.onRunCommand(cmd);
        this.log(res);
      } else {
        this.log(`Lệnh không nhận diện: "${cmd}". Gõ /help để xem hướng dẫn.`);
      }
    }
  }

  private removeCommandInput(): void {
    if (this.commandInputEl) {
      this.commandInputEl.remove();
      this.commandInputEl = null;
    }
  }

  override destroy(): void {
    this.removeCommandInput();
    super.destroy();
  }
}
