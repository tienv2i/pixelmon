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
    gamedata: { titleKey: 'view.gamedata', subKey: 'view.gamedata.sub' },
    maps: { titleKey: 'view.maps', subKey: 'view.maps.sub' },
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
    var loc = window.I18N && window.I18N.getLang() === 'vi' ? 'vi-VN' : 'en-US';
    return isNaN(d.getTime()) ? '—' : d.toLocaleString(loc);
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
    el.textContent = ok ? okText : (failText || t('common.error'));
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
        showMsg($('login-msg'), t('login.fillAll'), 'error');
        return;
      }
      var btn = $('login-btn');
      btn.disabled = true;
      btn.textContent = t('login.loggingIn');
      hideMsg($('login-msg'));

      postJSON('/api/auth/login', { username: username, password: password })
        .then(function (d) {
          if (d.ok && d.token) {
            TOKEN = d.token;
            localStorage.setItem('pixelmon.token', d.token);
            localStorage.setItem('pixelmon.userId', d.userId);
            if (d.role === 'banned') {
              showMsg($('login-msg'), t('login.banned'), 'error');
              TOKEN = '';
              localStorage.removeItem('pixelmon.token');
            } else if (d.role && d.role !== 'admin') {
              showMsg(
                $('login-msg'),
                t('login.notAdmin'),
                'error',
              );
            } else {
              checkAuth();
            }
          } else {
            showMsg($('login-msg'), d.message || t('login.connectFail'), 'error');
          }
        })
        .catch(function (err) {
          showMsg($('login-msg'), err.message || t('login.connectFail'), 'error');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = t('login.submit');
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
    if (name === 'gamedata') loadGameData();
    if (name === 'maps') loadMaps();
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
  // ── Sprite helpers (dùng bởi bảng users + modal user) ──
  /** Ô hiển thị sprite đã gán (thumb + tên), hoặc "mặc định" nếu chưa gán. */
  function spriteCell(u) {
    if (u.sprite && u.sprite.sheetUrl) {
      var thumb = u.sprite.previewUrl128 || u.sprite.previewGif128 || u.sprite.sheetUrl;
      return (
        '<div class="sprite-thumb-cell" title="' +
        esc(u.sprite.name) +
        '"><img src="' +
        esc(thumb) +
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

  var userSpriteShowGif = false;

  /** Cập nhật ảnh đại diện preview trong Modal User. */
  function updateSpritePreview(spriteId) {
    var imgEl = $('user-sprite-img');
    var label = $('user-sprite-label');
    var toggleBtn = $('user-sprite-view-toggle');
    if (!imgEl) return;

    var s = spritesCache.find(function (x) {
      return x.id === spriteId;
    });

    if (!s || !s.sheetUrl) {
      // Mặc định (hero)
      var defaultPreview = userSpriteShowGif
        ? '/sprites/previews/main-128.gif'
        : '/sprites/previews/main-128.png';
      imgEl.src = defaultPreview;
      if (label) label.textContent = t('m.spriteDefault') + ' (hero 64×64)';
      if (toggleBtn) {
        toggleBtn.textContent = userSpriteShowGif ? '⏸ Xem ảnh tĩnh' : '▶ Xem hoạt ảnh';
      }
      return;
    }

    var previewUrl = userSpriteShowGif
      ? s.previewGif128 || s.previewUrl128 || s.sheetUrl
      : s.previewUrl128 || s.sheetUrl;
    imgEl.src = previewUrl;

    if (label) {
      label.textContent = s.name + ' · ' + s.frameW + '×' + s.frameH + ' (' + (s.frameCount || 16) + 'f)';
    }
    if (toggleBtn) {
      toggleBtn.textContent = userSpriteShowGif ? '⏸ Xem ảnh tĩnh' : '▶ Xem hoạt ảnh';
    }
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
              '\')" title="' +
              esc(t('u.unban')) +
              '">🔓</button> '
            : '<button class="btn btn-sm btn-ghost btn-danger" onclick="window._adminBan(\'' +
              u.id +
              "','" +
              esc(u.username) +
              '\')" title="' +
              esc(t('u.ban')) +
              '">🚫</button> ';

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
            (u.money !== null
              ? Number(u.money).toLocaleString(
                  window.I18N && window.I18N.getLang() === 'vi' ? 'vi-VN' : 'en-US',
                )
              : '—') +
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
            '\')" title="' +
            esc(t('btn.edit')) +
            '">✎</button> ' +
            '<button class="btn btn-sm btn-ghost" onclick="window._adminPasswd(\'' +
            u.id +
            '\')" title="' +
            esc(t('u.resetPass')) +
            '">🔑</button> ' +
            banBtn +
            (isMe
              ? ''
              : '<button class="btn btn-sm btn-ghost btn-danger" onclick="window._adminDelete(\'' +
                u.id +
                "','" +
                esc(u.username) +
                '\')" title="' +
                esc(t('btn.delete')) +
                '">✕</button>') +
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
    var newPass = window.prompt(t('u.promptResetPass'));
    if (newPass === null) return;
    if (newPass.length < 6) {
      alert(t('u.passTooShort'));
      return;
    }
    postJSON('/api/admin/users/' + userId + '/password', { newPassword: newPass }, 'POST')
      .then(function (d) {
        alert(d.ok ? d.message || t('u.passResetSuccess') : d.message || t('common.error'));
      })
      .catch(function (e) {
        alert(e.message);
      });
  }

  function banUser(userId, username) {
    if (!window.confirm(t('u.confirmBan', { username: username }))) return;
    postJSON('/api/admin/users/' + userId + '/ban', {}, 'POST')
      .then(function (d) {
        if (d.ok) loadUsers();
        else alert(d.message || t('common.error'));
      })
      .catch(function (e) {
        alert(e.message);
      });
  }

  function unbanUser(userId) {
    postJSON('/api/admin/users/' + userId + '/unban', {}, 'POST')
      .then(function (d) {
        if (d.ok) loadUsers();
        else alert(d.message || t('common.error'));
      })
      .catch(function (e) {
        alert(e.message);
      });
  }

  function deleteUser(userId, username) {
    $('confirm-text').textContent = t('u.confirmDeleteFull', { username: username });
    $('confirm-modal').classList.remove('hidden');
    $('confirm-delete').onclick = function () {
      postJSON('/api/admin/users/' + userId, {}, 'DELETE')
        .then(function (d) {
          $('confirm-modal').classList.add('hidden');
          if (d.ok) loadUsers();
          else alert(d.message || t('u.deleteError'));
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

  // ── Essentials Game Data ────────────────────────────────────────────────
  var gdState = {
    tab: 'species',
    summary: null,
    species: { page: 1, limit: 30, q: '', gen: '', type: '', rarity: '', total: 0, totalPages: 1, data: [] },
    moves: { page: 1, limit: 30, q: '', category: '', type: '', total: 0, totalPages: 1, data: [] },
    items: { page: 1, limit: 30, q: '', category: '', total: 0, totalPages: 1, data: [] },
    abilities: { page: 1, limit: 30, q: '', total: 0, totalPages: 1, data: [] },
    types: null,
  };

  var TYPE_COLORS = {
    normal: '#A8A878',
    fire: '#F08030',
    water: '#6890F0',
    electric: '#F8D030',
    grass: '#78C850',
    ice: '#98D8D8',
    fighting: '#C03028',
    poison: '#A040A0',
    ground: '#E0C068',
    flying: '#A890F0',
    psychic: '#F85888',
    bug: '#A8B820',
    rock: '#B8A038',
    ghost: '#705898',
    dragon: '#7038F8',
    steel: '#B8B8D0',
    dark: '#705848',
    fairy: '#EE99AC',
    shadow: '#604E82',
  };

  function gdTypeBadge(t) {
    if (!t) return '';
    var name = String(t).toLowerCase();
    var color = TYPE_COLORS[name] || '#718096';
    return (
      '<span class="badge" style="background:' +
      color +
      '; color:#fff; font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 6px; letter-spacing:0.5px; border-radius:4px;">' +
      esc(name) +
      '</span>'
    );
  }

  function gdCategoryBadge(cat) {
    var c = String(cat || '').toLowerCase();
    if (c === 'physical') {
      return '<span class="badge" style="background:rgba(225,112,85,0.2); color:#e17055; border:1px solid #e17055;">⚔ Physical</span>';
    } else if (c === 'special') {
      return '<span class="badge" style="background:rgba(9,132,227,0.2); color:#0984e3; border:1px solid #0984e3;">✨ Special</span>';
    } else if (c === 'status') {
      return '<span class="badge" style="background:rgba(108,92,231,0.2); color:#a29bfe; border:1px solid #6c5ce7;">🌀 Status</span>';
    }
    return '<span class="badge">' + esc(cat || '—') + '</span>';
  }

  function gdRarityBadge(rarity) {
    var r = String(rarity || 'common').toLowerCase();
    var colors = {
      common: '#718096',
      uncommon: '#00cec9',
      rare: '#fdcb6e',
      legendary: '#ff7675',
    };
    var color = colors[r] || '#718096';
    return (
      '<span class="badge" style="background:' +
      color +
      '22; color:' +
      color +
      '; border:1px solid ' +
      color +
      '; text-transform:capitalize;">' +
      esc(r) +
      '</span>'
    );
  }

  function renderGdPagination(containerId, state, pageCallbackName) {
    var container = $(containerId);
    if (!container) return;
    var page = state.page;
    var totalPages = state.totalPages || 1;
    var total = state.total || 0;
    var limit = state.limit || 30;
    var from = total > 0 ? (page - 1) * limit + 1 : 0;
    var to = Math.min(page * limit, total);

    var infoHtml =
      '<div class="dim" style="font-size:13px;">Hiển thị <strong>' +
      from +
      ' - ' +
      to +
      '</strong> / <strong>' +
      total +
      '</strong> mục (Trang ' +
      page +
      ' / ' +
      totalPages +
      ')</div>';

    var btnsHtml = '<div style="display:flex; gap:4px; align-items:center;">';
    btnsHtml +=
      '<button class="btn btn-sm btn-ghost" ' +
      (page <= 1 ? 'disabled' : '') +
      ' onclick="' +
      pageCallbackName +
      '(1)">« Đầu</button>';
    btnsHtml +=
      '<button class="btn btn-sm btn-ghost" ' +
      (page <= 1 ? 'disabled' : '') +
      ' onclick="' +
      pageCallbackName +
      '(' +
      (page - 1) +
      ')">‹ Trước</button>';

    var startPage = Math.max(1, page - 2);
    var endPage = Math.min(totalPages, page + 2);
    for (var p = startPage; p <= endPage; p++) {
      btnsHtml +=
        '<button class="btn btn-sm ' +
        (p === page ? 'btn-primary' : 'btn-ghost') +
        '" onclick="' +
        pageCallbackName +
        '(' +
        p +
        ')">' +
        p +
        '</button>';
    }

    btnsHtml +=
      '<button class="btn btn-sm btn-ghost" ' +
      (page >= totalPages ? 'disabled' : '') +
      ' onclick="' +
      pageCallbackName +
      '(' +
      (page + 1) +
      ')">Sau ›</button>';
    btnsHtml +=
      '<button class="btn btn-sm btn-ghost" ' +
      (page >= totalPages ? 'disabled' : '') +
      ' onclick="' +
      pageCallbackName +
      '(' +
      totalPages +
      ')">Cuối »</button>';
    btnsHtml += '</div>';

    container.innerHTML = infoHtml + btnsHtml;
  }

  function loadGameData() {
    getJSON('/api/admin/gamedata/summary')
      .then(function (res) {
        if (res && res.summary) {
          gdState.summary = res.summary;
          var counts = res.summary.counts || {};
          if ($('gd-stat-species')) $('gd-stat-species').textContent = counts.species || res.summary.totalSpecies || '898';
          if ($('gd-stat-moves')) $('gd-stat-moves').textContent = counts.moves || res.summary.totalMoves || '740';
          if ($('gd-stat-items')) $('gd-stat-items').textContent = counts.items || res.summary.totalItems || '693';
          if ($('gd-stat-abilities')) $('gd-stat-abilities').textContent = counts.abilities || res.summary.totalAbilities || '267';
          if ($('gd-stat-types')) $('gd-stat-types').textContent = counts.types || res.summary.totalTypes || '19';
          if ($('gd-source-time') && res.summary.importedAt) {
            $('gd-source-time').textContent = 'Nạp: ' + fmtDate(res.summary.importedAt) + ' (' + (counts.forms || 339) + ' forms)';
          }
        }
      })
      .catch(function (err) {
        console.warn('Cannot load gamedata summary', err);
      });

    switchGdTab(gdState.tab || 'species');
  }

  function switchGdTab(tabName) {
    gdState.tab = tabName;
    document.querySelectorAll('.gd-nav-btn').forEach(function (btn) {
      var isActive = btn.dataset.gdTab === tabName;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('btn-primary', isActive);
      btn.classList.toggle('btn-ghost', !isActive);
    });

    document.querySelectorAll('.gd-tab-pane').forEach(function (pane) {
      pane.classList.toggle('hidden', pane.id !== 'gd-pane-' + tabName);
    });

    if (tabName === 'species') loadGameDataSpecies();
    else if (tabName === 'moves') loadGameDataMoves();
    else if (tabName === 'items') loadGameDataItems();
    else if (tabName === 'abilities') loadGameDataAbilities();
    else if (tabName === 'types') loadGameDataTypes();
  }

  function loadGameDataSpecies() {
    var st = gdState.species;
    var url = '/api/admin/gamedata/species?page=' + st.page + '&limit=' + st.limit;
    if (st.q) url += '&q=' + encodeURIComponent(st.q);
    if (st.gen) url += '&gen=' + encodeURIComponent(st.gen);
    if (st.type) url += '&type=' + encodeURIComponent(st.type);
    if (st.rarity) url += '&rarity=' + encodeURIComponent(st.rarity);

    var tbody = document.querySelector('#gd-species-table tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px;" class="dim">Đang tải danh sách Pokémon...</td></tr>';

    getJSON(url)
      .then(function (res) {
        st.data = res.species || [];
        st.total = res.total || 0;
        st.totalPages = res.totalPages || 1;

        if (tbody) {
          if (st.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px;" class="dim">Không tìm thấy Pokémon nào khớp điều kiện.</td></tr>';
          } else {
            tbody.innerHTML = st.data.map(function (s, idx) {
              var dexNum = s.dexNum || (st.page - 1) * st.limit + idx + 1;
              var dexStr = '#' + String(dexNum).padStart(3, '0');
              var typesBadges = (s.types || []).map(gdTypeBadge).join(' ');
              var stats = s.baseStats || {};
              var statsStr = '<span class="mono" style="font-size:12px;">' +
                (stats.hp || 0) + ' / ' +
                (stats.attack || 0) + ' / ' +
                (stats.defense || 0) + ' / ' +
                (stats.spAttack || 0) + ' / ' +
                (stats.spDefense || 0) + ' / ' +
                (stats.speed || 0) +
                '</span>';
              var bst = s.baseStatTotal || (
                (stats.hp || 0) +
                (stats.attack || 0) +
                (stats.defense || 0) +
                (stats.spAttack || 0) +
                (stats.spDefense || 0) +
                (stats.speed || 0)
              );
              var iconPath = '/assets/icons/pokemon/' + encodeURIComponent(s.id) + '.png';
              var fallbackIcon = '/assets/icons/pokemon/icon' + dexNum + '.png';

              return (
                '<tr>' +
                '<td style="text-align:center;"><img src="' + iconPath + '" onerror="this.onerror=null;this.src=\'' + fallbackIcon + '\';" style="width:32px; height:32px; image-rendering:pixelated; vertical-align:middle;" /></td>' +
                '<td class="mono font-semibold" style="color:#00cec9;">' + dexStr + '</td>' +
                '<td><strong style="font-size:14px;">' + esc(s.name) + '</strong><br><span class="dim" style="font-size:11px;">ID: ' + esc(s.id) + '</span></td>' +
                '<td>' + typesBadges + '</td>' +
                '<td style="font-size:12px;">' + esc(s.category || '—') + '</td>' +
                '<td>' + statsStr + '</td>' +
                '<td><strong class="mono" style="color:#fdcb6e;">' + bst + '</strong></td>' +
                '<td>' + gdRarityBadge(s.rarity) + '</td>' +
                '<td><button class="btn btn-sm btn-ghost" onclick="window._gdViewSpecies(\'' + esc(s.id) + '\')">Chi tiết</button></td>' +
                '</tr>'
              );
            }).join('');
          }
        }
        renderGdPagination('gd-species-pagination', st, 'window._gdPageSpecies');
      })
      .catch(function (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:#ff7675;">Lỗi tải dữ liệu: ' + esc(err.message) + '</td></tr>';
      });
  }

  function loadGameDataMoves() {
    var st = gdState.moves;
    var url = '/api/admin/gamedata/moves?page=' + st.page + '&limit=' + st.limit;
    if (st.q) url += '&q=' + encodeURIComponent(st.q);
    if (st.category) url += '&category=' + encodeURIComponent(st.category);
    if (st.type) url += '&type=' + encodeURIComponent(st.type);

    var tbody = document.querySelector('#gd-moves-table tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px;" class="dim">Đang tải danh sách chiêu thức...</td></tr>';

    getJSON(url)
      .then(function (res) {
        st.data = res.moves || [];
        st.total = res.total || 0;
        st.totalPages = res.totalPages || 1;

        if (tbody) {
          if (st.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px;" class="dim">Không tìm thấy chiêu thức nào.</td></tr>';
          } else {
            tbody.innerHTML = st.data.map(function (m) {
              var powerStr = m.power > 0 ? '<strong class="mono">' + m.power + '</strong>' : '<span class="dim">—</span>';
              var accStr = m.accuracy > 0 ? '<span class="mono">' + m.accuracy + '%</span>' : '<span class="dim">—</span>';
              return (
                '<tr>' +
                '<td><strong>' + esc(m.name) + '</strong><br><span class="dim mono" style="font-size:11px;">' + esc(m.id) + '</span></td>' +
                '<td>' + gdTypeBadge(m.type) + '</td>' +
                '<td>' + gdCategoryBadge(m.category) + '</td>' +
                '<td>' + powerStr + '</td>' +
                '<td>' + accStr + '</td>' +
                '<td class="mono">' + (m.pp || '—') + '</td>' +
                '<td style="font-size:12px;" class="dim">' + esc(m.target || '—') + '</td>' +
                '<td style="font-size:12px; max-width:320px;">' + esc(m.description || '—') + '</td>' +
                '</tr>'
              );
            }).join('');
          }
        }
        renderGdPagination('gd-moves-pagination', st, 'window._gdPageMoves');
      })
      .catch(function (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:#ff7675;">Lỗi tải dữ liệu: ' + esc(err.message) + '</td></tr>';
      });
  }

  function loadGameDataItems() {
    var st = gdState.items;
    var url = '/api/admin/gamedata/items?page=' + st.page + '&limit=' + st.limit;
    if (st.q) url += '&q=' + encodeURIComponent(st.q);
    if (st.category) url += '&category=' + encodeURIComponent(st.category);

    var tbody = document.querySelector('#gd-items-table tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px;" class="dim">Đang tải danh sách vật phẩm...</td></tr>';

    getJSON(url)
      .then(function (res) {
        st.data = res.items || [];
        st.total = res.total || 0;
        st.totalPages = res.totalPages || 1;

        if (tbody) {
          if (st.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px;" class="dim">Không tìm thấy vật phẩm nào.</td></tr>';
          } else {
            tbody.innerHTML = st.data.map(function (it) {
              var iconSrc = '/assets/icons/items/' + it.id + '.png';
              var priceStr = it.price > 0 ? '<span class="mono" style="color:#fdcb6e;">$' + it.price.toLocaleString() + '</span>' : '<span class="dim">Không bán</span>';
              var sellStr = it.sellPrice > 0 ? '<span class="mono">$' + it.sellPrice.toLocaleString() + '</span>' : '<span class="dim">—</span>';
              return (
                '<tr>' +
                '<td style="text-align:center;"><img src="' + iconSrc + '" onerror="this.style.display=\'none\';" style="width:24px; height:24px; image-rendering:pixelated; vertical-align:middle;" /></td>' +
                '<td><strong>' + esc(it.name) + '</strong><br><span class="dim mono" style="font-size:11px;">' + esc(it.id) + '</span></td>' +
                '<td><span class="badge">' + esc(it.category || 'misc') + '</span></td>' +
                '<td>' + priceStr + '</td>' +
                '<td>' + sellStr + '</td>' +
                '<td style="font-size:12px; max-width:350px;">' + esc(it.description || '—') + '</td>' +
                '</tr>'
              );
            }).join('');
          }
        }
        renderGdPagination('gd-items-pagination', st, 'window._gdPageItems');
      })
      .catch(function (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#ff7675;">Lỗi tải dữ liệu: ' + esc(err.message) + '</td></tr>';
      });
  }

  function loadGameDataAbilities() {
    var st = gdState.abilities;
    var url = '/api/admin/gamedata/abilities?page=' + st.page + '&limit=' + st.limit;
    if (st.q) url += '&q=' + encodeURIComponent(st.q);

    var tbody = document.querySelector('#gd-abilities-table tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:24px;" class="dim">Đang tải danh sách đặc tính...</td></tr>';

    getJSON(url)
      .then(function (res) {
        st.data = res.abilities || [];
        st.total = res.total || 0;
        st.totalPages = res.totalPages || 1;

        if (tbody) {
          if (st.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:24px;" class="dim">Không tìm thấy đặc tính nào.</td></tr>';
          } else {
            tbody.innerHTML = st.data.map(function (ab) {
              return (
                '<tr>' +
                '<td><strong>' + esc(ab.name) + '</strong><br><span class="dim mono" style="font-size:11px;">' + esc(ab.id) + '</span></td>' +
                '<td style="font-size:13px; line-height:1.5;">' + esc(ab.description || 'Chưa có mô tả chi tiết.') + '</td>' +
                '</tr>'
              );
            }).join('');
          }
        }
        renderGdPagination('gd-abilities-pagination', st, 'window._gdPageAbilities');
      })
      .catch(function (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:24px; color:#ff7675;">Lỗi tải dữ liệu: ' + esc(err.message) + '</td></tr>';
      });
  }

  function loadGameDataTypes() {
    var tbody = document.querySelector('#gd-types-table tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px;" class="dim">Đang nạp bảng hệ và tương khắc...</td></tr>';

    getJSON('/api/admin/gamedata/types')
      .then(function (res) {
        var typesList = res.types || [];
        var chart = res.chart || {};
        if (tbody) {
          if (typesList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px;" class="dim">Chưa có dữ liệu hệ.</td></tr>';
          } else {
            tbody.innerHTML = typesList.map(function (typeObj) {
              var tName = typeof typeObj === 'string' ? typeObj : (typeObj.name || typeObj.id);
              var defType = String(tName).toLowerCase();

              var weak = [];
              var resist = [];
              var immune = [];

              Object.keys(chart).forEach(function (atk) {
                var mult = chart[atk] && chart[atk][defType];
                if (mult === 2 || mult === 2.0) weak.push(atk);
                else if (mult === 0.5) resist.push(atk);
                else if (mult === 0) immune.push(atk);
              });

              return (
                '<tr>' +
                '<td>' + gdTypeBadge(defType) + '</td>' +
                '<td>' + (weak.length ? weak.map(gdTypeBadge).join(' ') : '<span class="dim">—</span>') + '</td>' +
                '<td>' + (resist.length ? resist.map(gdTypeBadge).join(' ') : '<span class="dim">—</span>') + '</td>' +
                '<td>' + (immune.length ? immune.map(gdTypeBadge).join(' ') : '<span class="dim">—</span>') + '</td>' +
                '</tr>'
              );
            }).join('');
          }
        }
      })
      .catch(function (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px; color:#ff7675;">Lỗi tải bảng hệ: ' + esc(err.message) + '</td></tr>';
      });
  }

  function openSpeciesDetailModal(speciesId) {
    var modal = $('gd-species-modal');
    var body = $('gd-modal-species-body');
    var title = $('gd-modal-species-title');
    if (!modal || !body) return;

    modal.classList.remove('hidden');
    title.textContent = 'Chi tiết Pokémon: #' + speciesId;
    body.innerHTML = '<div style="text-align:center; padding:40px;" class="dim">Đang tải thông tin chi tiết...</div>';

    getJSON('/api/admin/gamedata/species/' + encodeURIComponent(speciesId))
      .then(function (res) {
        var s = res.species;
        if (!s) throw new Error('Không có dữ liệu loài');

        title.textContent = '#' + String(s.dexNum).padStart(3, '0') + ' ' + s.name;
        var typesBadges = (s.types || []).map(gdTypeBadge).join(' ');
        var stats = s.baseStats || {};
        var bst = (stats.hp || 0) + (stats.attack || 0) + (stats.defense || 0) + (stats.spAttack || 0) + (stats.spDefense || 0) + (stats.speed || 0);

        function statBar(label, val, max, color) {
          var pct = Math.min(100, Math.round((val / (max || 255)) * 100));
          return (
            '<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:12px;">' +
            '<span style="width:75px; font-weight:600;">' + label + ':</span>' +
            '<span class="mono" style="width:36px; text-align:right; font-weight:bold;">' + val + '</span>' +
            '<div style="flex:1; background:#2d3748; height:10px; border-radius:5px; overflow:hidden;">' +
            '<div style="width:' + pct + '%; height:100%; background:' + color + '; border-radius:5px;"></div>' +
            '</div>' +
            '</div>'
          );
        }

        var evolutionsHtml = '<span class="dim">Không có tiến hoá tiếp theo</span>';
        if (s.evolutions && s.evolutions.length > 0) {
          evolutionsHtml = s.evolutions.map(function (ev) {
            var methodStr = ev.method;
            if (ev.parameter) methodStr += ' (' + ev.parameter + ')';
            return '<span class="badge" style="background:rgba(108,92,231,0.15); color:#a29bfe; border:1px solid #6c5ce7; margin-right:6px;">→ ' + esc(ev.to) + ' [' + esc(methodStr) + ']</span>';
          }).join(' ');
        }

        var movesHtml = '<span class="dim">Chưa có danh sách chiêu</span>';
        if (s.moves && s.moves.length > 0) {
          movesHtml = '<div style="max-height:180px; overflow-y:auto; border:1px solid #2d3748; border-radius:6px; padding:8px;">' +
            '<table style="width:100%; font-size:12px;">' +
            '<thead><tr><th style="width:60px;">Cấp</th><th>Chiêu thức</th></tr></thead>' +
            '<tbody>' +
            s.moves.map(function (m) {
              return '<tr><td class="mono font-semibold" style="color:#00cec9;">Lv. ' + m.level + '</td><td><strong>' + esc(m.move) + '</strong></td></tr>';
            }).join('') +
            '</tbody></table></div>';
        }

        var battlerImg = '/assets/battlers/front/' + encodeURIComponent(s.id) + '.png';
        var iconImg = '/assets/icons/pokemon/' + encodeURIComponent(s.id) + '.png';
        var cryUrl = '/assets/audio/cries/' + encodeURIComponent(s.id) + '.ogg';

        body.innerHTML =
          '<div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:20px;">' +
          '  <div style="text-align:center; min-width:140px; background:#1a202c; border:1px solid #2d3748; border-radius:8px; padding:16px;">' +
          '    <img src="' + battlerImg + '" onerror="this.src=\'' + iconImg + '\';this.style.width=\'80px\';this.style.height=\'80px\';" style="width:128px; height:128px; object-fit:contain; image-rendering:pixelated;" />' +
          '    <div style="margin-top:10px;">' + typesBadges + '</div>' +
          '    <div style="margin-top:6px;">' + gdRarityBadge(s.rarity) + '</div>' +
          '    <button class="btn btn-sm btn-ghost" onclick="new Audio(\'' + cryUrl + '\').play().catch(function(){});" style="margin-top:10px; width:100%; font-size:11px;" title="Phát tiếng kêu Pokémon">🔊 Nghe tiếng kêu</button>' +
          '  </div>' +
          '  <div style="flex:1; min-width:260px;">' +
          '    <div style="font-size:13px; color:#a0aec0; margin-bottom:4px;">' + esc(s.category || 'Pokémon') + '</div>' +
          '    <div style="font-size:13px; line-height:1.5; margin-bottom:12px; background:#232936; padding:10px; border-radius:6px; border-left:3px solid #00cec9;">' +
          esc(s.pokedexDescription || 'Dữ liệu Pokédex đang được cập nhật...') +
          '    </div>' +
          '    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px; margin-bottom:12px;">' +
          '      <div><span class="dim">Chiều cao:</span> <strong>' + (s.height || '—') + ' m</strong></div>' +
          '      <div><span class="dim">Cân nặng:</span> <strong>' + (s.weight || '—') + ' kg</strong></div>' +
          '      <div><span class="dim">Tỷ lệ bắt:</span> <strong class="mono">' + (s.catchRate || '—') + '</strong></div>' +
          '      <div><span class="dim">Kinh nghiệm gốc:</span> <strong class="mono">' + (s.baseExperience || '—') + '</strong></div>' +
          '      <div><span class="dim">Đặc tính:</span> <strong>' + (s.abilities ? s.abilities.join(', ') : '—') + '</strong></div>' +
          '      <div><span class="dim">Đặc tính ẩn:</span> <strong style="color:#fdcb6e;">' + (s.hiddenAbility || '—') + '</strong></div>' +
          '    </div>' +
          '  </div>' +
          '</div>' +
          '<div style="background:#1a202c; border:1px solid #2d3748; border-radius:8px; padding:16px; margin-bottom:16px;">' +
          '  <div style="display:flex; justify-content:space-between; margin-bottom:10px;">' +
          '    <h4 style="margin:0; font-size:14px;">Chỉ số cơ bản (Base Stats)</h4>' +
          '    <span class="mono" style="font-weight:bold; color:#fdcb6e;">Tổng BST: ' + bst + '</span>' +
          '  </div>' +
          statBar('HP', stats.hp || 0, 255, '#2ecc71') +
          statBar('Attack', stats.attack || 0, 255, '#e67e22') +
          statBar('Defense', stats.defense || 0, 255, '#f1c40f') +
          statBar('Sp. Atk', stats.spAttack || 0, 255, '#3498db') +
          statBar('Sp. Def', stats.spDefense || 0, 255, '#9b59b6') +
          statBar('Speed', stats.speed || 0, 255, '#e91e63') +
          '</div>' +
          '<div style="margin-bottom:16px;">' +
          '  <h4 style="margin:0 0 8px 0; font-size:14px;">Tuyến tiến hoá (Evolutions)</h4>' +
          evolutionsHtml +
          '</div>' +
          '<div>' +
          '  <h4 style="margin:0 0 8px 0; font-size:14px;">Chiêu thức học theo cấp (Level-up Moves)</h4>' +
          movesHtml +
          '</div>';
      })
      .catch(function (err) {
        body.innerHTML = '<div style="text-align:center; padding:40px; color:#ff7675;">Lỗi khi tải thông tin: ' + esc(err.message) + '</div>';
      });
  }

  // ── Sprites ─────────────────────────────────────────────────────────────
  function loadSprites() {
    getJSON('/api/admin/sprites')
      .then(function (d) {
        var list = d.sprites || [];
        fillTable('sprites-table', 'sprites-empty', list, function (s) {
          // 16 frame = lưới 4×4, 12 frame = dải ngang → crop ô đầu tiên (frame 0_0)
          var p128 = s.previewUrl128 || s.previewGif128 || s.sheetUrl;
          var p256 = s.previewUrl256 || s.sheetUrl;
          var pGif = s.previewGif256 || s.previewGif128 || p256;
          var thumbHtml = p128
            ? '<div class="sprite-thumb-preview" onclick="_previewSpriteModal(\'' +
              esc(s.name) +
              "','" +
              esc(p256) +
              "','" +
              esc(pGif) +
              '\')" title="' +
              esc(s.name) +
              ' — bấm xem 256px">' +
              '<img src="' +
              esc(p128) +
              '" alt="' +
              esc(s.name) +
              '" />' +
              '</div>'
            : '<span class="dim">—</span>';
          var modeColor =
            s.mode === 'atlas'
              ? 'rgba(253,203,110,.15);color:#fdcb6e'
              : 'rgba(0,184,148,.15);color:#00b894';
          return (
            '<tr><td>' +
            thumbHtml +
            '</td><td>' +
            '<span class="sprite-table-name">' +
            esc(s.name) +
            '</span>' +
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
            '<button class="btn btn-ghost btn-sm" onclick="_spriteDelete(\'' +
            esc(s.id) +
            "','" +
            esc(s.name) +
            '\')" title="' +
            esc(t('btn.delete')) +
            '">🗑</button>' +
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
          showMsg($('sprite-modal-msg'), e.message || t('sp.loadError'), 'error');
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
      showMsg($('sprite-modal-msg'), t('sp.nameRequired'), 'error');
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
          showMsg($('sprite-modal-msg'), d.message || t('common.error'), 'error');
        }
      })
      .catch(function (e) {
        showMsg($('sprite-modal-msg'), e.message || t('login.connectFail'), 'error');
      });
  }

  function deleteSprite(id, name) {
    $('confirm-text').textContent = t('sp.confirmDelete', { name: name });
    $('confirm-modal').classList.remove('hidden');
    $('confirm-delete').onclick = function () {
      postJSON('/api/admin/sprites/' + id, {}, 'DELETE')
        .then(function (d) {
          $('confirm-modal').classList.add('hidden');
          if (d.ok) loadSprites();
          else alert(d.message || t('u.deleteError'));
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
  window._spriteDelete = function (id, name) {
    deleteSprite(id, name);
  };
  window._gdPageSpecies = function (p) {
    gdState.species.page = p;
    loadGameDataSpecies();
  };
  window._gdViewSpecies = function (id) {
    openSpeciesDetailModal(id);
  };
  window._gdPageMoves = function (p) {
    gdState.moves.page = p;
    loadGameDataMoves();
  };
  window._gdPageItems = function (p) {
    gdState.items.page = p;
    loadGameDataItems();
  };
  window._gdPageAbilities = function (p) {
    gdState.abilities.page = p;
    loadGameDataAbilities();
  };

  var spritePreviewState = {
    name: '',
    staticUrl: '',
    gifUrl: '',
    isGif: false,
  };

  window._previewSpriteModal = function (name, staticUrl, gifUrl) {
    spritePreviewState.name = name;
    spritePreviewState.staticUrl = staticUrl;
    spritePreviewState.gifUrl = gifUrl || staticUrl;
    spritePreviewState.isGif = false;

    $('sprite-preview-title').textContent = name + ' (256×256)';
    $('sprite-preview-img').src = staticUrl;
    var toggleBtn = $('sprite-preview-toggle-mode');
    if (toggleBtn) {
      toggleBtn.textContent = '▶ Xem animation đi bộ';
      toggleBtn.style.display = gifUrl && gifUrl !== staticUrl ? '' : 'none';
    }
    $('sprite-preview-modal').classList.remove('hidden');
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
        else if (currentView === 'sprites') loadSprites();
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

    var userToggleBtn = $('user-sprite-view-toggle');
    if (userToggleBtn) {
      userToggleBtn.addEventListener('click', function () {
        userSpriteShowGif = !userSpriteShowGif;
        updateSpritePreview($('user-sprite').value);
      });
    }

    // Modal xem trước sprite 256px
    var closePreviewModal = function () {
      $('sprite-preview-modal').classList.add('hidden');
    };
    $('sprite-preview-close').addEventListener('click', closePreviewModal);
    $('sprite-preview-ok').addEventListener('click', closePreviewModal);
    $('sprite-preview-toggle-mode').addEventListener('click', function () {
      spritePreviewState.isGif = !spritePreviewState.isGif;
      var img = $('sprite-preview-img');
      if (spritePreviewState.isGif) {
        img.src = spritePreviewState.gifUrl;
        this.textContent = '⏸ Xem ảnh tĩnh';
      } else {
        img.src = spritePreviewState.staticUrl;
        this.textContent = '▶ Xem animation đi bộ';
      }
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
      showMsg($('sprite-modal-msg'), t('sp.exported'), 'ok');
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

    // ── Game Data Tabs & Filters ──
    document.querySelectorAll('.gd-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = this.dataset.gdTab;
        if (tab) switchGdTab(tab);
      });
    });

    var gdSpeciesTimer;
    if ($('gd-species-search')) {
      $('gd-species-search').addEventListener('input', function () {
        clearTimeout(gdSpeciesTimer);
        var val = this.value.trim();
        gdSpeciesTimer = setTimeout(function () {
          gdState.species.q = val;
          gdState.species.page = 1;
          loadGameDataSpecies();
        }, 300);
      });
    }

    if ($('gd-species-gen')) {
      $('gd-species-gen').addEventListener('change', function () {
        gdState.species.gen = this.value;
        gdState.species.page = 1;
        loadGameDataSpecies();
      });
    }

    if ($('gd-species-type')) {
      $('gd-species-type').addEventListener('change', function () {
        gdState.species.type = this.value;
        gdState.species.page = 1;
        loadGameDataSpecies();
      });
    }

    if ($('gd-species-rarity')) {
      $('gd-species-rarity').addEventListener('change', function () {
        gdState.species.rarity = this.value;
        gdState.species.page = 1;
        loadGameDataSpecies();
      });
    }

    var gdMovesTimer;
    if ($('gd-moves-search')) {
      $('gd-moves-search').addEventListener('input', function () {
        clearTimeout(gdMovesTimer);
        var val = this.value.trim();
        gdMovesTimer = setTimeout(function () {
          gdState.moves.q = val;
          gdState.moves.page = 1;
          loadGameDataMoves();
        }, 300);
      });
    }

    if ($('gd-moves-cat')) {
      $('gd-moves-cat').addEventListener('change', function () {
        gdState.moves.category = this.value;
        gdState.moves.page = 1;
        loadGameDataMoves();
      });
    }

    if ($('gd-moves-type')) {
      $('gd-moves-type').addEventListener('change', function () {
        gdState.moves.type = this.value;
        gdState.moves.page = 1;
        loadGameDataMoves();
      });
    }

    var gdItemsTimer;
    if ($('gd-items-search')) {
      $('gd-items-search').addEventListener('input', function () {
        clearTimeout(gdItemsTimer);
        var val = this.value.trim();
        gdItemsTimer = setTimeout(function () {
          gdState.items.q = val;
          gdState.items.page = 1;
          loadGameDataItems();
        }, 300);
      });
    }

    if ($('gd-items-cat')) {
      $('gd-items-cat').addEventListener('change', function () {
        gdState.items.category = this.value;
        gdState.items.page = 1;
        loadGameDataItems();
      });
    }

    var gdAbilitiesTimer;
    if ($('gd-abilities-search')) {
      $('gd-abilities-search').addEventListener('input', function () {
        clearTimeout(gdAbilitiesTimer);
        var val = this.value.trim();
        gdAbilitiesTimer = setTimeout(function () {
          gdState.abilities.q = val;
          gdState.abilities.page = 1;
          loadGameDataAbilities();
        }, 300);
      });
    }

    if ($('gd-modal-species-close')) {
      $('gd-modal-species-close').addEventListener('click', function () {
        $('gd-species-modal').classList.add('hidden');
      });
    }

    // ── Maps Management ──
    var mapState = {
      maps: [],
      currentId: null,
      currentDetail: null,
      currentLayer: 'composite',
      zoom: 1.0,
      showGrid: true,
      showCollision: true,
      showWarps: true,
      pickSpawnMode: false,
      tilesetImg: null,
    };

    window.loadMaps = function () {
      getJSON('/api/admin/maps')
        .then(function (d) {
          mapState.maps = d.maps || [];
          renderMapSelect();
          if (mapState.maps.length > 0) {
            var targetId = mapState.currentId || mapState.maps[0].mapId;
            if (!mapState.maps.some(function (m) { return m.mapId === targetId; })) {
              targetId = mapState.maps[0].mapId;
            }
            selectMap(targetId);
          }
        })
        .catch(function (err) {
          console.error('Failed to load maps:', err);
        });
    };

    function renderMapSelect() {
      var sel = $('map-select');
      if (!sel) return;
      sel.innerHTML = '';
      mapState.maps.forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = m.mapId;
        opt.textContent = m.name + ' (' + m.width + '×' + m.height + ')';
        sel.appendChild(opt);
      });
      if (mapState.currentId) sel.value = mapState.currentId;
    }

    function selectMap(id) {
      mapState.currentId = id;
      var sel = $('map-select');
      if (sel && sel.value !== id) sel.value = id;

      getJSON('/api/admin/maps/' + id)
        .then(function (d) {
          mapState.currentDetail = d;
          populateMapSidebar(d);
          renderMapCanvas();
        })
        .catch(function (err) {
          console.error('Failed to get map details:', err);
        });
    }

    function populateMapSidebar(d) {
      var m = d.map;
      var sc = d.sharedConfig || {};
      renderMapStats(d.stats);
      $('map-info-name').textContent = m.name || m.mapId;
      $('map-info-id').textContent = '#' + m.mapId;
      $('map-info-size').textContent = m.width + ' × ' + m.height + ' tiles (' + (m.width * 32) + '×' + (m.height * 32) + ' px)';
      $('map-info-type').textContent = m.mapType || 'town';
      $('map-info-env').textContent = (m.weather || 'sunny') + ' / ' + (m.music || 'none');

      var spawn = sc.spawn || (m.objects && m.objects.find(function (o) { return o.type === 'player_spawn' || o.type === 'npc_spawn'; })) || { x: 0, y: 0 };
      $('map-input-spawn-x').value = spawn.x !== undefined ? spawn.x : 0;
      $('map-input-spawn-y').value = spawn.y !== undefined ? spawn.y : 0;
      $('map-input-pvp').checked = Boolean(sc.pvp);
      $('map-input-encounter').value = sc.encounterRate !== undefined ? sc.encounterRate : 0;

      // Render warps
      var warps = (m.objects || []).filter(function (o) { return o.type === 'warp'; });
      $('map-warps-count').textContent = warps.length;
      var warpsList = $('map-warps-list');
      warpsList.innerHTML = '';
      if (warps.length === 0) {
        warpsList.innerHTML = '<div style="font-size: 11px; color: var(--text-dim);">Chưa có cổng warp nào</div>';
      } else {
        warps.forEach(function (w) {
          var el = document.createElement('div');
          el.className = 'item-row';
          el.style.padding = '6px 8px';
          el.style.fontSize = '12px';
          el.innerHTML = '<div style="font-weight: 500; color: var(--accent);">🚪 ' + (w.name || 'Warp') + ' <span style="font-family: monospace; color: var(--text-dim);">(' + w.x + ', ' + w.y + ')</span></div>' +
            '<div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">→ <strong>' + (w.toMap || '--') + '</strong> (' + w.toX + ', ' + w.toY + ')</div>';
          warpsList.appendChild(el);
        });
      }
    }

    /**
     * Render card "Thống kê Map" (Plan 41 Phase 5.5).
     * stats = { layers:[{name,cells}], tilePropsCount, collision:{...}, objects:{...}, encounters }
     */
    function renderMapStats(stats) {
      var layersEl = $('map-stats-layers');
      var colEl = $('map-stats-collision');
      var objEl = $('map-stats-objects');
      if (!layersEl || !colEl || !objEl) return;

      if (!stats) {
        layersEl.innerHTML = '<tr><td colspan="2" style="color: var(--text-dim);">--</td></tr>';
        colEl.innerHTML = '<tr><td colspan="2" style="color: var(--text-dim);">--</td></tr>';
        objEl.innerHTML = '<tr><td colspan="2" style="color: var(--text-dim);">--</td></tr>';
        return;
      }

      // Tile / Layer
      var rows = '';
      (stats.layers || []).forEach(function (l) {
        rows += '<tr><td style="padding: 2px 0;">' + l.name + '</td><td style="text-align: right; font-family: monospace;">' + l.cells + '</td></tr>';
      });
      rows += '<tr><td style="padding: 2px 0; color: var(--text-dim);">Tile có properties</td><td style="text-align: right; font-family: monospace;">' + (stats.tilePropsCount || 0) + '</td></tr>';
      layersEl.innerHTML = rows;

      // Va chạm
      var c = stats.collision || {};
      colEl.innerHTML =
        '<tr><td style="padding: 2px 0;">Tổng ô</td><td style="text-align: right; font-family: monospace;">' + (c.total || 0) + '</td></tr>' +
        '<tr><td style="padding: 2px 0; color: #4ade80;">Đi được</td><td style="text-align: right; font-family: monospace;">' + (c.walkable || 0) + '</td></tr>' +
        '<tr><td style="padding: 2px 0; color: #f87171;">Chặn</td><td style="text-align: right; font-family: monospace;">' + (c.blocked || 0) + '</td></tr>' +
        '<tr><td style="padding: 2px 0; color: #60a5fa;">Nước</td><td style="text-align: right; font-family: monospace;">' + (c.water || 0) + '</td></tr>' +
        '<tr><td style="padding: 2px 0; color: #a3e635;">Cỏ</td><td style="text-align: right; font-family: monospace;">' + (c.grass || 0) + '</td></tr>' +
        '<tr><td style="padding: 2px 0; color: #fbbf24;">Ledge</td><td style="text-align: right; font-family: monospace;">' + (c.ledge || 0) + '</td></tr>' +
        '<tr><td style="padding: 2px 0; color: #c084fc;">Warp</td><td style="text-align: right; font-family: monospace;">' + (c.warp || 0) + '</td></tr>';

      // Đối tượng
      var o = stats.objects || {};
      objEl.innerHTML =
        '<tr><td style="padding: 2px 0;">Warp</td><td style="text-align: right; font-family: monospace;">' + (o.warps || 0) + '</td></tr>' +
        '<tr><td style="padding: 2px 0;">Event</td><td style="text-align: right; font-family: monospace;">' + (o.events || 0) + '</td></tr>' +
        '<tr><td style="padding: 2px 0;">Encounters</td><td style="text-align: right; font-family: monospace;">' + (stats.encounters || 0) + '</td></tr>';
    }

    var tilesetCache = {};
    function ensureTilesetImage(tsPath, cb) {
      var src = '/assets/tilesets/Outdoor.png';
      if (tsPath && (tsPath.includes('Interior') || tsPath.includes('interior'))) {
        src = '/assets/tilesets/Interior general.png';
      }
      if (tilesetCache[src] && tilesetCache[src].complete) {
        cb(tilesetCache[src]);
        return;
      }
      var img = new Image();
      img.src = src;
      img.onload = function () {
        tilesetCache[src] = img;
        cb(img);
      };
      img.onerror = function () {
        console.error('Failed to load tileset image:', src);
      };
    }

    function renderMapCanvas() {
      var detail = mapState.currentDetail;
      if (!detail) return;

      var m = detail.map;
      var tiled = detail.tiled;
      var w = m.width;
      var h = m.height;
      var wPx = w * 32;
      var hPx = h * 32;

      var baseCanvas = $('map-base-canvas');
      var overlayCanvas = $('map-overlay-canvas');
      var container = $('map-canvas-container');

      baseCanvas.width = wPx;
      baseCanvas.height = hPx;
      overlayCanvas.width = wPx;
      overlayCanvas.height = hPx;
      container.style.width = wPx + 'px';
      container.style.height = hPx + 'px';

      applyMapZoom();

      var tsPath = (tiled && tiled.tilesets && tiled.tilesets[0]) ? tiled.tilesets[0].image : '';
      ensureTilesetImage(tsPath, function (tsImg) {
        var ctx = baseCanvas.getContext('2d');
        ctx.clearRect(0, 0, wPx, hPx);

        if (tiled && Array.isArray(tiled.layers)) {
          var layersToDraw = [];
          if (mapState.currentLayer === 'composite') {
            layersToDraw = tiled.layers.filter(function (l) { return l.type === 'tilelayer'; });
          } else {
            var idx = parseInt(mapState.currentLayer, 10);
            var tl = tiled.layers.filter(function (l) { return l.type === 'tilelayer'; });
            if (tl[idx]) layersToDraw = [tl[idx]];
          }

          layersToDraw.forEach(function (layer) {
            if (!layer.data) return;
            for (var i = 0; i < layer.data.length; i++) {
              var gid = layer.data[i];
              if (!gid || gid < 1) continue;
              var tileIdx = gid - 1;
              var col = tileIdx % 8;
              var row = Math.floor(tileIdx / 8);
              var sx = col * 32;
              var sy = row * 32;
              var dx = (i % w) * 32;
              var dy = Math.floor(i / w) * 32;
              if (sy + 32 <= tsImg.height) {
                ctx.drawImage(tsImg, sx, sy, 32, 32, dx, dy, 32, 32);
              }
            }
          });
        } else {
          ctx.fillStyle = '#223322';
          ctx.fillRect(0, 0, wPx, hPx);
        }

        renderMapOverlay();
      });
    }

    function renderMapOverlay() {
      var detail = mapState.currentDetail;
      if (!detail) return;

      var m = detail.map;
      var w = m.width;
      var h = m.height;
      var wPx = w * 32;
      var hPx = h * 32;

      var overlayCanvas = $('map-overlay-canvas');
      var ctx = overlayCanvas.getContext('2d');
      ctx.clearRect(0, 0, wPx, hPx);

      // Collision
      if (mapState.showCollision && m.collision && Array.isArray(m.collision.flags)) {
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            var flag = m.collision.flags[y * w + x];
          // CollisionFlag bitmask: BLOCKED=0x04, WATER=0x02 (cần surf)
          var isBlocked = (flag & 0x04) !== 0 || (flag & 0x02) !== 0;
          if (isBlocked) {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
              ctx.fillRect(x * 32, y * 32, 32, 32);
              ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
              ctx.lineWidth = 1;
              ctx.strokeRect(x * 32 + 0.5, y * 32 + 0.5, 31, 31);
              ctx.beginPath();
              ctx.moveTo(x * 32 + 8, y * 32 + 8);
              ctx.lineTo(x * 32 + 24, y * 32 + 24);
              ctx.moveTo(x * 32 + 24, y * 32 + 8);
              ctx.lineTo(x * 32 + 8, y * 32 + 24);
              ctx.stroke();
            }
          }
        }
      }

      // Grid
      if (mapState.showGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        for (var gx = 0; gx <= w; gx++) {
          ctx.beginPath();
          ctx.moveTo(gx * 32 + 0.5, 0);
          ctx.lineTo(gx * 32 + 0.5, hPx);
          ctx.stroke();
        }
        for (var gy = 0; gy <= h; gy++) {
          ctx.beginPath();
          ctx.moveTo(0, gy * 32 + 0.5);
          ctx.lineTo(wPx, gy * 32 + 0.5);
          ctx.stroke();
        }
      }

      // Warps
      var interactiveLayer = $('map-interactive-layer');
      interactiveLayer.innerHTML = '';
      if (mapState.showWarps && Array.isArray(m.objects)) {
        m.objects.forEach(function (obj) {
          if (obj.type === 'warp') {
            var pin = document.createElement('div');
            pin.style.position = 'absolute';
            pin.style.left = (obj.x * 32) + 'px';
            pin.style.top = (obj.y * 32) + 'px';
            pin.style.width = '32px';
            pin.style.height = '32px';
            pin.style.background = 'rgba(16, 185, 129, 0.5)';
            pin.style.border = '2px solid #10b981';
            pin.style.borderRadius = '4px';
            pin.style.cursor = 'pointer';
            pin.style.display = 'flex';
            pin.style.alignItems = 'center';
            pin.style.justifyContent = 'center';
            pin.style.fontSize = '14px';
            pin.title = (obj.name || 'Warp') + ' → ' + (obj.toMap || '--') + ' (' + obj.toX + ', ' + obj.toY + ')';
            pin.innerHTML = '🚪';
            interactiveLayer.appendChild(pin);
          }
        });
      }
    }

    function applyMapZoom() {
      var container = $('map-canvas-container');
      if (!container) return;
      container.style.transform = 'scale(' + mapState.zoom + ')';
      container.style.transformOrigin = 'center center';
      var resetBtn = $('map-btn-zoom-reset');
      if (resetBtn) resetBtn.textContent = Math.round(mapState.zoom * 100) + '%';
    }

    // Map Event listeners
    if ($('map-select')) {
      $('map-select').addEventListener('change', function (e) {
        selectMap(e.target.value);
      });
    }

    if ($('map-layer-select')) {
      $('map-layer-select').addEventListener('change', function (e) {
        mapState.currentLayer = e.target.value;
        renderMapCanvas();
      });
    }

    if ($('map-btn-grid')) {
      $('map-btn-grid').addEventListener('click', function (e) {
        mapState.showGrid = !mapState.showGrid;
        e.target.classList.toggle('active', mapState.showGrid);
        renderMapOverlay();
      });
    }

    if ($('map-btn-col')) {
      $('map-btn-col').addEventListener('click', function (e) {
        mapState.showCollision = !mapState.showCollision;
        e.target.classList.toggle('active', mapState.showCollision);
        renderMapOverlay();
      });
    }

    if ($('map-btn-warps')) {
      $('map-btn-warps').addEventListener('click', function (e) {
        mapState.showWarps = !mapState.showWarps;
        e.target.classList.toggle('active', mapState.showWarps);
        renderMapOverlay();
      });
    }

    if ($('map-btn-zoom-in')) {
      $('map-btn-zoom-in').addEventListener('click', function () {
        mapState.zoom = Math.min(mapState.zoom + 0.25, 3.0);
        applyMapZoom();
      });
    }

    if ($('map-btn-zoom-out')) {
      $('map-btn-zoom-out').addEventListener('click', function () {
        mapState.zoom = Math.max(mapState.zoom - 0.25, 0.5);
        applyMapZoom();
      });
    }

    if ($('map-btn-zoom-reset')) {
      $('map-btn-zoom-reset').addEventListener('click', function () {
        mapState.zoom = 1.0;
        applyMapZoom();
      });
    }

    if ($('map-btn-pick-spawn')) {
      $('map-btn-pick-spawn').addEventListener('click', function (e) {
        mapState.pickSpawnMode = !mapState.pickSpawnMode;
        e.target.classList.toggle('active', mapState.pickSpawnMode);
        e.target.textContent = mapState.pickSpawnMode ? '📍 Click Map...' : '📍 Pick';
      });
    }

    var viewport = $('map-viewport');
    if (viewport) {
      viewport.addEventListener('mousemove', function (e) {
        var container = $('map-canvas-container');
        if (!container || !mapState.currentDetail) return;
        var rect = container.getBoundingClientRect();
        var mouseX = (e.clientX - rect.left) / mapState.zoom;
        var mouseY = (e.clientY - rect.top) / mapState.zoom;
        var tileX = Math.floor(mouseX / 32);
        var tileY = Math.floor(mouseY / 32);
        var m = mapState.currentDetail.map;
        if (tileX >= 0 && tileX < m.width && tileY >= 0 && tileY < m.height) {
          var flag = m.collision && m.collision.flags ? m.collision.flags[tileY * m.width + tileX] : 0;
          var isBlocked = (flag & 0x04) !== 0 || (flag & 0x02) !== 0; // BLOCKED|WATER
          $('map-hud').textContent = 'Tile: (' + tileX + ', ' + tileY + ') | Đi được: ' + (isBlocked ? 'KHÔNG (Cản trở)' : 'CÓ');
        } else {
          $('map-hud').textContent = 'Tile: --, -- | Đi được: --';
        }
      });

      viewport.addEventListener('click', function (e) {
        if (!mapState.pickSpawnMode || !mapState.currentDetail) return;
        var container = $('map-canvas-container');
        var rect = container.getBoundingClientRect();
        var mouseX = (e.clientX - rect.left) / mapState.zoom;
        var mouseY = (e.clientY - rect.top) / mapState.zoom;
        var tileX = Math.floor(mouseX / 32);
        var tileY = Math.floor(mouseY / 32);
        var m = mapState.currentDetail.map;
        if (tileX >= 0 && tileX < m.width && tileY >= 0 && tileY < m.height) {
          $('map-input-spawn-x').value = tileX;
          $('map-input-spawn-y').value = tileY;
          mapState.pickSpawnMode = false;
          var btn = $('map-btn-pick-spawn');
          if (btn) {
            btn.classList.remove('active');
            btn.textContent = '📍 Pick';
          }
        }
      });
    }

    if ($('map-config-form')) {
      $('map-config-form').addEventListener('submit', function (e) {
        e.preventDefault();
        if (!mapState.currentId) return;
        var body = {
          name: $('map-info-name').textContent,
          pvp: $('map-input-pvp').checked,
          encounterRate: parseInt($('map-input-encounter').value, 10) || 0,
        };
        postJSON('/api/admin/maps/' + mapState.currentId, body, 'PATCH')
          .then(function () {
            alert('Đã lưu cấu hình map thành công!');
          })
          .catch(function (err) {
            alert('Lỗi lưu cấu hình: ' + err.message);
          });
      });
    }

    // Import modal handlers
    if ($('map-btn-import')) {
      $('map-btn-import').addEventListener('click', function () {
        $('map-import-modal').classList.remove('hidden');
      });
    }

    if ($('map-import-close')) {
      $('map-import-close').addEventListener('click', function () {
        $('map-import-modal').classList.add('hidden');
      });
    }

    if ($('map-import-cancel')) {
      $('map-import-cancel').addEventListener('click', function () {
        $('map-import-modal').classList.add('hidden');
      });
    }

    if ($('import-preset-select')) {
      $('import-preset-select').addEventListener('change', function (e) {
        var parts = e.target.value.split('|');
        if (parts.length === 4) {
          $('import-map-id').value = parts[0];
          $('import-slug').value = parts[1];
          $('import-name').value = parts[2];
          $('import-map-type').value = parts[3];
        }
      });
      // Trigger once for initial values
      $('import-preset-select').dispatchEvent(new Event('change'));
    }

    if ($('map-import-form')) {
      $('map-import-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var submitBtn = $('map-import-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang import...';

        var body = {
          mapId: parseInt($('import-map-id').value, 10),
          slug: $('import-slug').value.trim(),
          name: $('import-name').value.trim(),
          mapType: $('import-map-type').value,
        };

        postJSON('/api/admin/maps/import', body, 'POST')
          .then(function (res) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Bắt đầu Import';
            $('map-import-modal').classList.add('hidden');
            alert(res.message || 'Import bản đồ thành công!');
            mapState.currentId = body.slug;
            loadMaps();
          })
          .catch(function (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Bắt đầu Import';
            alert('Lỗi import: ' + err.message);
          });
      });
    }

    // ── Regenerate server JSON từ .tmj (Plan 41 Phase 5.4) ──
    if ($('map-btn-regenerate')) {
      $('map-btn-regenerate').addEventListener('click', function () {
        var id = mapState.currentId;
        if (!id) {
          alert('Vui lòng chọn map trước.');
          return;
        }
        var btn = $('map-btn-regenerate');
        if (!confirm('Regenerate server JSON cho map "' + id + '"?\n\nFile .tmj phải đã được lưu trong Tiled trước.')) return;

        var original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Đang build...';

        postJSON('/api/admin/maps/' + id + '/regenerate', {}, 'POST')
          .then(function (res) {
            btn.disabled = false;
            btn.textContent = original;
            var s = res.stats;
            var extra = s
              ? '\n\n📐 ' + s.width + '×' + s.height + ' · 🚪 ' + s.warps + ' warp · 📦 ' + s.objects + ' obj'
              : '';
            alert((res.message || 'Đã regenerate thành công!') + extra + '\n\nHãy restart server để nạp JSON mới.');
            loadMaps();
          })
          .catch(function (err) {
            btn.disabled = false;
            btn.textContent = original;
            alert('Lỗi regenerate: ' + err.message);
          });
      });
    }
  });
})();

