// Landing page — đếm số liệu + xử lý form đăng nhập / đăng ký.
(function () {
  'use strict';

  var GAME_URL = window.__GAME_URL__ || 'http://localhost:5173';
  var API_BASE =
    window.__API_BASE__ ||
    (window.location.port === '5173' ? 'http://localhost:2567' : window.location.origin);

  // ── Đếm số liệu thống kê ──
  var counters = document.querySelectorAll('[data-count]');
  counters.forEach(function (el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var duration = 900;
    var start = null;

    function tick(now) {
      if (start === null) start = now;
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  });

  // ── Helpers ──
  function $(id) {
    return document.getElementById(id);
  }

  function showMsg(el, text, type) {
    var colors = {
      error: { bg: 'rgba(255,118,117,0.15)', color: '#ff7675' },
      warn: { bg: 'rgba(253,203,110,0.15)', color: '#fdcb6e' },
      ok: { bg: 'rgba(0,184,148,0.15)', color: '#00b894' },
    };
    var c = colors[type] || colors.error;
    el.style.display = 'block';
    el.style.background = c.bg;
    el.style.color = c.color;
    el.textContent = text;
  }

  function hideMsg(el) {
    el.style.display = 'none';
    el.textContent = '';
  }

  function storeSession(data) {
    try {
      localStorage.setItem('pixelmon.token', data.token || '');
      localStorage.setItem('pixelmon.userId', data.userId || '');
      localStorage.setItem('pixelmon.displayName', data.displayName || '');
    } catch {
      /* localStorage bị chặn — bỏ qua */
    }
  }

  function setButton(btn, busy, busyText, idleText) {
    btn.disabled = busy;
    btn.textContent = busy ? busyText : idleText;
  }

  // ── Form đăng nhập ──
  var loginForm = $('home-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('home-login-msg');
      var btn = loginForm.querySelector('button[type=submit]');
      var fd = new FormData(loginForm);
      var username = String(fd.get('username') || '').trim();
      var password = String(fd.get('password') || '').trim();

      if (!username || !password) {
        showMsg(msg, 'Vui lòng nhập đầy đủ thông tin.', 'warn');
        return;
      }

      setButton(btn, true, 'Đang đăng nhập…', 'Vào game');
      hideMsg(msg);

      fetch(API_BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
      })
        .then(function (r) {
          return r.json().then(function (d) {
            return { ok: r.ok, status: r.status, data: d };
          });
        })
        .then(function (res) {
          if (!res.ok) {
            var m = res.data && res.data.message ? res.data.message : 'Đăng nhập thất bại';
            if (res.status === 401) m = 'Sai tên đăng nhập hoặc mật khẩu';
            showMsg(msg, m, 'error');
            setButton(btn, false, '', 'Vào game');
            return;
          }
          storeSession(res.data);
          showMsg(msg, 'Đăng nhập thành công! Đang vào game…', 'ok');
          setButton(btn, true, 'Đang chuyển hướng…', 'Vào game');
          setTimeout(function () {
            window.location.href = GAME_URL;
          }, 700);
        })
        .catch(function () {
          showMsg(msg, 'Không thể kết nối server.', 'error');
          setButton(btn, false, '', 'Vào game');
        });
    });
  }

  // ── Form đăng ký ──
  var registerForm = $('home-register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('home-register-msg');
      var btn = registerForm.querySelector('button[type=submit]');
      var fd = new FormData(registerForm);
      var username = String(fd.get('username') || '').trim();
      var displayName = String(fd.get('displayName') || '').trim();
      var password = String(fd.get('password') || '').trim();
      var confirmPassword = String(fd.get('confirmPassword') || '').trim();

      if (!username || !displayName || !password || !confirmPassword) {
        showMsg(msg, 'Vui lòng nhập đầy đủ thông tin.', 'warn');
        return;
      }
      if (username.length < 3) {
        showMsg(msg, 'Tên đăng nhập tối thiểu 3 ký tự.', 'warn');
        return;
      }
      if (password.length < 6) {
        showMsg(msg, 'Mật khẩu tối thiểu 6 ký tự.', 'warn');
        return;
      }
      if (password !== confirmPassword) {
        showMsg(msg, 'Mật khẩu xác nhận không khớp.', 'warn');
        return;
      }

      setButton(btn, true, 'Đang tạo…', 'Tạo tài khoản');
      hideMsg(msg);

      fetch(API_BASE + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          password: password,
          displayName: displayName,
        }),
      })
        .then(function (r) {
          return r.json().then(function (d) {
            return { ok: r.ok, status: r.status, data: d };
          });
        })
        .then(function (res) {
          if (!res.ok) {
            var m = res.data && res.data.message ? res.data.message : 'Đăng ký thất bại';
            if (res.status === 409) m = 'Tên đăng nhập đã tồn tại';
            showMsg(msg, m, 'error');
            setButton(btn, false, '', 'Tạo tài khoản');
            return;
          }
          // Đăng ký xong → đăng nhập luôn
          return fetch(API_BASE + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password }),
          })
            .then(function (r2) {
              return r2.json();
            })
            .then(function (loginData) {
              storeSession(loginData);
              showMsg(msg, 'Tạo tài khoản thành công! Đang vào game…', 'ok');
              setButton(btn, true, 'Đang chuyển hướng…', 'Tạo tài khoản');
              setTimeout(function () {
                window.location.href = GAME_URL;
              }, 700);
            });
        })
        .catch(function () {
          showMsg(msg, 'Không thể kết nối server.', 'error');
          setButton(btn, false, '', 'Tạo tài khoản');
        });
    });
  }

  // ── Nút "Vào game" cuộn xuống form đăng nhập ──
  var playBtn = $('play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var target = $('auth-section');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
})();
