import Phaser from 'phaser';
import { networkManager } from '../network/NetworkManager.js';

export default class LoginScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoginScene' });
  }

  preload() {
    this.load.image('logo', 'assets/logo.png');
  }

  create() {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    // Title text
    this.add
      .text(centerX, centerY - 100, 'Pixelmon MMORPG', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Create login form using DOM element
    const formHtml = `
      <div style="text-align:center; font-family:monospace;">
        <input id="username" placeholder="Username" style="padding:8px; margin:4px; width:200px;" />
        <input id="password" type="password" placeholder="Password" style="padding:8px; margin:4px; width:200px;" />
        <button id="loginBtn" style="padding:8px 16px; margin:8px; cursor:pointer;">Login</button>
        <p id="status" style="color:#ff0000;"></p>
      </div>
    `;

    this.add.dom(centerX, centerY).createFromHTML(formHtml);

    // Attach event listener after DOM is ready
    setTimeout(() => {
      const btn = document.getElementById('loginBtn') as HTMLButtonElement | null;
      if (btn) {
        btn.addEventListener('click', () => this.handleLogin());
      }
    }, 100);
  }

  private async handleLogin() {
    const username =
      (document.getElementById('username') as HTMLInputElement)?.value ?? '';
    const password =
      (document.getElementById('password') as HTMLInputElement)?.value ?? '';
    const statusEl = document.getElementById('status') as HTMLElement | null;

    if (!username || !password) {
      if (statusEl) statusEl.textContent = 'Please enter username and password';
      return;
    }

    try {
      if (statusEl) statusEl.textContent = 'Logging in...';
      await networkManager.login(username, password);
      if (statusEl) statusEl.textContent = 'Success! Loading world...';
      setTimeout(() => this.scene.start('WorldScene'), 1000);
    } catch (err) {
      if (statusEl) statusEl.textContent = `Login failed: ${(err as Error).message}`;
    }
  }
}
