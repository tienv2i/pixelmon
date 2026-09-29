import { Client } from 'colyseus.js';
import type { Room } from 'colyseus.js';

const TOKEN_KEY = 'pixelmon_token';
const API_BASE = `upstream service}:3000`;
const WS_BASE = `ws://${location.hostname}:2567`;

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

class NetworkManager {
  private client: Client | null = null;
  private currentRoom: Room | null = null;
  private token: string | null = null;

  connect() {
    if (this.client) return this.client;
    this.client = new Client(WS_BASE);
    return this.client;
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem(TOKEN_KEY, token);
  }

  loadToken() {
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  async register(email: string, username: string, password: string): Promise<AuthUser> {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    this.setToken(data.token);
    return data.user;
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    this.setToken(data.token);
    return data.user;
  }

  logout() {
    this.clearToken();
    this.leave();
  }

  async joinWorld(): Promise<Room> {
    if (!this.client) this.connect();
    if (!this.token) throw new Error('Not authenticated');
    this.currentRoom = await this.client!.joinOrCreate('world', { token: this.token });
    return this.currentRoom;
  }

  async joinBattle(): Promise<Room> {
    if (!this.client) this.connect();
    if (!this.token) throw new Error('Not authenticated');
    this.currentRoom = await this.client!.joinOrCreate('battle', { token: this.token });
    return this.currentRoom;
  }

  leave() {
    this.currentRoom?.leave(false);
    this.currentRoom = null;
  }
}

export const networkManager = new NetworkManager();
