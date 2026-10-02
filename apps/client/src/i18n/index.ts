/**
 * i18n — Đa ngôn ngữ (VI/EN) cho toàn bộ UI client.
 *
 * - Chỉ **một** ngôn ngữ được hiển thị tại một thời điểm (theo `settings.system.lang`).
 * - `t(key)` trả về chuỗi theo ngôn ngữ hiện tại.
 * - `tr(textObj, key)` gắn một `Phaser.GameObjects.Text` vào key — tự cập nhật
 *   khi đổi ngôn ngữ, không cần dựng lại panel.
 *
 * Cách dùng:
 *   import { t, tr, setLang, onLangChange } from '../i18n';
 *   this.label = tr(scene.add.text(0, 0, '', style), 'SETTINGS_TITLE');
 *   setLang('en');
 */

export type Lang = 'vi' | 'en';
export const LANGS: readonly Lang[] = ['vi', 'en'] as const;
export const DEFAULT_LANG: Lang = 'vi';

/** Mỗi entry: [tiếng Việt, tiếng Anh] */
type Entry = readonly [vi: string, en: string];

const MESSAGES = {
  // ── Settings: tabs & chung ──────────────────────────────────────────────
  SETTINGS_TITLE: ['⚙ BẢNG CÀI ĐẶT HỆ THỐNG', '⚙ SYSTEM SETTINGS'],
  TAB_INTERFACE: ['🖥 Giao diện', '🖥 Interface'],
  TAB_GAMEPLAY: ['🎮 Lối chơi', '🎮 Gameplay'],
  TAB_AUDIO: ['🔊 Âm thanh', '🔊 Audio'],
  TAB_SYSTEM: ['⚙ Hệ thống', '⚙ System'],
  BTN_RESET_SETTINGS: ['Khôi phục cài đặt gốc (Reset Settings)', 'Restore default settings'],
  BTN_CLOSE_SETTINGS: ['ĐÓNG BẢNG CÀI ĐẶT (ESC)', 'CLOSE SETTINGS (ESC)'],

  // ── Settings: tab Giao diện ──────────────────────────────────────────────
  SEC_HUD: ['HIỂN THỊ CÁC THÀNH PHẦN GIAO DIỆN (HUD):', 'SHOW INTERFACE ELEMENTS (HUD):'],
  CHK_PROFILE: ['Thông tin nhân vật', 'Player info'],
  CHK_CLOCK: ['Đồng hồ & Thời tiết', 'Clock & Weather'],
  CHK_PARTY: ['Danh sách đội hình', 'Party list'],
  CHK_CHAT: ['Khung trò chuyện', 'Chat box'],
  CHK_MINIMAP: ['Bản đồ thu nhỏ', 'Minimap'],
  CHK_MINI: ['Giao diện thu gọn (Mini HUD)', 'Compact interface (Mini HUD)'],
  SEC_ZOOM: ['ĐIỀU CHỈNH THU PHÓNG (ZOOM):', 'ZOOM ADJUSTMENT:'],
  LBL_UI_ZOOM: ['Tỉ lệ giao diện:', 'UI scale:'],
  SEC_RENDER: ['CHẤT LƯỢNG HIỂN THỊ (RENDERING):', 'RENDERING QUALITY:'],
  CHK_ANTIALIAS: ['Làm mịn chữ & hình (Anti-aliasing)', 'Smooth text & graphics (Anti-aliasing)'],
  RENDER_NOTE: [
    'ℹ Mịn: chữ nét thanh, hình láng. Thô (Pixel): giữ nét pixel — thay đổi áp dụng khi tải lại game.',
    'ℹ Smooth: crisp text, soft edges. Pixel: keep pixel-art edges — takes effect after reload.',
  ],
  LBL_GAME_ZOOM: ['Tỉ lệ thế giới:', 'World scale:'],

  // ── Settings: tab Lối chơi ──────────────────────────────────────────────
  SEC_GAMEPLAY: ['THIẾT LẬP HIỂN THỊ THẾ GIỚI & ĐIỀU KHIỂN:', 'WORLD DISPLAY & CONTROLS:'],
  CHK_PLAYER_NAMES: ['Hiện tên người chơi', 'Show player names'],
  CHK_MOUSE_TRACKING: ['Đánh dấu ô chuột lướt qua', 'Highlight hovered tile'],
  CHK_SHOW_GRID: ['Hiện lưới toạ độ', 'Show coordinate grid'],
  CHK_TARGET_MARKER: ['Đánh dấu ô đích di chuyển', 'Mark destination tile'],
  CHK_AUTO_RUN: ['Luôn chạy', 'Always run'],
  CHK_SCROLL_TO_ZOOM: ['Cuộn chuột để thu phóng', 'Scroll to zoom'],
  SEC_MOVE_MODE: [
    'CƠ CHẾ DI CHUYỂN BẰNG CHUỘT / CẢM ỨNG (CLICK TO MOVE):',
    'MOUSE / TOUCH MOVEMENT (CLICK TO MOVE):',
  ],
  BTN_LMB_DEFAULT: ['👈 Chuột trái / Touch (LMB) [Mặc định]', '👈 Left click / Touch (LMB) [Default]'],
  BTN_RMB: ['👉 Chuột phải (RMB)', '👉 Right click (RMB)'],
  SEC_ANCHOR: [
    'MỐC NEO KHUNG NHÌN GAME (GAME VIEW ANCHOR):',
    'GAME VIEW ANCHOR:',
  ],
  HINT_MOVE: [
    '• Di chuyển bằng bàn phím: Dùng 4 phím mũi tên hoặc W, A, S, D.\n• Giữ chuột giữa (MMB) hoặc Shift + Chuột trái để kéo di chuyển camera.',
    '• Keyboard movement: use arrow keys or W, A, S, D.\n• Hold middle mouse (MMB) or Shift + Left click to pan the camera.',
  ],
  ANCHOR_DEFS: [
    '↖ Trên-Trái / ⬆ Trên / ↗ Trên-Phải',
    '↖ Top-left / ⬆ Top / ↗ Top-right',
  ],
  ANCHOR_CENTER: ['⏺ Tâm Giữa', '⏺ Center'],
  ANCHOR_TOP_LEFT: ['↖ Trên-Trái', '↖ Top left'],
  ANCHOR_TOP: ['⬆ Trên', '⬆ Top'],
  ANCHOR_TOP_RIGHT: ['↗ Trên-Phải', '↗ Top right'],
  ANCHOR_LEFT: ['⬅ Trái', '⬅ Left'],
  ANCHOR_RIGHT: ['➡ Phải', '➡ Right'],
  ANCHOR_BOTTOM_LEFT: ['↙ Dưới-Trái', '↙ Bottom left'],
  ANCHOR_BOTTOM: ['⬇ Dưới', '⬇ Bottom'],
  ANCHOR_BOTTOM_RIGHT: ['↘ Dưới-Phải', '↘ Bottom right'],

  // ── Settings: tab Âm thanh ──────────────────────────────────────────────
  SEC_AUDIO: [
    'CÀI ĐẶT ÂM LƯỢNG & HIỆU ỨNG ÂM THANH:',
    'VOLUME & SOUND EFFECT SETTINGS:',
  ],
  CHK_BGM: ['Nhạc nền (BGM)', 'Music (BGM)'],
  CHK_SFX: ['Hiệu ứng âm thanh (SFX)', 'Sound effects (SFX)'],
  AUDIO_NOTE: [
    'ℹ Hệ thống âm thanh đang được đồng bộ với máy chủ âm nhạc Pokemon.',
    'ℹ Sound system is synced with the Pokemon music server.',
  ],

  // ── Settings: tab Hệ thống ──────────────────────────────────────────────
  LBL_LANGUAGE: ['NGÔN NGỮ HIỂN THỊ (LANGUAGE):', 'DISPLAY LANGUAGE:'],
  LANG_VI: ['🇻🇳 Tiếng Việt', '🇻🇳 Vietnamese'],
  LANG_EN: ['🇺🇸 English', '🇺🇸 English'],
  LBL_ACCOUNT: ['THÔNG TIN TÀI KHOẢN & PHÍM TẮT:', 'ACCOUNT INFO & SHORTCUTS:'],
  ACC_INFO: [
    '• Để đăng xuất nhanh: Nhấp vào biểu tượng 🚪 Đăng xuất trên thanh công cụ trên cùng.\n• Phím tắt mở cài đặt: Bấm phím [Esc] hoặc biểu tượng ⚙ trên thanh công cụ.',
    '• To log out quickly: click the 🚪 Logout icon on the top toolbar.\n• Shortcut to open settings: press [Esc] or the ⚙ icon on the toolbar.',
  ],

  // ── TopMenu / SelectTools ────────────────────────────────────────────────
  MENU_POKEDEX: ['Pokédex', 'Pokédex'],
  MENU_BAG: ['Túi đồ', 'Bag'],
  MENU_TEAM: ['Đội hình', 'Party'],
  MENU_PC: ['PC Box', 'PC Box'],
  MENU_MAP: ['Bản đồ', 'Map'],
  MENU_GPS: ['GPS / Minimap', 'GPS / Minimap'],
  MENU_DEBUG: ['Debug (F3)', 'Debug (F3)'],
  MENU_SETTINGS: ['Cài đặt', 'Settings'],
  MENU_HELP: ['Hướng dẫn', 'Help'],
  MENU_LOGOUT: ['Đăng xuất', 'Logout'],
  TOOLS_TITLE: ['SELECT TOOLS', 'SELECT TOOLS'],
  TOOL_BAG: ['Vật phẩm & Thuốc', 'Items & Medicine'],
  TOOL_TEAM: ['Đội hình Pokémon', 'Pokemon Party'],
  TOOL_POKEDEX: ['Bách khoa Pokémon', 'Pokemon Encyclopedia'],
  TOOL_PC: ['Kho lưu trữ PC Box', 'PC Box storage'],
  TOOL_MAP: ['Bản đồ khu vực', 'Area map'],
  TOOL_GPS: ['Minimap / GPS', 'Minimap / GPS'],
  TOOL_SETTINGS: ['Cài đặt hệ thống', 'System settings'],
  TOOL_HELP: ['Hướng dẫn phím tắt', 'Shortcut guide'],
  TOOL_DEBUG: ['Bảng điều khiển Debug', 'Debug control panel'],
  TOOL_LOGOUT: ['Đăng xuất tài khoản', 'Log out'],

  // ── ChatLog ─────────────────────────────────────────────────────────────
  CHAT_TITLE: ['💬 TRÒ CHUYỆN', '💬 CHAT'],
  CHAT_WELCOME: ['--- Chào mừng đến với Pixelmon! ---', '--- Welcome to Pixelmon! ---'],
  CHAT_PLACEHOLDER: ['Nhắn tin...', 'Type a message...'],
  CHAT_PLACEHOLDER_DEBUG: ['Nhắn tin hoặc gõ lệnh /help...', 'Type a message or /help...'],
  CHAT_CMD_DENIED: ['[debug] Bạn cần quyền moderator trở lên để dùng lệnh này.', '[debug] Moderator+ access required for this command.'],
  CHAT_CMD_DENIED_PREFIX: ['[debug] Lệnh chỉ dành cho moderator. Đây là chat thường — không gửi lệnh debug.', '[debug] Moderator only. This is normal chat — debug commands are not sent.'],

  // ── InfoPanel ───────────────────────────────────────────────────────────
  INFO_WEATHER: ['🌤 THỜI TIẾT', '🌤 WEATHER'],
  INFO_POKE: ['Poke', 'Poke'],
  INFO_REAL: ['Real', 'Real'],

  // ── PlayerHud ───────────────────────────────────────────────────────────
  PLAYER_TITLE: ['👤 NHÂN VẬT', '👤 PLAYER'],
  PLAYER_TRAINER: ['Trainer', 'Trainer'],

  // ── ConfirmModal ────────────────────────────────────────────────────────
  CONFIRM_TITLE: ['⚠ XÁC NHẬN', '⚠ CONFIRM'],
  CONFIRM_OK: ['Xác nhận', 'Confirm'],
  CONFIRM_CANCEL: ['Huỷ', 'Cancel'],
  CONFIRM_DEFAULT_MSG: [
    'Bạn có chắc chắn muốn thực hiện hành động này?',
    'Are you sure you want to perform this action?',
  ],

  // ── HelpModal ───────────────────────────────────────────────────────────
  HELP_TITLE: ['❓ HƯỚNG DẪN ĐIỀU KHIỂN', '❓ CONTROLS GUIDE'],
  HELP_KEYBOARD: ['⌨ PHÍM TẮT BÀN PHÍM (KEYBOARD):', '⌨ KEYBOARD SHORTCUTS:'],
  HELP_MOUSE: ['🖱 THAO TÁC CHUỘT & CẢM ỨNG (MOUSE & TOUCH):', '🖱 MOUSE & TOUCH:'],
  HELP_GOT_IT: ['✔ ĐÃ HIỂU [H]', '✔ GOT IT [H]'],
  HELP_KB_MOVE: ['Di chuyển nhân vật trong thế giới', 'Move character in the world'],
  HELP_KB_ENTER: ['Mở / Gửi tin nhắn vào khung chat', 'Open / send chat message'],
  HELP_KB_P: ['Ẩn / hiện Đội hình Pokémon (Party)', 'Toggle Pokemon Party'],
  HELP_KB_B: ['Mở / đóng Hộp lưu trữ Pokémon (PC Box)', 'Toggle PC Box'],
  HELP_KB_M: ['Bật / tắt bản đồ thu nhỏ (Minimap)', 'Toggle Minimap'],
  HELP_KB_F3: ['Mở / đóng Panel Debug & Thông số Map, Toạ độ', 'Toggle Debug panel & Map info'],
  HELP_KB_H: ['Bật / tắt bảng hướng dẫn này', 'Toggle this guide'],
  HELP_KB_ESC: ['Mở bảng Cài đặt hệ thống', 'Open system settings'],
  HELP_MOUSE_LMB: ['Đi tới vị trí ô được chỉ định (Click-to-move)', 'Move to clicked tile (click-to-move)'],
  HELP_MOUSE_MMB: ['Kéo di chuyển góc nhìn camera tự do', 'Drag to pan camera freely'],
  HELP_MOUSE_WHEEL: ['Thu phóng thế giới (khi bật trong Cài đặt)', 'Zoom world (when enabled in Settings)'],

  // ── DebugModal ──────────────────────────────────────────────────────────
  DEBUG_TITLE: ['🛠 BẢNG ĐIỀU KHIỂN DEBUG', '🛠 DEBUG CONTROL PANEL'],
  DEBUG_TAB_INFO: ['📊 THÔNG TIN HỆ THỐNG', '📊 SYSTEM INFO'],
  DEBUG_TAB_FEATURES: ['⚙️ BẬT / TẮT TÍNH NĂNG', '⚙️ FEATURES'],
  HELP_ACC_INFO: [
    '• Để đăng xuất nhanh: Nhấp vào biểu tượng 🚪 Đăng xuất trên thanh công cụ trên cùng.\n• Phím tắt mở cài đặt: Bấm phím [Esc] hoặc biểu tượng ⚙ trên thanh công cụ.',
    '• To log out quickly: click the 🚪 Logout icon on the top toolbar.\n• Shortcut to open settings: press [Esc] or the ⚙ icon on the toolbar.',
  ],

  // ── DebugModal ─────────────────────────────────────────────────────────
  DEBUG_CARD_MAP: ['🗺 BẢN ĐỒ HIỆN TẠI', '🗺 CURRENT MAP'],
  DEBUG_CARD_PLAYER: ['🚶 NHÂN VẬT & TOẠ ĐỘ', '🚶 PLAYER & COORDS'],
  DEBUG_CARD_COORD: ['🐭 TOẠ ĐỘ & CAMERA', '🐭 COORDS & CAMERA'],
  DEBUG_CARD_PERF: ['⚡ HIỆU NĂNG & SERVER', '⚡ PERFORMANCE & SERVER'],
  DEBUG_LOADING_MAP: ['Đang tải thông tin map...', 'Loading map info...'],
  DEBUG_LOADING_PLAYER: ['Đang tải toạ độ player...', 'Loading player coords...'],
  DEBUG_PIN: ['📌 Ghim', '📌 Pin'],
  DEBUG_PINNED: ['📌 Đã ghim', '📌 Pinned'],
  DEBUG_SEC_TOOLS: ['🛠 BẬT / TẮT CÔNG CỤ & OVERLAY', '🛠 TOOLS & OVERLAYS'],
  DEBUG_SEC_TELEPORT: ['🚀 TELEPORT NHANH ĐẾN BẢN ĐỒ', '🚀 QUICK TELEPORT'],
  DEBUG_SEC_SPEED: ['⚡ TỐC ĐỘ DI CHUYỂN', '⚡ MOVE SPEED'],
  DBG_CHK_GRID: ['Lưới toạ độ ô (Grid 32px)', 'Tile coordinate grid (32px)'],
  DBG_DESC_GRID: ['Vẽ khung lưới 32×32 pixel trên bản đồ', 'Draw 32×32 grid over the map'],
  DBG_CHK_COLLISION: ['Vùng va chạm (Collision)', 'Collision overlay'],
  DBG_DESC_COLLISION: ['Tô màu ô chặn (đỏ), nước (lam), cỏ (lục)', 'Color blocked (red), water (blue), grass (green)'],
  DBG_CHK_WARP: ['Điểm chuyển map (Warp)', 'Map warp points'],
  DBG_DESC_WARP: ['Đánh dấu các cửa ra vào và cổng map', 'Mark doors and map gates'],
  DBG_CHK_NOCLIP: ['Đi xuyên tường (NOCLIP)', 'No-clip (NOCLIP)'],
  DBG_DESC_NOCLIP: ['Đi xuyên qua mọi chướng ngại vật & nước', 'Walk through all obstacles & water'],
  DBG_CHK_CONSOLE: ['Khung lệnh (Debug Console)', 'Command console'],
  DBG_DESC_CONSOLE: ['Mở cửa sổ nhập lệnh debug bên phải', 'Open debug command window on the right'],
  DBG_CHK_TRACKER: ['Bảng Tracker & Noclip (HUD)', 'Tracker & Noclip HUD'],
  DBG_DESC_TRACKER: ['Mở widget nhỏ tracking toạ độ chuột góc màn hình', 'Open mouse coordinate widget'],
  DBG_CHK_GROUND: ['Lớp Nền (Ground Layer)', 'Ground layer'],
  DBG_DESC_GROUND: ['Bật/tắt hiển thị tầng nền của bản đồ', 'Toggle the map ground layer'],
  DBG_CHK_DECORATION: ['Lớp Trang trí (Decoration)', 'Decoration layer'],
  DBG_DESC_DECORATION: ['Bật/tắt hiển thị tầng chi tiết, đồ vật', 'Toggle decoration / objects layer'],
  DBG_CHK_OVERHEAD: ['Lớp Che trên (Overhead)', 'Overhead layer'],
  DBG_DESC_OVERHEAD: ['Bật/tắt hiển thị tầng mái nhà, ngọn cây', 'Toggle roof / treetop layer'],
  MAP_LAPPET: ['Lappet Town', 'Lappet Town'],
  MAP_ROUTE1: ['Route 1', 'Route 1'],
  MAP_PLAYER_HOUSE: ['Nhà Player', 'Player House'],
  MAP_LAB: ['Lab Pokémon', 'Pokemon Lab'],
  MAP_DAISY: ['Nhà Daisy', 'Daisy House'],

  // ── DebugModal: info card động ─────────────────────────────────────────
  DBG_MAP_MAIN: ['Tên: ', 'Name: '],
  DBG_MAP_TILESET: ['Tileset: ', 'Tileset: '],
  DBG_MAP_LAYERS: [' lớp (Ground/Decor/Overhead)', ' layers (Ground/Decor/Overhead)'],
  DBG_MAP_WARPS: [' điểm chuyển map', ' warp points'],
  DBG_MAP_ENCOUNTER: ['Encounter: ', 'Encounter: '],
  DBG_PLAYER_STATE: ['Trạng thái: ', 'Status: '],
  DBG_PLAYER_SPEED: ['Tốc độ: ', 'Speed: '],
  DBG_PLAYER_NOCLIP: [' [👻 NOCLIP ON]', ' [👻 NOCLIP ON]'],
  DBG_FPS_NOW: ['FPS Hiện tại: ', 'Current FPS: '],
  DBG_CAM_POS: ['Camera Pos: ', 'Camera Pos: '],
  DBG_ZOOM: ['Zoom: ', 'Zoom: '],
  DBG_ACTIVE_PLAYERS: ['Active Players: ', 'Active Players: '],

  DEBUG_PERF_INIT: ['FPS: --\nCamera: (0, 0)\nZoom: 1.0x', 'FPS: --\nCamera: (0, 0)\nZoom: 1.0x'],
  DEBUG_SERVER_INIT: ['Status: Connected\nRoom: --\nPing: < 15ms\nOnline: 1 player', 'Status: Connected\nRoom: --\nPing: < 15ms\nOnline: 1 player'],

  // ── DebugConsole / Tracker / InfoWidgets ───────────────────────────────
  DBG_CONSOLE_TITLE: ['💻 DEBUG CONSOLE', '💻 DEBUG CONSOLE'],
  DBG_CONSOLE_WELCOME: ['=== PIXELMON DEBUG CONSOLE ===', '=== PIXELMON DEBUG CONSOLE ==='],
  DBG_CONSOLE_HELP: ['Gõ /help để xem danh sách lệnh hỗ trợ.', 'Type /help to see the command list.'],
  DBG_CONSOLE_HINT: ['Click ô input phía dưới hoặc ấn Enter để gõ lệnh.', 'Click the input below or press Enter to type a command.'],
  DBG_CONSOLE_PLACEHOLDER: ['Nhập lệnh... (Enter để chạy, Esc để huỷ)', 'Type a command... (Enter to run, Esc to cancel)'],
  TRACKER_TITLE: ['📍 TRACKING & DEBUG', '📍 TRACKING & DEBUG'],
  TRACKER_NOCLIP: ['👻 Xuyên tường', '👻 No-clip'],
  TRACKER_NOCLIP_ON: ['Đang tắt: xám đậm viền nhẹ', 'Off: dimmed border'],
  WIDGET_MAP: ['🗺 BẢN ĐỒ (MAP)', '🗺 MAP'],
  WIDGET_PLAYER: ['🚶 NHÂN VẬT (PLAYER)', '🚶 PLAYER'],
  WIDGET_COORD: ['🐭 TOẠ ĐỘ & CHUỘT', '🐭 COORDS & MOUSE'],
  WIDGET_PERF: ['⚡ HIỆU NĂNG & SERVER', '⚡ PERFORMANCE & SERVER'],
  WDG_COORD: ['Toạ độ: Ô [', 'Coords: Tile ['],
  WDG_PIXEL: ['Pixel: (', 'Pixel: ('],
  WDG_DIR: ['Hướng: ', 'Dir: '],
  WDG_STATE: ['Trạng thái: ', 'Status: '],
  WDG_MOUSE_TILE: ['Chuột Ô: [', 'Mouse Tile: ['],
  WDG_MOUSE_PIXEL: ['Chuột Pixel: (', 'Mouse Pixel: ('],
  WDG_ACTIVE: ['Trạng thái: Hoạt động', 'Status: Active'],
  WDG_TILE: [' | Ô: ', ' | Tile: '],

  // ── LoginScene ─────────────────────────────────────────────────────────
  LOG_DEV_ENTER: ['Đang vào...', 'Entering...'],
  LOG_REQUIRED_FIELDS: ['Vui lòng nhập đầy đủ thông tin.', 'Please fill in all fields.'],
  LOG_SIGNING_IN: ['Đang đăng nhập…', 'Signing in...'],
  LOG_NO_SERVER: ['Không thể kết nối server.', 'Cannot connect to server.'],
  LOG_ENTER_GAME: ['Vào game', 'Enter game'],
  LOG_SPRITE_DEFAULT: ['<span style="font-size:12px; color:#a0aec0;">Mặc định</span>', '<span style="font-size:12px; color:#a0aec0;">Default</span>'],
  LOG_USER_MIN3: ['Tên đăng nhập tối thiểu 3 ký tự.', 'Username must be at least 3 characters.'],
  LOG_PASS_MIN6: ['Mật khẩu tối thiểu 6 ký tự.', 'Password must be at least 6 characters.'],
  LOG_PASS_MISMATCH: ['Mật khẩu xác nhận không khớp.', 'Password confirmation does not match.'],
  LOG_CREATING: ['Đang tạo tài khoản…', 'Creating account...'],
  LOG_REGISTER_FAIL: ['Đăng ký thất bại.', 'Registration failed.'],
  LOG_CREATE_ACCOUNT: ['Tạo tài khoản', 'Create account'],
  LOG_SERVER_RETRY: ['Không thể kết nối server. Thử lại sau.', 'Cannot connect to server. Try again later.'],

  // ── PcBoxModal ──────────────────────────────────────────────────────────
  PC_TITLE: ['🖥️ HỘP LƯU TRỮ POKÉMON (PC BOX)', '🖥️ POKÉMON STORAGE (PC BOX)'],
  PC_BOX_LABEL: ['HỘP ', 'BOX '],
  PC_PARTY_TITLE: ['ĐỘI HÌNH', 'PARTY'],
  PC_SLOT_EMPTY: ['+ Trống', '+ Empty'],
  PC_PREVIEW_NONE: ['Chọn một Pokémon\nđể thao tác', 'Select a Pokémon\nto act on'],
  PC_LEVEL_LABEL: ['Cấp ', 'Lv. '],
  PC_SRC_PARTY: ['Đội hình', 'Party'],
  PC_SRC_BOX: ['Kho lưu trữ', 'Storage'],
  PC_BTN_WITHDRAW: ['📤 Rút về Đội', '📤 Withdraw to Party'],
  PC_BTN_PARTY_FULL: ['❌ Đội đã đầy 6/6', '❌ Party is full 6/6'],
  PC_BTN_DEPOSIT: ['📥 Gửi vào Box', '📥 Send to Box'],
  PC_BTN_KEEP_ONE: ['❌ Giữ ít nhất 1 con', '❌ Keep at least 1'],
  PC_BTN_DETAIL: ['🔍 Xem chi tiết', '🔍 View details'],
  PC_BTN_RELEASE: ['🗑 Thả Pokémon', '🗑 Release Pokémon'],
  PC_ERR_WITHDRAW: ['Không thể rút Pokémon!', 'Cannot withdraw Pokémon!'],
  PC_ERR_DEPOSIT: ['Không thể gửi Pokémon!', 'Cannot deposit Pokémon!'],
  PC_ERR_RELEASE: ['Không thể thả Pokémon!', 'Cannot release Pokémon!'],
  PC_CONFIRM_RELEASE: [
    'Bạn có chắc muốn thả {name} về tự nhiên?',
    'Are you sure you want to release {name} into the wild?',
  ],

  // ── PokemonSummaryModal ─────────────────────────────────────────────────
  SUMMARY_TITLE: ['📜 THÔNG TIN POKÉMON', '📜 POKÉMON INFO'],
  SUMMARY_TITLE_NAMED: ['📜 POKÉMON: {name} (Lv.{level})', '📜 POKÉMON: {name} (Lv.{level})'],
  SUMMARY_TAB_INFO: ['📌 TỔNG QUAN', '📌 OVERVIEW'],
  SUMMARY_TAB_STATS: ['📊 CHỈ SỐ', '📊 STATS'],
  SUMMARY_TAB_MOVES: ['⚔ CHIÊU THỨC', '⚔ MOVES'],
  SUMMARY_CRY: ['🔊 Tiếng kêu', '🔊 Cry'],
  SUMMARY_HP: ['HP: {cur} / {max}', 'HP: {cur} / {max}'],
  SUMMARY_EXP: ['EXP: {cur} / {next}', 'EXP: {cur} / {next}'],
  SUMMARY_SPECIES: ['Loài: {id}', 'Species: {id}'],
  SUMMARY_LOCATION_PARTY: ['Vị trí: Đội hình (#{n})', 'Location: Party (#{n})'],
  SUMMARY_LOCATION_BOX: ['Vị trí: PC Box', 'Location: PC Box'],
  SUMMARY_STATUS_NORMAL: ['Trạng thái: Bình thường', 'Status: Normal'],
  SUMMARY_STATUS_VALUE: ['Trạng thái: {status}', 'Status: {status}'],
  SUMMARY_NATURE: ['Bản tính: {name}', 'Nature: {name}'],
  SUMMARY_NATURE_MOD: ['Bản tính: {name} (+{inc}, -{dec})', 'Nature: {name} (+{inc}, -{dec})'],
  SUMMARY_NATURE_NEUTRAL: ['Bản tính: {name} (Cân bằng)', 'Nature: {name} (Neutral)'],
  SUMMARY_EMPTY_SLOT: ['— Ô Trống —', '— Empty Slot —'],
  SUMMARY_CAT_PHYSICAL: ['⚔ Vật lý', '⚔ Physical'],
  SUMMARY_CAT_SPECIAL: ['✨ Đặc biệt', '✨ Special'],
  SUMMARY_CAT_STATUS: ['🌀 Biến hoá', '🌀 Status'],
  SUMMARY_POWER: ['Sức mạnh: {v}', 'Power: {v}'],
  SUMMARY_POWER_NONE: ['Sức mạnh: —', 'Power: —'],
  SUMMARY_ACCURACY: ['Chính xác: {v}%', 'Accuracy: {v}%'],
  SUMMARY_ACCURACY_NONE: ['Chính xác: —', 'Accuracy: —'],
  SUMMARY_PP: ['PP: {cur} / {max}', 'PP: {cur} / {max}'],

  // ── WorldScene: debug console / chat ───────────────────────────────────
  WS_NEED_MOD: ['[debug] Cần quyền moderator trở lên để mở bảng Debug.', '[debug] Moderator+ access required to open the Debug panel.'],
  WS_MAP_NOT_FOUND: ['Không tìm thấy map: "', 'Map not found: "'],
  WS_NOCLIP_ON: ['ĐÃ BẬT', 'ON'],
  WS_NOCLIP_OFF: ['ĐÃ TẮT', 'OFF'],
  WS_NOCLIP_MODE: ['Chế độ Noclip: ', 'Noclip mode: '],
  WS_TP_MOVING: ['Đang chuyển tới map: ', 'Switching to map: '],
  WS_TELEPORT_TO: ['Teleport tới: ', 'Teleport to: '],
  WS_SPEED: ['Tốc độ di chuyển: ', 'Move speed: '],
  WS_OVERLAY_ON: ['ĐANG BẬT', 'ON'],
  WS_OVERLAY_OFF: ['ĐANG TẮT', 'OFF'],
  WS_OVERLAY_STATE: ['Overlay "', 'Overlay "'],
  WS_OVERLAY_ENABLED: ['ĐÃ BẬT', 'ENABLED'],
  WS_OVERLAY_DISABLED: ['ĐÃ TẮT', 'DISABLED'],
  WS_LAYER_ON: ['ĐANG HIỆN', 'VISIBLE'],
  WS_LAYER_OFF: ['ĐANG ẨN', 'HIDDEN'],
  WS_LAYER_STATE: ['Lớp "', 'Layer "'],
  WS_LAYER_VISIBLE: ['ĐÃ HIỆN', 'VISIBLE'],
  WS_LAYER_HIDDEN: ['ĐÃ ẨN', 'HIDDEN'],
  WS_CMD_INVALID: ['Lệnh không hợp lệ: ', 'Invalid command: '],
  WS_CMD_HELP: [' (gõ /help để xem trợ giúp)', ' (type /help for help)'],
  WS_DEBUG_ACCESS_YES: ['Có (Moderator+)', 'Yes (Moderator+)'],
  WS_DEBUG_ACCESS_NO: ['Không', 'No'],
  WS_CMD_TP: ['Cú pháp: /tp <x> <y> hoặc /tp <mapId>', 'Syntax: /tp <x> <y> or /tp <mapId>'],
  WS_CMD_SPEED: ['Cú pháp: /speed <hệ số>', 'Syntax: /speed <multiplier>'],
  WS_CMD_OVERLAY: ['Cú pháp: /overlay <grid|collision|warp> [on|off]', 'Syntax: /overlay <grid|collision|warp> [on|off]'],
  WS_CMD_LAYER: ['Cú pháp: /layer <ground|decoration|overhead> [on|off]', 'Syntax: /layer <ground|decoration|overhead> [on|off]'],

  // ── WorldScene: còn lại ─────────────────────────────────────────────────
  WS_LOGOUT_TITLE: ['⚠ XÁC NHẬN ĐĂNG XUẤT', '⚠ CONFIRM LOGOUT'],
  WS_LOGOUT_MSG: ['Bạn có chắc chắn muốn đăng xuất tài khoản và quay trở lại màn hình đăng nhập không?', 'Are you sure you want to log out and return to the login screen?'],
  WS_LOGOUT_OK: ['Đăng xuất', 'Log out'],
  WS_LOGOUT_CANCEL: ['Huỷ bỏ', 'Cancel'],
  WS_TILE_WALL: ['Chặn (Wall)', 'Blocked (Wall)'],
  WS_TILE_WATER: ['Nước (Water)', 'Water'],
  WS_TILE_NORMAL: ['Bình thường', 'Normal'],
  WS_NOCLIP_MSG_ON: ['👻 Đã BẬT chế độ đi xuyên tường (NOCLIP).', '👻 No-clip (NOCLIP) ENABLED.'],
  WS_NOCLIP_MSG_OFF: ['🚫 Đã TẮT chế độ đi xuyên tường.', '🚫 No-clip DISABLED.'],
  WS_HELP_HEADER: ['=== DANH SÁCH LỆNH DEBUG ===', '=== DEBUG COMMAND LIST ==='],
  WS_HELP_HELP: ['/help : Xem danh sách lệnh', '/help : List commands'],
  WS_HELP_MAP: ['/map : Thông tin chi tiết map hiện tại', '/map : Current map details'],
  WS_HELP_POS: ['/pos : Toạ độ chi tiết pixel & tile', '/pos : Pixel & tile coordinates'],
  WS_HELP_SERVER: ['/server : Thông tin kết nối server Colyseus', '/server : Colyseus connection info'],
  WS_HELP_TP: ['/tp <x> <y> hoặc /tp <mapId> : Teleport tức thì', '/tp <x> <y> or /tp <mapId> : Instant teleport'],
  WS_HELP_SPEED: ['/speed <hệ số> : Đổi tốc độ di chuyển (1 -> 5)', '/speed <mult> : Change move speed (1 -> 5)'],
  WS_HELP_NOCLIP: ['/noclip [on|off] : Bật/tắt chế độ đi xuyên tường', '/noclip [on|off] : Toggle no-clip mode'],
  WS_HELP_OVERLAY: ['/overlay <grid|collision|warp> [on|off] : Bật/tắt overlay', '/overlay <grid|collision|warp> [on|off] : Toggle overlay'],
  WS_HELP_LAYER: ['/layer <ground|decoration|overhead> [on|off] : Bật/tắt tầng tilemap', '/layer <ground|decoration|overhead> [on|off] : Toggle tilemap layer'],
  WS_HELP_CLEAR: ['/clear : Xoá trắng cửa sổ console', '/clear : Clear console window'],
  WS_HELP_SPAWN: ['/spawn [số Pokédex] : Gọi trận wild (bỏ trống = ngẫu nhiên)', '/spawn [dexNum] : Trigger a wild battle (empty = random)'],
  WS_HELP_SPAWN_USAGE: ['/spawn <số 1..1025> | /spawn | /spawn random', '/spawn <1..1025> | /spawn | /spawn random'],
  WS_HELP_NO_ARGS: ['/spawn không có tham số → chọn ngẫu nhiên từ bảng encounter của map.', '/spawn with no argument → random from this map encounter table.'],

  // ── DebugTrackerWidget / DebugConsole / TopMenu / LoginScene ───────────
  TRK_MOUSE_INIT: ['🐭 Chuột: [--, --] (0, 0)', '🐭 Mouse: [--, --] (0, 0)'],
  TRK_NOCLIP_OFF: ['👻 Xuyên tường: TẮT', '👻 No-clip: OFF'],
  TRK_NOCLIP_ON: ['👻 Xuyên tường: [ĐANG BẬT]', '👻 No-clip: [ON]'],
  DBG_CONSOLE_INPUT: ['Gõ lệnh debug (VD: /help, /map, /pos, /tp)...', 'Type a debug command (e.g. /help, /map, /pos, /tp)...'],
  LOG_SPRITES_LOAD_FAIL: ['Không thể tải danh sách', 'Failed to load list'],

  LAYER_GROUND: ['Nền', 'Ground'],
  LAYER_DECORATION: ['Trang trí', 'Decoration'],
  LAYER_OVERHEAD: ['Che trên', 'Overhead'],
  AUTH_BAD_CREDENTIALS: ['Sai tên đăng nhập hoặc mật khẩu', 'Wrong username or password'],
  AUTH_SERVER_ERR: ['Lỗi server', 'Server error'],

  HELP_KEY_KB_MOVE: ['W, A, S, D / Phím mũi tên', 'W, A, S, D / Arrow keys'],
  HELP_KEY_ENTER: ['Enter', 'Enter'],
  HELP_KEY_P: ['P', 'P'],
  HELP_KEY_B: ['B', 'B'],
  HELP_KEY_M: ['M', 'M'],
  HELP_KEY_F3: ['F3  hoặc  F2', 'F3  or  F2'],
  HELP_KEY_H: ['H  hoặc nút  ?', 'H  or  ? button'],
  HELP_KEY_ESC: ['Esc  hoặc nút  ⚙', 'Esc  or  ⚙ button'],
  HELP_KEY_LMB: ['Chuột trái / Touch (LMB)', 'Left click / Touch (LMB)'],
  HELP_KEY_MMB: ['Chuột giữa / Shift + Kéo', 'Middle click / Shift + Drag'],
  HELP_KEY_WHEEL: ['Con lăn chuột (Wheel)', 'Mouse wheel'],

  RENDER_RELOAD_ON: ['ℹ Đã bật Anti-aliasing — chữ sắc nét hơn. Áp dụng khi tải lại game (F5).', 'ℹ Anti-aliasing enabled — crisper text. Takes effect after reload (F5).'],
  RENDER_RELOAD_OFF: ['ℹ Đã tắt Anti-aliasing — giữ nét pixel gốc. Áp dụng khi tải lại game (F5).', 'ℹ Anti-aliasing disabled — original pixel edges. Takes effect after reload (F5).'],

  // ── Battle (Plan 44 Phase 3) ─────────────────────────────────────────────
  BATTLE_TITLE: ['⚔ TRẬN ĐẤU', '⚔ BATTLE'],
  BATTLE_BACK: ['← Quay lại', '← Back'],
  BATTLE_FIGHT: ['⚔ ĐÁNH', '⚔ FIGHT'],
  BATTLE_POKÉMON: ['🎒 ĐỘI HÌNH', '🎒 POKÉMON'],
  BATTLE_RUN: ['🏃 CHẠY', '🏃 RUN'],
  BATTLE_BAG: ['🎒 TÚI ĐỒ', '🎒 BAG'],
  BATTLE_CHOOSE_MOVE: ['Chọn chiêu thức:', 'Choose a move:'],
  BATTLE_CHOOSE_POKÉMON: ['Chọn Pokémon tiếp theo:', 'Choose your next Pokémon:'],
  BATTLE_NO_PP: ['Hết PP!', 'No PP left!'],
  BATTLE_VICTORY: ['🏆 CHIẾN THẮNG!', '🏆 VICTORY!'],
  BATTLE_DEFEAT: ['💀 THUA TRẬN...', '💀 DEFEAT...'],
  BATTLE_CAUGHT: ['✨ ĐÃ BẮT ĐƯỢC!', '✨ CAUGHT!'],
  BATTLE_FLED: ['🏃 Đã chạy thoát.', '🏃 Got away safely.'],
  BATTLE_EXP_GAINED: ['Nhận được {exp} EXP!', 'Gained {exp} EXP!'],
  BATTLE_OK: ['OK', 'OK'],
  BATTLE_YOUR: ['Your', 'Your'],
  BATTLE_WILD: ['Wild', 'Wild'],
  BATTLE_USE_BALL: ['Ném {ball}!', 'Throw {ball}!'],
  BATTLE_NO_ITEMS: ['Không có vật phẩm trong trận này!', 'No items in this battle!'],
  BATTLE_BALL: ['🔮 BẮT', '🔮 BALL'],
  BATTLE_CONNECTION_FAILED: ['Không kết nối được trận đấu...', 'Battle connection failed...'],
  BATTLE_TURN: ['Lượt', 'Turn'],
  BATTLE_SUPER_EFFECTIVE: ['Rất hiệu quả!', 'Super effective!'],
  BATTLE_CRITICAL_HIT: ['Đòn đánh chí mạng!', 'Critical hit!'],
  BATTLE_MISSED: ['Trượt rồi!', 'Missed!'],

} as const satisfies Record<string, Entry>;

