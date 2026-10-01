// i18n — English / Vietnamese cho trang admin + trang chủ.
// Mặc định: 'en'. Người dùng đổi bằng nút EN/VI (lưu localStorage).
(function () {
  'use strict';

  var MESSAGES = {
    // ── Common ──
    'app.title': ['Pixelmon Admin', 'Pixelmon Quản trị'],
    'common.error': ['Error', 'Lỗi'],
    'common.loading': ['Loading…', 'Đang tải…'],
    'btn.save': ['Save', 'Lưu'],
    'btn.cancel': ['Cancel', 'Hủy'],
    'btn.create': ['Create', 'Tạo'],
    'btn.delete': ['Delete', 'Xóa'],
    'btn.edit': ['Edit', 'Sửa'],
    'btn.login': ['Login', 'Đăng nhập'],
    'btn.logout': ['Logout', 'Đăng xuất'],
    'btn.refresh': ['Refresh', 'Làm mới'],
    'btn.backHome': ['← Home', '← Trang chủ'],

    // ── Login ──
    'login.title': ['Pixelmon Admin', 'Pixelmon Quản trị'],
    'login.subtitle': [
      'Sign in with an administrator account',
      'Đăng nhập bằng tài khoản quản trị viên',
    ],
    'login.username': ['Username', 'Tên đăng nhập'],
    'login.password': ['Password', 'Mật khẩu'],
    'login.submit': ['Sign in', 'Đăng nhập'],
    'login.loggingIn': ['Signing in…', 'Đang đăng nhập…'],
    'login.notAdmin': [
      'Only admin accounts can access the admin panel.',
      'Chỉ tài khoản admin mới được truy cập trang quản trị.',
    ],
    'login.banned': [
      'Your account has been banned. Contact an administrator.',
      'Tài khoản đã bị khóa. Liên hệ quản trị viên.',
    ],
    'login.fillAll': ['Please fill in all fields.', 'Vui lòng nhập đầy đủ.'],
    'login.connectFail': ['Cannot connect to server.', 'Không kết nối server.'],

    // ── Denied ──
    'denied.title': ['Access denied', 'Không có quyền truy cập'],
    'denied.body': [
      'Only accounts with the Admin role can access this panel.',
      'Chỉ tài khoản có quyền Admin mới vào được trang quản trị.',
    ],
    'denied.back': ['← Home', '← Trang chủ'],

    // ── Views ──
    'view.overview': ['Overview', 'Tổng quan'],
    'view.overview.sub': ['Current system status', 'Tình trạng hệ thống hiện tại'],
    'view.users': ['Players', 'Người chơi'],
    'view.users.sub': ['Search, pagination, CRUD, roles', 'Tìm kiếm, phân trang, CRUD, phân quyền'],
    'view.pokemon': ['Pokémon', 'Pokémon'],
    'view.pokemon.sub': ['Caught Pokémon', 'Pokémon đã được bắt'],
    'view.players': ['Locations', 'Vị trí'],
    'view.players.sub': ['Current player locations', 'Vị trí hiện tại của người chơi'],
    'view.sprites': ['Sprite Library', 'Thư viện Sprite'],
    'view.sprites.sub': [
      'Upload, align and export character sheets',
      'Upload, căn khung và xuất sheet nhân vật',
    ],

    // ── Sprites ──
    'sp.title': ['Character sprite library', 'Thư viện Sprite nhân vật'],
    'sp.create': ['+ New sprite', '+ Tạo sprite mới'],
    'sp.hint': [
      'Upload a complete sheet (12 frames: 4 directions × 3 frames) or upload individual slices, ' +
        'align them into the fixed frame grid, then export a 384×32 sheet for the game.',
      'Upload sheet hoàn chỉnh (12 frame: 4 hướng × 3 frame) hoặc upload từng lát, điều chỉnh vào ' +
        'khung sẵn rồi xuất ra sheet 384×32 cho game.',
    ],
    'sp.colPreview': ['Preview', 'Xem trước'],
    'sp.colName': ['Name', 'Tên'],
    'sp.colMode': ['Type', 'Loại'],
    'sp.colSize': ['Frame', 'Khung'],
    'sp.colCreated': ['Created', 'Ngày tạo'],
    'sp.colActions': ['Actions', 'Thao tác'],
    'sp.name': ['Sprite name', 'Tên sprite'],
    'sp.mode': ['Output type', 'Loại đầu ra'],
    'sp.modeBaked': ['Baked — export baked sheet PNG', 'Baked — xuất sheet PNG đã ghép'],
    'sp.modeAtlas': [
      'Atlas — keep original image + coordinates file',
      'Atlas — giữ ảnh gốc + file toạ độ',
    ],
    'sp.frameW': ['Frame width', 'Chiều rộng khung'],
    'sp.frameH': ['Frame height', 'Chiều cao khung'],
    'sp.frameCount': ['Frames in sheet', 'Số frame trong sheet'],
    'sp.fc12': [
      '12 frames — horizontal strip 384×32 (3 per direction)',
      '12 frame — dải ngang 384×32 (3 frame/hướng)',
    ],
    'sp.fc16': [
      '16 frames — 4×4 grid 256×256 (4 per direction)',
      '16 frame — lưới 4×4 256×256 (4 frame/hướng)',
    ],
    'sp.edit': ['Edit sprite', 'Sửa sprite'],
    'sp.upload': ['Source image', 'Ảnh gốc'],
    'sp.uploadMode': ['File layout', 'Cách đọc file'],
    'sp.readSheet': ['Full sheet (strip or 4×4 grid)', 'Sheet hoàn chỉnh (dải ngang / lưới 4×4)'],
    'sp.readSlices': ['Individual slices (1 file per frame)', 'Từng lát (mỗi file 1 frame)'],
    'sp.dropHint': [
      'Drop 12 PNG files into the cells below (4 directions × 3 frames), or click a cell to pick ' +
        'a file. Order: Down×3 → Up×3 → Left×3 → Right×3.',
      'Kéo-thả 12 file PNG vào ô bên dưới (4 hướng × 3 frame), hoặc bấm từng ô để chọn file. ' +
        'Thứ tự: Down×3 → Up×3 → Left×3 → Right×3.',
    ],
    'sp.clearSlices': ['Clear all slices', 'Xoá tất cả lát'],
    'sp.frames': ['12 frame coordinates', 'Toạ độ 12 frame'],
    'sp.frames16': ['16 frame coordinates', 'Toạ độ 16 frame'],
    'sp.resetFrames': ['Reset', 'Đặt lại'],
    'sp.colDir': ['Direction', 'Hướng'],
    'sp.colX': ['X', 'X'],
    'sp.colY': ['Y', 'Y'],
    'sp.colW': ['W', 'R'],
    'sp.colH': ['H', 'C'],
    'sp.play': ['▶ Preview', '▶ Xem trước'],
    'sp.pause': ['⏸ Pause', '⏸ Dừng'],
    'sp.export': ['Export sheet PNG', 'Xuất sheet PNG'],
    'sp.saveLib': ['Save to library', 'Lưu vào thư viện'],
    'sp.empty': ['No sprites found.', 'Chưa có sprite nào.'],
    'sp.nameRequired': ['Please enter a sprite name.', 'Vui lòng nhập tên sprite.'],
    'sp.loadError': ['Failed to load sprite.', 'Không tải được sprite.'],
    'sp.exported': ['Exported sheet PNG.', 'Đã xuất sheet PNG.'],
    'sp.confirmDelete': [
      'Are you sure you want to delete sprite "{name}"? This action cannot be undone.',
      'Bạn có chắc muốn xóa sprite "{name}"? Hành động này không thể hoàn tác.',
    ],
    'sp.dirDown': ['↓ Down', '↓ Xuống'],
    'sp.dirUp': ['↑ Up', '↑ Lên'],
    'sp.dirLeft': ['← Left', '← Trái'],
    'sp.dirRight': ['→ Right', '→ Phải'],
    'sp.dirAll': ['All', 'Tất cả'],

    // ── Overview ──
    'ov.uptime': ['Server uptime', 'Server uptime'],
    'ov.totalUsers': ['Total players', 'Tổng người chơi'],
    'ov.online': ['Online', 'Đang online'],
    'ov.totalPokemon': ['Total Pokémon', 'Tổng Pokémon'],
    'ov.permTitle': ['Permissions', 'Phân quyền'],
    'ov.sysStatus': ['System status', 'Trạng thái hệ thống'],
    'ov.recentUsers': ['Recent players', 'Người chơi mới nhất'],
    'ov.colComponent': ['Component', 'Thành phần'],
    'ov.colStatus': ['Status', 'Trạng thái'],
    'ov.colDetails': ['Details', 'Chi tiết'],
    'ov.colDisplayName': ['Display name', 'Tên hiển thị'],
    'ov.colUsername': ['Account', 'Tài khoản'],
    'ov.colRole': ['Role', 'Quyền'],
    'ov.colLevel': ['Level', 'Cấp'],
    'ov.colLastLogin': ['Last login', 'Đăng nhập gần nhất'],
    'ov.noData': ['No data yet.', 'Chưa có dữ liệu.'],

    // ── Users ──
    'u.title': ['Player management', 'Quản lý người chơi'],
    'u.createNew': ['+ New', '+ Tạo mới'],
    'u.searchPlaceholder': ['Search by name, username…', 'Tìm theo tên, username…'],
    'u.allRoles': ['All roles', 'Tất cả quyền'],
    'u.total': ['Total', 'Tổng'],
    'u.page': ['Page', 'Trang'],
    'u.colId': ['ID', 'ID'],
    'u.colUsername': ['Account', 'Tài khoản'],
    'u.colDisplayName': ['Display name', 'Tên hiển thị'],
    'u.colRole': ['Role', 'Quyền'],
    'u.colLanguage': ['Language', 'Ngôn ngữ'],
    'u.colLevel': ['Level', 'Cấp'],
    'u.colMoney': ['Money', 'Tiền'],
    'u.colSprite': ['Sprite', 'Sprite'],
    'u.colLastLogin': ['Last login', 'Đăng nhập gần nhất'],
    'u.colActions': ['Actions', 'Thao tác'],
    'u.empty': ['No users found.', 'Không tìm thấy user nào.'],
    'u.prev': ['« Prev', '« Trước'],
    'u.next': ['Next »', 'Tiếp »'],
    'u.ban': ['Ban', 'Khóa'],
    'u.unban': ['Unban', 'Gỡ khóa'],
    'u.resetPass': ['Reset password', 'Đặt lại mật khẩu'],
    'u.confirmDelete': ['Delete', 'Xóa'],
    'u.banConfirm': ['Ban', 'Khóa'],
    'u.rowSelf': ['(you)', '(bạn)'],
    'u.confirmDeleteFull': [
      'Are you sure you want to delete user "{username}"? This action cannot be undone.',
      'Bạn có chắc muốn xóa user "{username}"? Hành động này không thể hoàn tác.',
    ],
    'u.confirmBan': [
      'Ban "{username}"? The user will not be able to log in.',
      'Khóa tài khoản "{username}"? Người chơi sẽ không thể đăng nhập.',
    ],
    'u.promptResetPass': [
      'Enter new password (min 6 characters):',
      'Nhập mật khẩu mới (tối thiểu 6 ký tự):',
    ],
    'u.passTooShort': [
      'Password must be at least 6 characters.',
      'Mật khẩu phải tối thiểu 6 ký tự.',
    ],
    'u.passResetSuccess': [
      'Password reset successfully.',
      'Đã đặt lại mật khẩu thành công.',
    ],
    'u.deleteError': ['Delete failed.', 'Xóa thất bại.'],

    // ── Roles ──
    'role.player': ['Player', 'Người chơi'],
    'role.moderator': ['Moderator', 'Điều hành viên'],
    'role.admin': ['Admin', 'Quản trị'],
    'role.banned': ['Banned', 'Bị khóa'],

    // ── Languages ──
    'lang.en': ['English', 'Tiếng Anh'],
    'lang.vi': ['Vietnamese', 'Tiếng Việt'],

    // ── Modal user ──
    'm.createTitle': ['New player', 'Tạo người chơi mới'],
    'm.editTitle': ['Edit', 'Sửa'],
    'm.username': ['Username', 'Tên đăng nhập'],
    'm.displayName': ['Display name', 'Tên hiển thị'],
    'm.password': ['Password', 'Mật khẩu'],
    'm.level': ['Level', 'Cấp'],
    'm.money': ['Money', 'Tiền'],
    'm.role': ['Role', 'Quyền'],
    'm.language': ['Language', 'Ngôn ngữ'],
    'm.sprite': ['Character sprite', 'Sprite nhân vật'],
    'm.spriteDefault': ['Default (hero)', 'Mặc định (hero)'],
    'm.spriteHint': [
      'Assigned sprite appears in game for your character and other players.',
      'Sprite đã gán sẽ hiển thị trong game cho cả nhân vật của bạn và người chơi khác.',
    ],
    'm.spritePerDir': ['per dir', 'frame/hướng'],
    'm.birthday': ['Birthday', 'Ngày sinh'],
    'm.bio': ['Bio / Intro', 'Giới thiệu'],
    'm.notes': ['Admin notes', 'Ghi chú (admin)'],
    'm.bioPh': ['Personal bio / introduction…', 'Giới thiệu bản thân…'],
    'm.notesPh': ['Internal admin notes…', 'Ghi chú nội bộ…'],
    'm.hintUsername': ['3-20 chars, letters/digits/_', '3-20 ký tự, chữ/số/_'],
    'm.hintDisplayName': ['Character name', 'Tên nhân vật'],
    'm.hintPassword': ['Minimum 6 characters', 'Tối thiểu 6 ký tự'],
    'm.rolePlayerHint': ['Normal player', 'Người chơi bình thường'],
    'm.roleModHint': ['Moderator', 'Quản trị viên nhỏ'],
    'm.roleAdminHint': ['Full admin access', 'Quản trị cao nhất'],
    'm.roleBannedHint': ['Locked account', 'Bị khóa tài khoản'],
    'm.rolePlayerOption': ['Player — normal player', 'Player — người chơi bình thường'],
    'm.roleModOption': ['Moderator — moderator', 'Moderator — quản trị viên nhỏ'],
    'm.roleAdminOption': ['Admin — full admin access', 'Admin — quản trị cao nhất'],
    'm.roleBannedOption': ['Banned — locked account', 'Banned — bị khóa tài khoản'],
    'm.noSelfEdit': [
      'You cannot change your own role.',
      'Không thể thay đổi quyền của chính mình.',
    ],

    // ── Confirm modal ──
    'c.deleteTitle': ['Confirm delete', 'Xác nhận xóa'],
    'c.deleteText': ['Are you sure you want to delete', 'Bạn có chắc muốn xóa'],

    // ── Pokemon / Players ──
    'p.title': ['Caught Pokémon', 'Pokémon đã bắt'],
    'p.colId': ['ID', 'ID'],
    'p.colOwner': ['Owner', 'Chủ nhân'],
    'p.colSpecies': ['Species', 'Loài'],
    'p.colLevel': ['Level', 'Cấp'],
    'p.colTypes': ['Types', 'Hệ'],
    'p.colPartySlot': ['Party slot', 'Vị trí đội'],
    'p.colShiny': ['Shiny', 'Shiny'],
    'p.empty': ['No data yet.', 'Chưa có dữ liệu.'],
    'pl.title': ['Player locations', 'Vị trí người chơi'],
    'pl.colUsername': ['Account', 'Tài khoản'],
    'pl.colMap': ['Map', 'Map'],
    'pl.colX': ['X', 'X'],
    'pl.colY': ['Y', 'Y'],
    'pl.colDir': ['Direction', 'Hướng'],
    'pl.colLevel': ['Level', 'Cấp'],
    'pl.empty': ['No data yet.', 'Chưa có dữ liệu.'],
  };

  var LANG_KEY = 'pixelmon.lang';
  var current = localStorage.getItem(LANG_KEY) || 'en';

  function getLang() {
    return current;
  }
  function setLang(l) {
    if (l !== 'en' && l !== 'vi') return;
    current = l;
    localStorage.setItem(LANG_KEY, l);
    document.documentElement.lang = l;
    applyAll();
  }
  function t(key, params) {
    var entry = MESSAGES[key];
    var str = entry ? entry[current === 'vi' ? 1 : 0] : key;
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (k) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return str;
  }

  // Áp dụng: [data-i18n] = text, [data-i18n-ph] = placeholder, [data-i18n-title] = title
  function applyAll() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    // Custom render callbacks (admin.js đăng ký)
    if (window.__i18nCallbacks && window.__i18nCallbacks.length) {
      window.__i18nCallbacks.forEach(function (fn) {
        try {
          fn();
        } catch {
          /* ignore callback errors */
        }
      });
    }
  }

  // Gắn nút language (nếu có trong DOM)
  function wireLangToggle() {
    document.querySelectorAll('[data-lang-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setLang(btn.getAttribute('data-lang-toggle'));
      });
    });
    // Sync active state
    updateToggleUI();
  }

  function updateToggleUI() {
    document.querySelectorAll('[data-lang-toggle]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang-toggle') === current);
    });
  }

  // Export
  window.I18N = {
    t: t,
    setLang: setLang,
    getLang: getLang,
    apply: applyAll,
    onApply: function (fn) {
      if (!window.__i18nCallbacks) window.__i18nCallbacks = [];
      window.__i18nCallbacks.push(fn);
    },
    updateToggleUI: updateToggleUI,
  };

  // Init
  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.lang = current;
    wireLangToggle();
    applyAll();
  });
})();
