// Admin dashboard — login gate, role-based access, CRUD users, search + pagination
(function () {
  'use strict';

  var API = '';
  var TOKEN = localStorage.getItem('pixelmon.token') || '';
  var CURRENT_USER = null;

  // ── State ──
  var usersState = { page: 1, limit: 20, q: '', roleFilter: '', total: 0, data: [] };
  var editingUserId = null;

  // ── Roles ──
  var ROLES = [
    { value: 'player', labelKey: 'role.player', color: '#00cec9' },
    { value: 'moderator', labelKey: 'role.moderator', color: '#fdcb6e' },
    { value: 'admin', labelKey: 'role.admin', color: '#6c5ce7' },
    { value: 'banned', labelKey: 'role.banned', color: '#ff7675' },
  ];

  function t(key) {
    return window.I18N ? window.I18N.t(key) : key;
  }

  function roleBadge(role) {
    var r =
      ROLES.find(function (x) {
        return x.value === role;
      }) || ROLES[0];
    return (
      '<span class="badge" style="background:' +
      r.color +
      '22;color:' +
      r.color +
      ';">' +
      t(r.labelKey) +
      '</span>'
    );
  }

  function langLabel(lang) {
    return lang === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN';
  }

  function isAdmin() {
    return CURRENT_USER && CURRENT_USER.user && CURRENT_USER.user.role === 'admin';
  }

  // ── View metadata ──
  var VIEWS = {
    overview: { titleKey: 'view.overview', subKey: 'view.overview.sub' },
    users: { titleKey: 'view.users', subKey: 'view.users.sub' },
    pokemon: { titleKey: 'view.pokemon', subKey: 'view.pokemon.sub' },
    players: { titleKey: 'view.players', subKey: 'view.players.sub' },
    sprites: { titleKey: 'view.sprites', subKey: 'view.sprites.sub' },
  };

  // ── Sprite editor state ──
  // 12 frame = 4 hướng × 3 frame, index = dirIndex*3 + frame (khớp PlayerSprite).
  var SPRITE_DIRS = ['down', 'up', 'left', 'right'];
  var SPRITE_DIR_LABEL = ['↓ down', '↑ up', '← left', '→ right'];
  var SPRITE_FRAME_COUNT = 12;
  // Cache danh sách sprite từ thư viện (dùng cho select trong modal user).
  var spritesCache = [];
  var spriteState = {
    sourceImage: null, // HTMLImageElement đã load (nếu có)
    slices: [], // 12 HTMLImageElement|null (mode "từng lát")
    frames: [], // 12 {x,y,w,h} — toạ độ trong sourceImage
    previewTimer: null,
    previewDir: 'down',
    previewFrame: 0,
    editingId: null, // null = tạo mới
    frameCount: 12, // 12 (3f/hd, ngang) hoặc 16 (4f/hd, lưới 4×4)
  };

  // ── Helpers ──
  function $(id) {
    return document.getElementById(id);
  }
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fmtDate(v) {
    if (!v) return '—';
    var d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN');
  }
  function fmtUptime(sec) {
    sec = Math.floor(sec || 0);
    var h = Math.floor(sec / 3600),
      m = Math.floor((sec % 3600) / 60),
      s = sec % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }
  function setBadge(el, ok, okText, failText) {
    if (!el) return;
    el.className = 'badge ' + (ok ? 'badge-ok' : 'badge-warn');
    el.textContent = ok ? okText : failText;
  }
  function fillTable(tableId, emptyId, rows, renderRow) {
    var table = $(tableId),
      empty = $(emptyId);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    tbody.innerHTML = rows.map(renderRow).join('');
    if (empty) empty.classList.toggle('hidden', rows.length > 0);
  }
  function showMsg(el, text, type) {
    var colors = {
      error: 'rgba(255,118,117,0.15) #ff7675',
      ok: 'rgba(0,184,148,0.15) #00b894',
      warn: 'rgba(253,203,110,0.15) #fdcb6e',
    };
    var c = (colors[type] || colors.error).split(' ');
    el.style.display = 'block';
    el.style.background = c[0];
    el.style.color = c[1];
    el.textContent = text;
  }
  function hideMsg(el) {
    el.style.display = 'none';
  }

  // ── API helper ──
  function getJSON(path) {
    var opts = { headers: { Accept: 'application/json' } };
    if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 401) {
        logout();
        throw new Error('SESSION_EXPIRED');
      }
      if (r.status === 403) throw new Error('FORBIDDEN');
      if (!r.ok)
        return r.json().then(function (e) {
          throw new Error(e.message || 'HTTP ' + r.status);
        });
      return r.json();
    });
  }
  function postJSON(path, body, method) {
    var opts = { method: method || 'POST', headers: { 'Content-Type': 'application/json' } };
    if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
    opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 401) {
        logout();
        throw new Error('SESSION_EXPIRED');
      }
      return r.json();
    });
  }

  // ── Login / Logout ──
  function checkAuth() {
    if (!TOKEN) {
      showLogin();
      return false;
    }
    getJSON('/api/auth/me')
      .then(function (d) {
        CURRENT_USER = d;
        if (!isAdmin()) {
          showNotAdmin();
        } else {
          showApp();
        }
      })
      .catch(function (err) {
        if (err && err.message === 'FORBIDDEN') {
          showNotAdmin();
          return;
        }
        TOKEN = '';
        localStorage.removeItem('pixelmon.token');
        showLogin();
      });
  }
  function showLogin() {
    $('admin-login').classList.remove('hidden');
    $('admin-app').classList.add('hidden');
    $('admin-denied').classList.add('hidden');
  }
  function showNotAdmin() {
    $('admin-login').classList.add('hidden');
    $('admin-app').classList.add('hidden');
    $('admin-denied').classList.remove('hidden');
  }
  function showApp() {
    $('admin-login').classList.add('hidden');
    $('admin-denied').classList.add('hidden');
    $('admin-app').classList.remove('hidden');
    if (CURRENT_USER && CURRENT_USER.user) {
      $('admin-user-display').textContent =
        '👤 ' + CURRENT_USER.user.username + ' (' + (CURRENT_USER.user.role || 'admin') + ')';
    }
    loadAll();
  }
  function logout() {
    TOKEN = '';
    localStorage.removeItem('pixelmon.token');
    localStorage.removeItem('pixelmon.userId');
    CURRENT_USER = null;
    showLogin();
  }

  // ── Login form ──
  function wireLogin() {
    $('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData($('login-form'));
      var username = String(fd.get('username') || '').trim();
      var password = String(fd.get('password') || '').trim();
      if (!username || !password) {
        showMsg($('login-msg'), 'Vui lòng nhập đầy đủ.', 'error');
        return;
      }
      var btn = $('login-btn');
      btn.disabled = true;
      btn.textContent = 'Đang đăng nhập…';
      hideMsg($('login-msg'));

      postJSON('/api/auth/login', { username: username, password: password })
        .then(function (d) {
          if (d.ok && d.token) {
            TOKEN = d.token;
            localStorage.setItem('pixelmon.token', d.token);
            localStorage.setItem('pixelmon.userId', d.userId);
            if (d.role === 'banned') {
              showMsg($('login-msg'), 'Tài khoản đã bị khóa. Liên hệ admin.', 'error');
              TOKEN = '';
              localStorage.removeItem('pixelmon.token');
            } else if (d.role && d.role !== 'admin') {
              showMsg(
                $('login-msg'),
                'Chỉ tài khoản admin mới được truy cập trang quản trị.',
                'error',
              );
            } else {
              checkAuth();
            }
          } else {
            showMsg($('login-msg'), d.message || 'Đăng nhập thất bại.', 'error');
          }
        })
        .catch(function (err) {
          showMsg($('login-msg'), err.message || 'Không kết nối server.', 'error');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Đăng nhập';
        });
    });
  }

  // ── Navigation ──
  function showView(name) {
    var meta = VIEWS[name] || VIEWS.overview;
    document.querySelectorAll('.nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + name);
    });
    $('view-title').textContent = t(meta.titleKey);
    $('view-sub').textContent = t(meta.subKey);
    if (name === 'users') loadUsers();
    if (name === 'pokemon') loadPokemon();
    if (name === 'players') loadPlayers();
    if (name === 'sprites') loadSprites();
    if (name === 'overview') loadOverview();
  }

  // ── Overview ──
  function loadOverview() {
    getJSON('/health')
      .then(function (d) {
        $('kpi-uptime').textContent = fmtUptime(d.uptime);
        setBadge($('server-status'), true, 'đang hoạt động', 'ngoại tuyến');
        setBadge($('badge-http'), true, 'OK', 'lỗi');
        $('detail-http').textContent = 'uptime ' + fmtUptime(d.uptime);
      })
      .catch(function () {
        setBadge($('server-status'), false, 'ngoại tuyến');
        setBadge($('badge-http'), false, 'lỗi');
      });

    getJSON('/api/admin/status')
      .then(function (d) {
        setBadge($('badge-db'), !!d.database, 'OK', 'lỗi');
        $('detail-db').textContent = d.database || 'lỗi';
        setBadge($('badge-redis'), !!d.redis, 'OK', 'lỗi');
        $('detail-redis').textContent = d.redis || 'lỗi';
        if (typeof d.userCount === 'number') $('kpi-users').textContent = d.userCount;
        if (typeof d.pokemonCount === 'number') $('kpi-pokemon').textContent = d.pokemonCount;

        // Hiển thị role counts
        if (d.roleCounts) {
          var html = '';
          ROLES.forEach(function (r) {
            html +=
              '<div class="stat-item">' +
              t(r.labelKey) +
              ': <strong style="color:' +
              r.color +
              ';">' +
              (d.roleCounts[r.value] || 0) +
              '</strong></div>';
          });
          var el = $('role-stats');
          if (el) el.innerHTML = html;
        }
      })
      .catch(function () {
        setBadge($('badge-db'), false, 'lỗi');
        setBadge($('badge-redis'), false, 'lỗi');
      });

    getJSON('/api/admin/users?limit=5&sort=created_at')
      .then(function (d) {
        fillTable('recent-users-table', 'recent-users-empty', d.users || [], function (u) {
          return (
            '<tr><td>' +
            esc(u.displayName) +
            '</td><td class="dim">' +
            esc(u.username) +
            '</td><td>' +
            roleBadge(u.role) +
            '</td><td class="mono">' +
            esc(u.level) +
            '</td><td class="dim">' +
            fmtDate(u.lastLoginAt) +
            '</td></tr>'
          );
        });
      })
      .catch(function () {});
  }

  // ── Sprite helpers (dùng bởi bảng users + modal user) ──
  /** Ô hiển thị sprite đã gán (thumb + tên), hoặc "mặc định" nếu chưa gán. */
  function spriteCell(u) {
    if (u.sprite && u.sprite.sheetUrl) {
      return (
        '<div class="sprite-thumb-cell" title="' +
        esc(u.sprite.name) +
        '"><img src="' +
        esc(u.sprite.sheetUrl) +
        '" alt="" /><span class="sprite-name dim">' +
        esc(u.sprite.name) +
        '</span></div>'
      );
    }
    return '<span class="dim">—</span>';
  }

  /** Load (và cache) danh sách sprite từ thư viện — cho select trong modal user. */
  function ensureSprites() {
    return getJSON('/api/admin/sprites')
      .then(function (d) {
        spritesCache = (d.sprites || []).filter(function (s) {
          return s.sheetUrl; // chỉ sprite có sheet dùng được trong game
        });
        return spritesCache;
      })
      .catch(function () {
        spritesCache = [];
        return spritesCache;
      });
  }

  /** Điền <select id="user-sprite"> từ cache + chọn đúng spriteId. */
  function fillSpriteSelect(selectedId) {
    var sel = $('user-sprite');
    if (!sel) return;
    var html = '<option value="">' + esc(t('m.spriteDefault')) + '</option>';
    spritesCache.forEach(function (s) {
      html +=
        '<option value="' +
        esc(s.id) +
        '"' +
        (s.id === selectedId ? ' selected' : '') +
        '>' +
        esc(s.name) +
        ' (' +
        esc(s.frameW) +
        '×' +
        esc(s.frameH) +
        ' · ' +
        esc(s.frameCount) +
        'f)</option>';
    });
    sel.innerHTML = html;
    sel.value = selectedId || '';
    updateSpritePreview(sel.value);
  }

  /** Vẽ frame 0 (hướng down) của sprite đang chọn lên canvas preview. */
  function updateSpritePreview(spriteId) {
    var canvas = $('user-sprite-canvas');
    var label = $('user-sprite-label');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var s = spritesCache.find(function (x) {
      return x.id === spriteId;
    });
    if (!s || !s.sheetUrl) {
      if (label) label.textContent = t('m.spriteDefault');
      return;
    }
    var frame = s.frameW || 32;
    var perDir = Math.max(1, Math.floor((s.frameCount || 12) / 4));
    // 16 frame = lưới 4×4 (frame đầu ở (0,0)); 12 frame = dải ngang (frame 0 ở x=0).
    // Cả 2 đều lấy frame 0 → toạ độ (0,0) → vẽ frame down đầu tiên.
    var img = new Image();
    img.onload = function () {
      var zoom = Math.floor(64 / frame) || 1;
      canvas.width = frame * zoom;
      canvas.height = frame * zoom;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, frame, frame, 0, 0, frame * zoom, frame * zoom);
      if (label) label.textContent = s.name + ' · ' + perDir + 'f/' + t('m.spritePerDir');
    };
    img.src = s.sheetUrl;
  }

  // ── Users ──
  function loadUsers() {
    var q = usersState.q;
    var page = usersState.page;
    var limit = usersState.limit;
    var roleFilter = usersState.roleFilter;
    var url = '/api/admin/users?limit=' + limit + '&page=' + page + '&sort=created_at';
    if (q) url += '&q=' + encodeURIComponent(q);
    if (roleFilter) url += '&role=' + roleFilter;

    getJSON(url)
      .then(function (d) {
        usersState.data = d.users || [];
        usersState.total = d.pagination ? d.pagination.total : 0;
        var totalPages = d.pagination ? d.pagination.totalPages : 1;

        $('users-total').textContent = usersState.total;
        $('users-page-info').textContent = d.pagination
          ? d.pagination.page + '/' + totalPages
          : '1/1';

        fillTable('users-table', 'users-empty', usersState.data, function (u) {
          var isMe = CURRENT_USER && CURRENT_USER.user && CURRENT_USER.user.id === u.id;
          var isBanned = u.role === 'banned';
          var banBtn = isBanned
            ? '<button class="btn btn-sm btn-ghost btn-unban" onclick="window._adminUnban(\'' +
              u.id +
              '\')" title="Gỡ ban">🔓</button> '
            : '<button class="btn btn-sm btn-ghost btn-danger" onclick="window._adminBan(\'' +
              u.id +
              "','" +
              esc(u.username) +
              '\')" title="Ban">🚫</button> ';

          return (
            '<tr class="' +
            (isMe ? 'row-self' : '') +
            (isBanned ? ' row-banned' : '') +
            '">' +
            '<td class="mono dim" title="' +
            esc(u.id) +
            '">' +
            esc(u.id).substring(0, 8) +
            '…</td>' +
            '<td>' +
            esc(u.username) +
            '</td>' +
            '<td>' +
            esc(u.displayName) +
            '</td>' +
            '<td>' +
            roleBadge(u.role) +
            '</td>' +
            '<td>' +
            langLabel(u.language) +
            '</td>' +
            '<td class="mono">' +
            esc(u.level) +
            '</td>' +
            '<td class="mono">' +
            (u.money !== null ? Number(u.money).toLocaleString('vi-VN') : '—') +
            '</td>' +
            '<td>' +
            spriteCell(u) +
            '</td>' +
            '<td class="dim">' +
            fmtDate(u.lastLoginAt) +
            '</td>' +
            '<td class="actions">' +
            '<button class="btn btn-sm btn-ghost" onclick="window._adminEdit(\'' +
            u.id +
            '\')" title="Sửa">✎</button> ' +
            '<button class="btn btn-sm btn-ghost" onclick="window._adminPasswd(\'' +
            u.id +
            '\')" title="Reset password">🔑</button> ' +
            banBtn +
            (isMe
              ? ''
              : '<button class="btn btn-sm btn-ghost btn-danger" onclick="window._adminDelete(\'' +
                u.id +
                "','" +
                esc(u.username) +
                '\')" title="Xóa">✕</button>') +
            '</td></tr>'
          );
        });

        renderPagination(totalPages);
      })
      .catch(function () {
        fillTable('users-table', 'users-empty', [], function () {
          return '';
        });
      });
  }

  function renderPagination(totalPages) {
    var container = $('users-page-numbers');
    var page = usersState.page;
    var html = '';
    var start = Math.max(1, page - 3);
    var end = Math.min(totalPages, start + 6);
    start = Math.max(1, end - 6);

    if (start > 1) {
      html += '<button class="btn btn-sm page-num" onclick="window._adminPage(1)">1</button>';
      if (start > 2) html += '<span class="dim" style="padding:0 6px;">…</span>';
    }
    for (var i = start; i <= end; i++) {
      html +=
        '<button class="btn btn-sm page-num' +
        (i === page ? ' page-active' : '') +
        '" onclick="window._adminPage(' +
        i +
        ')">' +
        i +
        '</button>';
    }
    if (end < totalPages) {
      if (end < totalPages - 1) html += '<span class="dim" style="padding:0 6px;">…</span>';
      html +=
        '<button class="btn btn-sm page-num" onclick="window._adminPage(' +
        totalPages +
        ')">' +
        totalPages +
        '</button>';
    }

    container.innerHTML = html;
    $('users-prev').disabled = page <= 1;
    $('users-next').disabled = page >= totalPages;
  }

  // ── User CRUD ──
  function openCreateModal() {
    editingUserId = null;
    $('modal-title').textContent = t('m.createTitle');
    $('modal-submit').textContent = t('btn.create');
    $('user-id').value = '';
    $('password-field').classList.remove('hidden');
    $('password-field').querySelector('input').required = true;
    var form = $('user-form');
    form.reset();
    form.querySelector('[name=username]').disabled = false;
    form.querySelector('[name=level]').value = '5';
    form.querySelector('[name=money]').value = '5000';
    form.querySelector('[name=role]').value = 'player';
    form.querySelector('[name=language]').value = window.I18N.getLang();
    hideMsg($('modal-msg'));
    // Load sprite library rồi điền select (mặc định = chưa gán)
    ensureSprites().then(function () {
      fillSpriteSelect('');
    });
    $('user-modal').classList.remove('hidden');
  }

  function openEditModal(userId) {
    var user = usersState.data.find(function (u) {
      return u.id === userId;
    });
    if (!user) return;
    editingUserId = userId;
    $('modal-title').textContent = t('m.editTitle') + ': ' + user.username;
    $('modal-submit').textContent = t('btn.save');
    $('user-id').value = userId;
    $('password-field').classList.add('hidden');
    $('password-field').querySelector('input').required = false;
    var form = $('user-form');
    form.reset();
    form.querySelector('[name=username]').value = user.username;
    form.querySelector('[name=username]').disabled = true;
    form.querySelector('[name=displayName]').value = user.displayName || '';
    form.querySelector('[name=level]').value = user.level || 1;
    form.querySelector('[name=money]').value = user.money || 0;
    form.querySelector('[name=role]').value = user.role || 'player';
    form.querySelector('[name=language]').value = user.language || 'en';
    form.querySelector('[name=birthday]').value = user.birthday || '';
    form.querySelector('[name=bio]').value = user.bio || '';
    form.querySelector('[name=notes]').value = user.notes || '';
    hideMsg($('modal-msg'));
    // Load sprite library rồi chọn đúng sprite user đang có
    ensureSprites().then(function () {
      fillSpriteSelect(user.spriteId || '');
    });
    $('user-modal').classList.remove('hidden');
  }

  function closeModal() {
    $('user-modal').classList.add('hidden');
    $('user-form').querySelector('[name=username]').disabled = false;
  }

  function submitUserForm() {
    var form = $('user-form');
    var fd = new FormData(form);

    if (editingUserId) {
      var body = {
        displayName: String(fd.get('displayName') || '').trim(),
        level: parseInt(fd.get('level') || '1', 10),
        money: parseInt(fd.get('money') || '0', 10),
        role: String(fd.get('role') || 'player'),
        language: String(fd.get('language') || 'en'),
        bio: String(fd.get('bio') || ''),
        notes: String(fd.get('notes') || ''),
        // '' = bỏ gán (về sprite mặc định), '' → server hiểu là null
        spriteId: String(fd.get('spriteId') || ''),
      };
      // Cập nhật user_info riêng (birthday)
      var birthday = String(fd.get('birthday') || '');
      if (birthday) {
        postJSON('/api/users/' + editingUserId + '/info', { birthday: birthday }, 'PUT');
      }
      // Không cho tự hạ quyền mình
      if (
        CURRENT_USER &&
        CURRENT_USER.user &&
        CURRENT_USER.user.id === editingUserId &&
        body.role !== 'admin'
      ) {
        showMsg($('modal-msg'), t('m.noSelfEdit'), 'error');
        return;
      }
      postJSON('/api/admin/users/' + editingUserId, body, 'PATCH')
        .then(function (d) {
          if (d.ok) {
            closeModal();
            loadUsers();
          } else showMsg($('modal-msg'), d.message || 'Lỗi cập nhật.', 'error');
        })
        .catch(function (e) {
          showMsg($('modal-msg'), e.message, 'error');
        });
    } else {
      body = {
        username: String(fd.get('username') || '').trim(),
        password: String(fd.get('password') || '').trim(),
        displayName: String(fd.get('displayName') || '').trim(),
        level: parseInt(fd.get('level') || '5', 10),
        money: parseInt(fd.get('money') || '5000', 10),
        role: String(fd.get('role') || 'player'),
        spriteId: String(fd.get('spriteId') || ''),
      };
      postJSON('/api/admin/users', body, 'POST')
        .then(function (d) {
          if (d.ok) {
            closeModal();
            loadUsers();
          } else showMsg($('modal-msg'), d.message || 'Lỗi tạo user.', 'error');
        })
        .catch(function (e) {
          showMsg($('modal-msg'), e.message, 'error');
        });
    }
  }

  function resetPassword(userId) {
    var newPass = window.prompt('Nhập mật khẩu mới (tối thiểu 6 ký tự):');
    if (newPass === null) return;
    if (newPass.length < 6) {
      alert('Mật khẩu phải ≥ 6 ký tự');
      return;
    }
    postJSON('/api/admin/users/' + userId + '/password', { newPassword: newPass }, 'POST')
      .then(function (d) {
        alert(d.ok ? d.message || 'Đã reset password' : d.message || 'Lỗi');
      })
      .catch(function (e) {
        alert(e.message);
      });
  }

  function banUser(userId, username) {
    if (!window.confirm('Ban "' + username + '"? User sẽ không thể đăng nhập.')) return;
    postJSON('/api/admin/users/' + userId + '/ban', {}, 'POST')
      .then(function (d) {
        if (d.ok) loadUsers();
        else alert(d.message || 'Lỗi');
      })
      .catch(function (e) {
        alert(e.message);
      });
  }

  function unbanUser(userId) {
    postJSON('/api/admin/users/' + userId + '/unban', {}, 'POST')
      .then(function (d) {
        if (d.ok) loadUsers();
        else alert(d.message || 'Lỗi');
      })
      .catch(function (e) {
        alert(e.message);
      });
  }

  function deleteUser(userId, username) {
    $('confirm-text').textContent =
      'Bạn có chắc muốn xóa "' + username + '"? Hành động này không thể hoàn tác.';
    $('confirm-modal').classList.remove('hidden');
    $('confirm-delete').onclick = function () {
      postJSON('/api/admin/users/' + userId, {}, 'DELETE')
        .then(function (d) {
          $('confirm-modal').classList.add('hidden');
          if (d.ok) loadUsers();
          else alert(d.message || 'Lỗi xóa');
        })
        .catch(function (e) {
          alert(e.message);
        });
    };
  }

  // ── Pokemon ──
  function loadPokemon() {
    getJSON('/api/admin/pokemon?limit=200')
      .then(function (d) {
        var list = d.pokemon || [];
        $('pokemon-count').textContent = list.length;
        fillTable('pokemon-table', 'pokemon-empty', list, function (p) {
          return (
            '<tr><td class="mono dim">' +
            esc(p.id).substring(0, 8) +
            '</td><td>' +
            esc(p.ownerName) +
            '</td><td>' +
            esc(p.speciesId) +
            '</td><td class="mono">' +
            esc(p.level) +
            '</td><td>' +
            esc(p.types || '—') +
            '</td><td class="mono">' +
            (p.partySlot === null ? '—' : esc(p.partySlot)) +
            '</td><td>' +
            (p.shiny ? '<span class="badge badge-warn">✦</span>' : '<span class="dim">—</span>') +
            '</td></tr>'
          );
        });
      })
      .catch(function () {});
  }

  // ── Players ──
  function loadPlayers() {
    getJSON('/api/admin/players?limit=100')
      .then(function (d) {
        var list = d.players || [];
        $('players-count').textContent = list.length;
        fillTable('players-table', 'players-empty', list, function (p) {
          return (
            '<tr><td>' +
            esc(p.username) +
            '</td><td class="dim">' +
            esc(p.mapId) +
            '</td><td class="mono">' +
            esc(p.x) +
            '</td><td class="mono">' +
            esc(p.y) +
            '</td><td class="dim">' +
            esc(p.direction) +
            '</td><td class="mono">' +
            esc(p.level) +
            '</td></tr>'
          );
        });
      })
      .catch(function () {});
  }

  function loadAll() {
    loadOverview();
  }

  // ── Sprites ─────────────────────────────────────────────────────────────
  function loadSprites() {
    getJSON('/api/admin/sprites')
      .then(function (d) {
        var list = d.sprites || [];
        fillTable('sprites-table', 'sprites-empty', list, function (s) {
          // 16 frame = lưới 4×4, 12 frame = dải ngang → crop ô đầu tiên (frame 0_0)
          var thumb = s.sheetUrl || s.sourceUrl;
          var thumbHtml = thumb
            ? '<img class="sprite-thumb-frame" src="' +
              esc(thumb) +
              '" alt="" title="' +
              esc(s.name) +
              '" />'
            : '<span class="dim">—</span>';
          var modeColor =
            s.mode === 'atlas'
              ? 'rgba(253,203,110,.15);color:#fdcb6e'
              : 'rgba(0,184,148,.15);color:#00b894';
          return (
            '<tr><td>' +
            thumbHtml +
            '</td><td>' +
            esc(s.name) +
            '</td><td><span class="badge" style="background:' +
            modeColor +
            '">' +
            esc(s.mode) +
            '</span></td><td class="mono dim">' +
            esc(s.frameW) +
            '×' +
            esc(s.frameH) +
            ' · ' +
            esc(s.frameCount || 12) +
            'f</td><td class="dim">' +
            esc(fmtDate(s.createdAt)) +
            '</td><td>' +
            '<button class="btn btn-ghost btn-sm" onclick="_spriteEdit(\'' +
            esc(s.id) +
            '\')">✏️</button> ' +
            '<button class="btn btn-ghost btn-sm" onclick="_spriteDelete(\'' +
            esc(s.id) +
            "','" +
            esc(s.name) +
            '\')">🗑</button>' +
            '</td></tr>'
          );
        });
        // Cập nhật cache cho select sprite trong modal user
        spritesCache = list.filter(function (s) {
          return s.sheetUrl;
        });
      })
      .catch(function () {
        fillTable('sprites-table', 'sprites-empty', [], function () {
          return '';
        });
      });
  }

  // ── Sprite editor ───────────────────────────────────────────────────────
  function defaultFrames() {
    // Khung chuẩn theo layout của sheet:
    // - 12 frame (dải ngang): x = i*32, y = 0 → khớp PlayerSprite legacy
    // - 16 frame (lưới 4×4):  x = cột*F, y = hàng*F → khớp hero sheet
    var w = parseInt($('sprite-frame-w').value, 10) || 32;
    var h = parseInt($('sprite-frame-h').value, 10) || 32;
    var count = frameCount();
    var perDir = count / 4;
    var frames = [];
    for (var i = 0; i < count; i++) {
      var di = Math.floor(i / perDir);
      var ci = i % perDir;
      frames.push(
        count >= 16 ? { x: ci * w, y: di * h, w: w, h: h } : { x: i * w, y: 0, w: w, h: h },
      );
    }
    return frames;
  }

  /** Số frame đang chọn trong editor (12 dải ngang | 16 lưới 4×4). */
  function frameCount() {
    return spriteState.frameCount === 16 ? 16 : SPRITE_FRAME_COUNT;
  }

  /** Số frame mỗi hướng (3 | 4). */
  function framesPerDir() {
    return frameCount() / 4;
  }

  function openSpriteModal(spriteId) {
    spriteState.editingId = spriteId || null;
    spriteState.sourceImage = null;
    spriteState.slices = new Array(frameCount()).fill(null);
    spriteState.frames = defaultFrames();
    spriteState.previewFrame = 0;
    spriteState.previewDir = 'down';
    spriteState.frameCount = SPRITE_FRAME_COUNT;

    $('sprite-modal-title').textContent = t('sp.create');
    $('sprite-name').value = '';
    $('sprite-mode').value = 'baked';
    $('sprite-file').value = '';
    $('sprite-read-mode').value = 'sheet';
    $('sprite-frame-w').value = '32';
    $('sprite-frame-h').value = '32';
    if ($('sprite-frame-count')) $('sprite-frame-count').value = '12';
    hideMsg($('sprite-modal-msg'));
    stopPreview();

    $('sprite-slice-drop').classList.add('hidden');

    if (spriteId) {
      // Chế độ sửa: load metadata từ thư viện + sheet PNG vào preview
      $('sprite-modal-title').textContent = t('sp.edit');
      getJSON('/api/admin/sprites/' + spriteId)
        .then(function (d) {
          var s = d.sprite;
          if (!s) return;
          // set input TRƯỚC khi tính defaultFrames() — nếu không frame W/H
          // vẫn là giá trị mặc định 32 (defaultFrames đọc từ input).
          spriteState.frameCount = s.frameCount || 12;
          $('sprite-name').value = s.name || '';
          $('sprite-mode').value = s.mode || 'baked';
          $('sprite-frame-w').value = s.frameW || 32;
          $('sprite-frame-h').value = s.frameH || 32;
          if ($('sprite-frame-count'))
            $('sprite-frame-count').value = String(spriteState.frameCount);
          spriteState.frames = (s.frames && s.frames.length ? s.frames : defaultFrames()).slice(
            0,
            spriteState.frameCount,
          );
          renderFramesTable();
          drawSpriteCanvas();
          updatePreview();

          // Load sheet làm ảnh nguồn để preview/kéo frame
          var src = s.sheetUrl || s.sourceUrl;
          if (src) {
            var img = new Image();
            img.onload = function () {
              spriteState.sourceImage = img;
              drawSpriteCanvas();
              updatePreview();
            };
            img.src = src;
          }
        })
        .catch(function (e) {
          showMsg($('sprite-modal-msg'), e.message || 'Không tải được sprite.', 'error');
        });
    }

    renderSliceGrid();
    renderFramesTable();
    drawSpriteCanvas();
    updatePreview();

    $('sprite-modal').classList.remove('hidden');
  }

  function closeSpriteModal() {
    stopPreview();
    $('sprite-modal').classList.add('hidden');
  }

  function renderFramesTable() {
    var tbody = $('sprite-frames-table').querySelector('tbody');
    var count = frameCount();
    var perDir = count / 4;
    // Tiêu đề bảng động theo layout đang chọn
    var titleEl = $('sprite-frames-title');
    if (titleEl) {
      titleEl.textContent = count >= 16 ? t('sp.frames16') : t('sp.frames');
    }
    tbody.innerHTML = spriteState.frames
      .slice(0, count)
      .map(function (f, i) {
        var dirIdx = Math.floor(i / perDir);
        var frameIdx = i % perDir;
        return (
          '<tr data-index="' +
          i +
          '"><td class="mono dim">' +
          i +
          '</td><td class="dim">' +
          SPRITE_DIR_LABEL[dirIdx] +
          ' #' +
          frameIdx +
          '</td>' +
          '<td><input type="number" min="0" value="' +
          f.x +
          '" data-key="x" data-index="' +
          i +
          '" /></td>' +
          '<td><input type="number" min="0" value="' +
          f.y +
          '" data-key="y" data-index="' +
          i +
          '" /></td>' +
          '<td><input type="number" min="1" value="' +
          f.w +
          '" data-key="w" data-index="' +
          i +
          '" /></td>' +
          '<td><input type="number" min="1" value="' +
          f.h +
          '" data-key="h" data-index="' +
          i +
          '" /></td></tr>'
        );
      })
      .join('');

    tbody.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var idx = parseInt(inp.dataset.index, 10);
        var key = inp.dataset.key;
        var v = Math.max(key === 'x' || key === 'y' ? 0 : 1, parseInt(inp.value, 10) || 0);
        spriteState.frames[idx][key] = v;
        drawSpriteCanvas();
        updatePreview();
      });
    });

    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        tbody.querySelectorAll('tr').forEach(function (x) {
          x.classList.remove('selected');
        });
        tr.classList.add('selected');
        spriteState.previewFrame = parseInt(tr.dataset.index, 10);
        updatePreview();
      });
    });
  }

  function renderSliceGrid() {
    var grid = $('sprite-slice-grid');
    grid.innerHTML = '';
    var perDir = framesPerDir();
    for (var i = 0; i < frameCount(); i++) {
      (function (idx) {
        var cell = document.createElement('div');
        cell.className = 'sprite-slice-cell';
        var dirIdx = Math.floor(idx / perDir);
        var frameIdx = idx % perDir;
        cell.innerHTML = '<span>' + SPRITE_DIR_LABEL[dirIdx] + ' #' + frameIdx + '</span>';
        if (spriteState.slices[idx]) {
          cell.classList.add('has-img');
          var img = document.createElement('img');
          img.src = spriteState.slices[idx].src;
          cell.insertBefore(img, cell.firstChild);
        }
        cell.addEventListener('click', function () {
          pickSliceFile(idx);
        });
        grid.appendChild(cell);
      })(i);
    }
  }

  function pickSliceFile(idx) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/png';
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      loadSpriteImage(file, function (img) {
        spriteState.slices[idx] = img;
        renderSliceGrid();
        composeSlicesToSheet();
        updatePreview();
      });
    });
    inp.click();
  }

  function composeSlicesToSheet() {
    // Ghép N lát vào canvas theo layout đang chọn
    // (12 → 384×32 dải ngang; 16 → lưới 4×4 256×256) → làm ảnh nguồn preview/export
    var fw = parseInt($('sprite-frame-w').value, 10) || 32;
    var fh = parseInt($('sprite-frame-h').value, 10) || 32;
    var count = frameCount();
    var cols = count >= 16 ? 4 : count;
    var rows = count >= 16 ? 4 : 1;
    var perDir = framesPerDir();
    var canvas = document.createElement('canvas');
    canvas.width = fw * cols;
    canvas.height = fh * rows;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    spriteState.slices.forEach(function (img, i) {
      if (!img) return;
      var dx = count >= 16 ? (i % perDir) * fw : i * fw;
      var dy = count >= 16 ? Math.floor(i / perDir) * fh : 0;
      ctx.drawImage(img, dx, dy, fw, fh);
    });

    var src = canvas.toDataURL('image/png');
    var img = new Image();
    img.onload = function () {
      spriteState.sourceImage = img;
      spriteState.frames = defaultFrames();
      renderFramesTable();
      drawSpriteCanvas();
      updatePreview();
    };
    img.src = src;
  }

  function loadSpriteImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        cb(img);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function drawSpriteCanvas() {
    var canvas = $('sprite-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var fw = parseInt($('sprite-frame-w').value, 10) || 32;
    var fh = parseInt($('sprite-frame-h').value, 10) || 32;
    var count = frameCount();
    // 16 frame = lưới 4×4 (khổ 4F × 4F); 12 frame = dải ngang (12F × F)
    var cols = count >= 16 ? 4 : count;
    var rows = count >= 16 ? 4 : 1;
    var totalW = fw * cols;
    var totalH = fh * rows;

    // Zoom cho vừa panel (384px gốc theo chiều rộng)
    var zoom = Math.max(1, Math.min(6, Math.floor(384 / totalW) || 1));
    canvas.width = totalW * zoom;
    canvas.height = totalH * zoom + 30;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // 1. Vẽ ảnh nguồn đã load
    if (spriteState.sourceImage) {
      var s = canvas.width / spriteState.sourceImage.width;
      ctx.drawImage(
        spriteState.sourceImage,
        0,
        0,
        spriteState.sourceImage.width,
        spriteState.sourceImage.height,
        0,
        0,
        canvas.width,
        spriteState.sourceImage.height * s,
      );
    }

    // 2. Vẽ overlay frame
    var sx = canvas.width / totalW;
    spriteState.frames.slice(0, count).forEach(function (f, i) {
      var x = f.x * sx;
      var y = f.y * sx;
      var w = f.w * sx;
      var h = f.h * sx;
      var selected = i === spriteState.previewFrame;
      ctx.fillStyle = selected ? 'rgba(0,206,201,0.20)' : 'rgba(108,92,231,0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = selected ? '#00cec9' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      ctx.fillStyle = selected ? '#00cec9' : '#9aa0c3';
      ctx.font = '11px monospace';
      ctx.fillText(String(i), x + 3, y + 12);
    });
  }

  function updatePreview() {
    var canvas = $('sprite-preview-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    var idx = spriteState.previewFrame;
    var f = spriteState.frames[idx];
    if (!spriteState.sourceImage || !f) {
      $('sprite-frame-label').textContent = '—';
      return;
    }

    // Pixel-art: scale ×4 để thấy rõ
    var zoom = 4;
    canvas.width = f.w * zoom;
    canvas.height = f.h * zoom;
    ctx.drawImage(spriteState.sourceImage, f.x, f.y, f.w, f.h, 0, 0, f.w * zoom, f.h * zoom);

    var perDir = framesPerDir();
    var dirIdx = Math.floor(idx / perDir);
    var frameIdx = idx % perDir;
    $('sprite-frame-label').textContent =
      SPRITE_DIR_LABEL[dirIdx] + ' frame ' + frameIdx + ' (' + f.w + '×' + f.h + ')';
  }

  function startPreview() {
    stopPreview();
    spriteState.previewTimer = setInterval(function () {
      if (spriteState.previewDir === 'all') {
        spriteState.previewFrame = (spriteState.previewFrame + 1) % frameCount();
      } else {
        var dirIdx = SPRITE_DIRS.indexOf(spriteState.previewDir);
        if (dirIdx < 0) dirIdx = 0;
        var perDir = framesPerDir();
        var base = dirIdx * perDir;
        spriteState.previewFrame = base + ((spriteState.previewFrame - base + 1) % perDir);
      }
      renderFramesTable();
      drawSpriteCanvas();
      updatePreview();
    }, 180);
    $('sprite-play-btn').textContent = t('sp.pause');
  }

  function stopPreview() {
    if (spriteState.previewTimer) {
      clearInterval(spriteState.previewTimer);
      spriteState.previewTimer = null;
    }
    var btn = $('sprite-play-btn');
    if (btn) btn.textContent = t('sp.play');
  }

  function togglePreview() {
    if (spriteState.previewTimer) stopPreview();
    else startPreview();
  }

  function exportSheet() {
    var fw = parseInt($('sprite-frame-w').value, 10) || 32;
    var fh = parseInt($('sprite-frame-h').value, 10) || 32;
    var count = frameCount();
    var canvas = document.createElement('canvas');
    // 16 frame → lưới 4×4 (256×256); 12 frame → dải ngang (384×32).
    // PHẢI khớp layout client `SpriteSheetLoader` đọc theo `frameCount`,
    // nếu không sprite sẽ quay sai hướng / trỏ nhầm frame.
    var cols = count >= 16 ? 4 : count;
    var rows = count >= 16 ? 4 : 1;
    canvas.width = fw * cols;
    canvas.height = fh * rows;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    if (spriteState.sourceImage) {
      var perDir = framesPerDir();
      spriteState.frames.forEach(function (f, i) {
        var dx = count >= 16 ? (i % perDir) * fw : i * fw;
        var dy = count >= 16 ? Math.floor(i / perDir) * fh : 0;
        ctx.drawImage(spriteState.sourceImage, f.x, f.y, f.w, f.h, dx, dy, fw, fh);
      });
    }

    var a = document.createElement('a');
    a.download = ($('sprite-name').value || 'sprite').replace(/[^a-z0-9_-]/gi, '_') + '.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
    return canvas.toDataURL('image/png');
  }

  function saveSprite() {
    var name = $('sprite-name').value.trim();
    if (!name) {
      showMsg($('sprite-modal-msg'), 'Vui lòng nhập tên sprite.', 'error');
      return;
    }
    var mode = $('sprite-mode').value;
    var fw = parseInt($('sprite-frame-w').value, 10) || 32;
    var fh = parseInt($('sprite-frame-h').value, 10) || 32;
    var fc = parseInt(($('sprite-frame-count') && $('sprite-frame-count').value) || '12', 10);
    if (fc !== 12 && fc !== 16) fc = 12;

    var fd = new FormData();
    fd.append('name', name);
    fd.append('mode', mode);
    fd.append('frameW', String(fw));
    fd.append('frameH', String(fh));
    fd.append('frameCount', String(fc));
    fd.append('frames', JSON.stringify(spriteState.frames));

    // Ghép sheet ngay ở trình duyệt rồi upload dưới dạng bakedSheet (dataURL).
    // Khi sửa sprite có sẵn mà KHÔNG tải ảnh mới → giữ sheet cũ (server nhận
    // bakedSheet mới sẽ ghi đè file sheet cũ bằng bản export mới).
    var sheetDataUrl = null;
    if (spriteState.sourceImage) {
      sheetDataUrl = exportSheet();
    }
    if (sheetDataUrl) fd.append('bakedSheet', sheetDataUrl);

    // Upload file gốc (nếu có) để mode atlas giữ nguyên ảnh
    var fileInput = $('sprite-file');
    if (fileInput.files && fileInput.files[0]) {
      fd.append('image', fileInput.files[0]);
    }

    var isEdit = !!spriteState.editingId;
    var url = isEdit ? '/api/admin/sprites/' + spriteState.editingId : '/api/admin/sprites';
    var opts = { method: isEdit ? 'PATCH' : 'POST', body: fd };
    if (TOKEN) opts.headers = { Authorization: 'Bearer ' + TOKEN };

    fetch(API + url, opts)
      .then(function (r) {
        if (r.status === 401) {
          logout();
          throw new Error('SESSION_EXPIRED');
        }
        return r.json();
      })
      .then(function (d) {
        if (d.ok) {
          closeSpriteModal();
          loadSprites();
        } else {
          showMsg($('sprite-modal-msg'), d.message || 'Lỗi khi lưu sprite.', 'error');
        }
      })
      .catch(function (e) {
        showMsg($('sprite-modal-msg'), e.message || 'Lỗi kết nối.', 'error');
      });
  }

  function deleteSprite(id, name) {
    $('confirm-text').textContent =
      'Bạn có chắc muốn xóa sprite "' + name + '"? Hành động này không thể hoàn tác.';
    $('confirm-modal').classList.remove('hidden');
    $('confirm-delete').onclick = function () {
      postJSON('/api/admin/sprites/' + id, {}, 'DELETE')
        .then(function (d) {
          $('confirm-modal').classList.add('hidden');
          if (d.ok) loadSprites();
          else alert(d.message || 'Lỗi xóa');
        })
        .catch(function (e) {
          alert(e.message);
        });
    };
  }

  // ── Global functions ──
  window._adminPage = function (page) {
    usersState.page = page;
    loadUsers();
  };
  window._adminEdit = function (id) {
    openEditModal(id);
  };
  window._adminPasswd = function (id) {
    resetPassword(id);
  };
  window._adminBan = function (id, name) {
    banUser(id, name);
  };
  window._adminUnban = function (id) {
    unbanUser(id);
  };
  window._adminDelete = function (id, name) {
    deleteUser(id, name);
  };
  window._spriteEdit = function (id) {
    openSpriteModal(id);
  };
  window._spriteDelete = function (id, name) {
    deleteSprite(id, name);
  };

  // ── Init ──
  document.addEventListener('DOMContentLoaded', function () {
    wireLogin();
    checkAuth();

    // ── Re-render dynamic content khi đổi ngôn ngữ ──
    if (window.I18N) {
      window.I18N.onApply(function () {
        window.I18N.updateToggleUI();
        var active = document.querySelector('.nav-item.active');
        if (active) {
          var meta = VIEWS[active.dataset.view];
          if (meta) {
            $('view-title').textContent = t(meta.titleKey);
            $('view-sub').textContent = t(meta.subKey);
          }
        }
        // Reload bảng động (role badges, lang labels, role counts)
        loadOverview();
        var currentView = active ? active.dataset.view : 'overview';
        if (currentView === 'users') loadUsers();
        else if (currentView === 'pokemon') loadPokemon();
        else if (currentView === 'players') loadPlayers();
      });
    }

    document.querySelectorAll('.nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showView(btn.dataset.view);
      });
    });

    $('refresh-btn').addEventListener('click', function () {
      var active = document.querySelector('.nav-item.active');
      if (active) showView(active.dataset.view);
    });

    $('logout-btn').addEventListener('click', logout);

    // Denied page logout
    var deniedLogout = $('denied-logout-btn');
    if (deniedLogout) deniedLogout.addEventListener('click', logout);

    // Users search
    var searchTimer;
    $('users-search').addEventListener('input', function () {
      clearTimeout(searchTimer);
      var val = $('users-search').value.trim();
      searchTimer = setTimeout(function () {
        usersState.q = val;
        usersState.page = 1;
        loadUsers();
      }, 300);
    });

    // Role filter
    $('users-role-filter').addEventListener('change', function () {
      usersState.roleFilter = $('users-role-filter').value;
      usersState.page = 1;
      loadUsers();
    });

    // Pagination
    $('users-prev').addEventListener('click', function () {
      if (usersState.page > 1) {
        usersState.page--;
        loadUsers();
      }
    });
    $('users-next').addEventListener('click', function () {
      usersState.page++;
      loadUsers();
    });

    // Modal
    $('user-create-btn').addEventListener('click', openCreateModal);
    $('modal-close').addEventListener('click', closeModal);
    $('modal-cancel').addEventListener('click', closeModal);
    $('user-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitUserForm();
    });

    // Đổi sprite trong modal user → cập nhật preview ngay (không cần bấm Lưu)
    $('user-sprite').addEventListener('change', function () {
      updateSpritePreview(this.value);
    });

    // Confirm
    $('confirm-close').addEventListener('click', function () {
      $('confirm-modal').classList.add('hidden');
    });
    $('confirm-cancel').addEventListener('click', function () {
      $('confirm-modal').classList.add('hidden');
    });

    // ── Sprite editor ──
    $('sprite-create-btn').addEventListener('click', openSpriteModal);
    $('sprite-modal-close').addEventListener('click', closeSpriteModal);
    $('sprite-modal-cancel').addEventListener('click', closeSpriteModal);
    $('sprite-modal-submit').addEventListener('click', saveSprite);
    $('sprite-export-btn').addEventListener('click', function () {
      exportSheet();
      showMsg($('sprite-modal-msg'), 'Đã xuất sheet PNG (384×32).', 'ok');
    });
    $('sprite-play-btn').addEventListener('click', togglePreview);
    $('sprite-preview-dir').addEventListener('change', function () {
      spriteState.previewDir = this.value;
      var dirIdx = SPRITE_DIRS.indexOf(this.value);
      if (dirIdx >= 0) spriteState.previewFrame = dirIdx * framesPerDir();
      else spriteState.previewFrame = 0;
      renderFramesTable();
      drawSpriteCanvas();
      updatePreview();
    });
    $('sprite-frames-reset').addEventListener('click', function () {
      spriteState.frames = defaultFrames();
      renderFramesTable();
      drawSpriteCanvas();
      updatePreview();
    });
    $('sprite-slice-clear').addEventListener('click', function () {
      spriteState.slices = new Array(frameCount()).fill(null);
      renderSliceGrid();
    });
    $('sprite-file').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var readMode = $('sprite-read-mode').value;

      if (readMode === 'slices') {
        // Mở ô grid để admin chọn từng lát (nếu chưa mở thì mở)
        $('sprite-slice-drop').classList.remove('hidden');
        return;
      }

      loadSpriteImage(file, function (img) {
        spriteState.sourceImage = img;
        spriteState.frames = defaultFrames();
        renderFramesTable();
        drawSpriteCanvas();
        updatePreview();
      });
    });
    $('sprite-read-mode').addEventListener('change', function () {
      var isSlices = this.value === 'slices';
      $('sprite-slice-drop').classList.toggle('hidden', !isSlices);
      if (isSlices) {
        spriteState.sourceImage = null;
        spriteState.frames = defaultFrames();
        renderFramesTable();
        drawSpriteCanvas();
        updatePreview();
      }
    });
    $('sprite-frame-w').addEventListener('change', function () {
      spriteState.frames = defaultFrames();
      renderFramesTable();
      drawSpriteCanvas();
      updatePreview();
    });
    $('sprite-frame-h').addEventListener('change', function () {
      spriteState.frames = defaultFrames();
      renderFramesTable();
      drawSpriteCanvas();
      updatePreview();
    });

    // Đổi layout sheet (12 dải ngang ↔ 16 lưới 4×4) → dựng lại toạ độ frame
    if ($('sprite-frame-count')) {
      $('sprite-frame-count').addEventListener('change', function () {
        spriteState.frameCount = parseInt(this.value, 10) === 16 ? 16 : 12;
        spriteState.frames = defaultFrames();
        renderFramesTable();
        drawSpriteCanvas();
        updatePreview();
      });
    }
  });
})();