export type I18nKey = keyof typeof MESSAGES;

// ── Trạng thái ngôn ngữ ────────────────────────────────────────────────────

let current: Lang = DEFAULT_LANG;
const listeners = new Set<(lang: Lang) => void>();

/** Khởi tạo ngôn ngữ từ localStorage (gọi 1 lần khi app boot). */
export function initLang(): void {
  try {
    const raw = localStorage.getItem('pixelmon.settings');
    const parsed = raw ? (JSON.parse(raw) as { system?: { lang?: Lang } }) : null;
    const lang = parsed?.system?.lang;
    if (lang === 'vi' || lang === 'en') current = lang;
  } catch {
    // bỏ qua — dùng mặc định
  }
}

export function getLang(): Lang {
  return current;
}

/** Đổi ngôn ngữ + lưu localStorage + thông báo cho toàn bộ UI. */
export function setLang(lang: Lang): void {
  if (lang !== 'vi' && lang !== 'en') return;
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem('pixelmon.lang', lang);
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn(lang));
}

/** Đăng ký callback khi đổi ngôn ngữ. Trả về hàm huỷ đăng ký. */
export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tra chuứi theo ngôn ngữ hiện tại. */
export function t(key: I18nKey): string {
  const entry = MESSAGES[key];
  if (!entry) return key;
  return current === 'en' ? entry[1] : entry[0];
}

