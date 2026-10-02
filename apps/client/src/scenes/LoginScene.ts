import Phaser from 'phaser';
import { t } from '../i18n';
import { ColyseusManager } from '../network/ColyseusManager';

declare global {
  interface Window {
    __API_BASE__?: string;
  }
}

/**
 * LoginScene — HTML overlay login/register.
 * Không dùng Phaser DOM element, tạo overlay HTML trực tiếp.
 * Tab 1: Login (username + password + nút "Vào game")
 * Tab 2: Register (username + password + display name + nút "Tạo tài khoản")
 */

type AuthResponse = {
  ok: boolean;
  token?: string;
  userId?: string;
  displayName?: string;
  code?: string;
  message?: string;
};

export class LoginScene extends Phaser.Scene {
  private overlayEl: HTMLDivElement | null = null;

  constructor() {
    super('Login');
  }

  create() {
    // Xoá overlay cũ nếu replay scene
    this.destroyOverlay();
    this.createOverlay();
  }

  private createOverlay(): void {
    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:1000;
      display:flex; align-items:center; justify-content:center;
      background: linear-gradient(135deg, #0f1020 0%, #161830 50%, #1c1f3a 100%);
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #e8eaf6;
      overflow-y:auto; padding:16px 0;
    `;

    overlay.innerHTML = `
      <div style="
        width:380px; max-width:92vw;
        max-height:calc(100vh - 32px); overflow-y:auto;
        background: #1c1f3a;
        border:1px solid #2e3358;
        border-radius:12px;
        padding:clamp(16px, 4vh, 36px) 32px clamp(14px, 3vh, 28px);
        box-shadow: 0 12px 48px rgba(0,0,0,0.5);
        box-sizing:border-box;
      ">
        <!-- Brand -->
        <div style="text-align:center; margin-bottom:28px;">
          <div style="font-size:28px; color:#00cec9; margin-bottom:4px;">◈</div>
          <h1 style="margin:0; font-size:26px; font-weight:700; color:#e8eaf6;">Pixelmon</h1>
          <p style="margin:6px 0 0; font-size:13px; color:#9aa0c3;">Pokémon MMORPG trên web</p>
        </div>

        <!-- Tabs -->
        <div id="auth-tabs" style="
          display:flex; gap:0; margin-bottom:24px;
          background:#161830; border-radius:8px; padding:3px;
        ">
          <button class="auth-tab active" data-tab="login"
            style="flex:1; padding:9px 0; border:none; border-radius:6px;
            background:#2e3358; color:#fff; font-size:14px; font-weight:600; cursor:pointer;">
            Đăng nhập
          </button>
          <button class="auth-tab" data-tab="register"
            style="flex:1; padding:9px 0; border:none; border-radius:6px;
            background:transparent; color:#9aa0c3; font-size:14px; font-weight:500; cursor:pointer;">
            Đăng ký
          </button>
        </div>

        <!-- Login Form -->
        <form id="login-form" autocomplete="on">
          <label style="display:block; margin-bottom:14px;">
            <span style="display:block; font-size:12px; color:#9aa0c3; margin-bottom:5px; font-weight:500;">Tên đăng nhập</span>
            <input name="username" type="text" placeholder="username"
              autocomplete="username"
              style="width:100%; padding:10px 12px; font-size:14px;
              background:#0f1020; border:1px solid #2e3358; border-radius:6px;
              color:#e8eaf6; outline:none; box-sizing:border-box;"
              required />
          </label>
          <label style="display:block; margin-bottom:18px;">
            <span style="display:block; font-size:12px; color:#9aa0c3; margin-bottom:5px; font-weight:500;">Mật khẩu</span>
            <input name="password" type="password" placeholder="••••••"
              autocomplete="current-password"
              style="width:100%; padding:10px 12px; font-size:14px;
              background:#0f1020; border:1px solid #2e3358; border-radius:6px;
              color:#e8eaf6; outline:none; box-sizing:border-box;"
              required />
          </label>
          <div id="login-msg" style="display:none; padding:8px 12px; border-radius:6px;
            font-size:13px; margin-bottom:14px;"></div>
          <button type="submit" id="login-btn"
            style="width:100%; padding:11px 0; border:none; border-radius:8px;
            background:linear-gradient(90deg,#6c5ce7,#00cec9); color:#fff;
            font-size:15px; font-weight:600; cursor:pointer;">
            Vào game
          </button>
        </form>

        <!-- Register Form (hidden) -->
        <form id="register-form" style="display:none;" autocomplete="on">
          <label style="display:block; margin-bottom:14px;">
            <span style="display:block; font-size:12px; color:#9aa0c3; margin-bottom:5px; font-weight:500;">Tên đăng nhập</span>
            <input name="username" type="text" placeholder="3-20 ký tự, chữ/số/_"
              autocomplete="username"
              style="width:100%; padding:10px 12px; font-size:14px;
              background:#0f1020; border:1px solid #2e3358; border-radius:6px;
              color:#e8eaf6; outline:none; box-sizing:border-box;"
              required />
          </label>
          <label style="display:block; margin-bottom:14px;">
            <span style="display:block; font-size:12px; color:#9aa0c3; margin-bottom:5px; font-weight:500;">Tên hiển thị</span>
            <input name="displayName" type="text" placeholder="tên nhân vật"
              autocomplete="name"
              style="width:100%; padding:10px 12px; font-size:14px;
              background:#0f1020; border:1px solid #2e3358; border-radius:6px;
              color:#e8eaf6; outline:none; box-sizing:border-box;"
              required />
          </label>
          <label style="display:block; margin-bottom:18px;">
            <span style="display:block; font-size:12px; color:#9aa0c3; margin-bottom:5px; font-weight:500;">Mật khẩu</span>
            <input name="password" type="password" placeholder="tối thiểu 6 ký tự"
              autocomplete="new-password"
              style="width:100%; padding:10px 12px; font-size:14px;
              background:#0f1020; border:1px solid #2e3358; border-radius:6px;
              color:#e8eaf6; outline:none; box-sizing:border-box;"
              required />
          </label>
          <label style="display:block; margin-bottom:14px;">
            <span style="display:block; font-size:12px; color:#9aa0c3; margin-bottom:5px; font-weight:500;">Xác nhận mật khẩu</span>
            <input name="confirmPassword" type="password" placeholder="nhập lại mật khẩu"
              autocomplete="new-password"
              style="width:100%; padding:10px 12px; font-size:14px;
              background:#0f1020; border:1px solid #2e3358; border-radius:6px;
              color:#e8eaf6; outline:none; box-sizing:border-box;"
              required />
          </label>
          <div style="margin-bottom:18px;">
            <span style="display:block; font-size:12px; color:#9aa0c3; margin-bottom:8px; font-weight:500;">
              Chọn nhân vật đại diện
            </span>
            <input type="hidden" name="spriteId" id="reg-sprite-id" value="" />
            <div id="reg-sprite-list" style="display:flex; gap:10px; overflow-x:auto; padding:4px 2px 8px 2px; scrollbar-width:thin;">
              <span style="font-size:12px; color:#718096;">Đang tải danh sách nhân vật…</span>
            </div>
          </div>
          <div id="register-msg" style="display:none; padding:8px 12px; border-radius:6px;
            font-size:13px; margin-bottom:14px;"></div>
          <button type="submit" id="register-btn"
            style="width:100%; padding:11px 0; border:none; border-radius:8px;
            background:linear-gradient(90deg,#00b894,#00cec9); color:#fff;
            font-size:15px; font-weight:600; cursor:pointer;">
            Tạo tài khoản
          </button>
        </form>

        <p style="text-align:center; margin-top:18px; font-size:12px; color:#9aa0c3;">
          Guest? Nhập bất kỳ username + bấm "Vào game" để chơi offline.
        </p>

        <!-- DEV: vào thẳng game bằng admin (không cần nhập) -->
        <button id="dev-admin-btn"
          style="width:100%; margin-top:12px; padding:9px 0;
            border:1px dashed #6c5ce7; border-radius:8px;
            background:rgba(108,92,231,0.12); color:#6c5ce7;
            font-size:13px; font-weight:600; cursor:pointer;">
          ⚡ DEV: Vào ngay bằng admin/admin123
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlayEl = overlay;

    // Wire events
    this.wireTabs(overlay);
    this.wireLogin(overlay);
    this.wireRegister(overlay);
    this.wireDevQuickLogin(overlay);
  }

  /** DEV: 1 cú bấm vào thẳng World bằng admin. */
  private wireDevQuickLogin(root: HTMLElement): void {
    const btn = root.querySelector<HTMLButtonElement>('#dev-admin-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = t('LOG_DEV_ENTER');
      try {
        await ColyseusManager.getInstance().connect('admin', 'admin123');
        this.destroyOverlay();
        this.scene.start('World');
      } catch (err) {
        console.warn('[dev] admin quick login failed (offline?):', err);
        // vẫn vào World ở chế độ offline
        this.destroyOverlay();
        this.scene.start('World');
      }
    });
  }

  private wireTabs(root: HTMLElement): void {
    const tabs = root.querySelectorAll<HTMLElement>('.auth-tab');
    const loginForm = root.querySelector<HTMLFormElement>('#login-form')!;
    const registerForm = root.querySelector<HTMLFormElement>('#register-form')!;

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab!;
        tabs.forEach((t) => {
          const isActive = t.dataset.tab === target;
          t.classList.toggle('active', isActive);
          t.style.background = isActive ? '#2e3358' : 'transparent';
          t.style.color = isActive ? '#fff' : '#9aa0c3';
        });
        loginForm.style.display = target === 'login' ? '' : 'none';
        registerForm.style.display = target === 'register' ? '' : 'none';
        // Clear old messages
        this.hideMsg(root, 'login-msg');
        this.hideMsg(root, 'register-msg');
      });
    });
  }

  private wireLogin(root: HTMLElement): void {
    const form = root.querySelector<HTMLFormElement>('#login-form')!;
    const msgEl = root.querySelector<HTMLDivElement>('#login-msg')!;
    const btn = root.querySelector<HTMLButtonElement>('#login-btn')!;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const username = String(fd.get('username') ?? '').trim();
      const password = String(fd.get('password') ?? '').trim();
      if (!username || !password) {
        this.showMsg(msgEl, t('LOG_REQUIRED_FIELDS'), 'warn');
        return;
      }

      btn.disabled = true;
      btn.textContent = t('LOG_SIGNING_IN');
      this.hideMsg(root, 'login-msg');

      try {
        await ColyseusManager.getInstance().connect(username, password);
        this.destroyOverlay();
        this.scene.start('World');
      } catch (err: any) {
        const msg = err?.message || t('LOG_NO_SERVER');
        this.showMsg(msgEl, msg, 'error');
        btn.disabled = false;
        btn.textContent = t('LOG_ENTER_GAME');
      }
    });
  }

  private wireRegister(root: HTMLElement): void {
    const form = root.querySelector<HTMLFormElement>('#register-form')!;
    const msgEl = root.querySelector<HTMLDivElement>('#register-msg')!;
    const btn = root.querySelector<HTMLButtonElement>('#register-btn')!;
    const spriteListEl = root.querySelector<HTMLDivElement>('#reg-sprite-list');
    const spriteInput = root.querySelector<HTMLInputElement>('#reg-sprite-id');

    const API_BASE =
      window.__API_BASE__ ||
      (window.location.port === '5173' ? 'http://localhost:2567' : window.location.origin);

    // Tải danh sách sprite để người chơi chọn
    if (spriteListEl) {
      fetch(API_BASE + '/api/sprites')
        .then((r) => r.json())
        .then(
          (d: {
            ok: boolean;
            sprites?: Array<{
              id: string;
              name: string;
              previewUrl128?: string;
              sheetUrl?: string;
            }>;
          }) => {
            if (!d.ok || !d.sprites || d.sprites.length === 0) {
              spriteListEl.innerHTML =
                t('LOG_SPRITE_DEFAULT');
              return;
            }
            spriteListEl.innerHTML = '';
            d.sprites.forEach((s, idx) => {
              const card = document.createElement('div');
              card.className = 'reg-sprite-card';
              card.dataset.id = s.id;
              const isFirst = idx === 0;
              if (isFirst && spriteInput) spriteInput.value = s.id;

              card.style.cssText =
                'flex: 0 0 auto; width: 62px; padding: 6px 4px; display: flex; flex-direction: column; align-items: center; gap: 4px; background: #14172b; border: 2px solid ' +
                (isFirst ? '#00cec9' : '#2e3358') +
                '; border-radius: 8px; cursor: pointer; transition: all 0.15s ease;';

              const previewUrl = s.previewUrl128
                ? s.previewUrl128.startsWith('/')
                  ? API_BASE + s.previewUrl128
                  : s.previewUrl128
                : s.sheetUrl?.startsWith('/')
                  ? API_BASE + s.sheetUrl
                  : s.sheetUrl || '';

              card.innerHTML =
                '<img src="' +
                previewUrl +
                '" alt="' +
                s.name +
                '" style="width:38px; height:38px; object-fit:contain; image-rendering:pixelated; border-radius:4px;" />' +
                '<span style="font-size:10px; color:' +
                (isFirst ? '#00cec9' : '#9aa0c3') +
                '; max-width:56px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
                s.name +
                '</span>';

              card.addEventListener('click', () => {
                root.querySelectorAll('.reg-sprite-card').forEach((el) => {
                  const c = el as HTMLElement;
                  c.style.borderColor = '#2e3358';
                  const sp = c.querySelector('span');
                  if (sp) sp.style.color = '#9aa0c3';
                });
                card.style.borderColor = '#00cec9';
                const span = card.querySelector('span');
                if (span) span.style.color = '#00cec9';
                if (spriteInput) spriteInput.value = s.id;
              });

              spriteListEl.appendChild(card);
            });
          },
        )
        .catch(() => {
          if (spriteListEl)
            spriteListEl.innerHTML =
              `<span style="font-size:12px; color:#718096;">${t('LOG_SPRITES_LOAD_FAIL')}</span>`;
        });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const username = String(fd.get('username') ?? '').trim();
      const displayName = String(fd.get('displayName') ?? '').trim();
      const password = String(fd.get('password') ?? '').trim();
      const confirmPassword = String(fd.get('confirmPassword') ?? '').trim();
      const spriteId = String(fd.get('spriteId') ?? '').trim() || null;

      if (!username || !displayName || !password || !confirmPassword) {
        this.showMsg(msgEl, t('LOG_REQUIRED_FIELDS'), 'warn');
        return;
      }
      if (username.length < 3) {
        this.showMsg(msgEl, t('LOG_USER_MIN3'), 'warn');
        return;
      }
      if (password.length < 6) {
        this.showMsg(msgEl, t('LOG_PASS_MIN6'), 'warn');
        return;
      }
      if (password !== confirmPassword) {
        this.showMsg(msgEl, t('LOG_PASS_MISMATCH'), 'warn');
        return;
      }

      btn.disabled = true;
      btn.textContent = t('LOG_CREATING');
      this.hideMsg(root, 'register-msg');

      try {
        const res = await fetch(API_BASE + '/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, displayName, spriteId }),
        });
        const data: AuthResponse = await res.json();
        if (!data.ok) {
          this.showMsg(msgEl, data.message || t('LOG_REGISTER_FAIL'), 'error');
          btn.disabled = false;
          btn.textContent = t('LOG_CREATE_ACCOUNT');
          return;
        }
        // Thành công → tự đăng nhập
        await ColyseusManager.getInstance().connect(username, password);
        this.destroyOverlay();
        this.scene.start('World');
      } catch {
        this.showMsg(msgEl, t('LOG_SERVER_RETRY'), 'error');
        btn.disabled = false;
        btn.textContent = t('LOG_CREATE_ACCOUNT');
      }
    });
  }

  private showMsg(el: HTMLElement, text: string, type: 'error' | 'warn' | 'ok'): void {
    const colors: Record<string, { bg: string; color: string }> = {
      error: { bg: 'rgba(255,118,117,0.15)', color: '#ff7675' },
      warn: { bg: 'rgba(253,203,110,0.15)', color: '#fdcb6e' },
      ok: { bg: 'rgba(0,184,148,0.15)', color: '#00b894' },
    };
    const c = colors[type] ?? colors.error;
    el.style.display = 'block';
    el.style.background = c.bg;
    el.style.color = c.color;
    el.textContent = text;
  }

  private hideMsg(root: HTMLElement, id: string): void {
    const el = root.querySelector<HTMLDivElement>(`#${id}`);
    if (el) el.style.display = 'none';
  }

  private destroyOverlay(): void {
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }

  shutdown(): void {
    this.destroyOverlay();
  }
}