const KEY_SET: ReadonlySet<string> = new Set(Object.keys(MESSAGES));

/** Kiểm tra một chuỗi có phải key i18n hợp lệ không. */
export function isI18nKey(s: string): s is I18nKey {
  return KEY_SET.has(s);
}

// ── Gắn text object vào key (tự cập nhật khi đổi ngôn ngữ) ───────────────

import type Phaser from 'phaser';

const bound = new Map<Phaser.GameObjects.Text, I18nKey>();

/**
 * Gắn một `Phaser.GameObjects.Text` vào một key i18n.
 * Text sẽ tự động `setText` lại khi đổi ngôn ngữ — không cần dựng lại panel.
 */
export function tr(
  obj: Phaser.GameObjects.Text,
  key: I18nKey,
): Phaser.GameObjects.Text {
  bound.set(obj, key);
  obj.setText(t(key));
  return obj;
}

/** Cập nhật lại toàn bộ text object đã gắn (gọi tự động khi đổi ngôn ngữ). */
export function refreshBoundTexts(): void {
  bound.forEach((key, obj) => {
    if (!obj.scene) {
      bound.delete(obj);
      return;
    }
    obj.setText(t(key));
  });
}

// Tự động cập nhật mọi text đã gắn mỗi khi đổi ngôn ngữ.
onLangChange(() => refreshBoundTexts());

/**
 * Tạo `Phaser.GameObjects.Text` từ key i18n (tự cập nhật khi đổi ngôn ngữ)
 * hoặc từ chuỗi thô (symbol, số, tên riêng — không cần dịch).
 */
export function mkText(
  scene: Phaser.Scene,
  keyOrText: I18nKey | string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  x = 0,
  y = 0,
): Phaser.GameObjects.Text {
  const txt = scene.add.text(x, y, '', style);
  if (isI18nKey(keyOrText)) {
    tr(txt, keyOrText);
  } else {
    txt.setText(keyOrText);
  }
  return txt;
}
