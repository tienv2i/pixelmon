import Phaser from 'phaser';

/**
 * Registry danh sách file âm thanh có sẵn từ `packages/shared/assets/audio/`.
 * Các file này được server phục vụ qua endpoint `/assets/audio/...`.
 */
const BGM_MANIFEST: Record<string, string> = {
  // Battle BGM
  battle_trainer: '/assets/audio/bgm/battle trainer.ogg',
  'battle trainer': '/assets/audio/bgm/battle trainer.ogg',
  battle_wild: '/assets/audio/bgm/battle wild.ogg',
  'battle wild': '/assets/audio/bgm/battle wild.ogg',
  battle_victory: '/assets/audio/bgm/battle victory.ogg',
  battle_victory_trainer: '/assets/audio/bgm/battle victory trainer.ogg',
  battle_victory_wild: '/assets/audio/bgm/battle victory wild.ogg',
  battle_victory_leader: '/assets/audio/bgm/battle victory leader.ogg',

  // Route & City BGM (ogg)
  bicycle: '/assets/audio/bgm/bicycle.ogg',
  surfing: '/assets/audio/bgm/surfing.ogg',
  title: '/assets/audio/bgm/title.ogg',
  evolution: '/assets/audio/bgm/evolution.ogg',
};

const SE_MANIFEST: Record<string, string> = {
  // GUI SE
  gui_menu_open: '/assets/audio/se/gui menu open.ogg',
  gui_menu_close: '/assets/audio/se/gui menu close.ogg',
  gui_sel_cursor: '/assets/audio/se/gui sel cursor.ogg',
  gui_sel_decision: '/assets/audio/se/gui sel decision.ogg',
  gui_sel_cancel: '/assets/audio/se/gui sel cancel.ogg',
  gui_sel_buzzer: '/assets/audio/se/gui sel buzzer.ogg',
  gui_party_switch: '/assets/audio/se/gui party switch.ogg',
  gui_pokedex_open: '/assets/audio/se/gui pokedex open.ogg',

  // Battle SE
  battle_throw: '/assets/audio/se/battle throw.ogg',
  battle_ball_shake: '/assets/audio/se/battle ball shake.ogg',
  battle_ball_hit: '/assets/audio/se/battle ball hit.ogg',
  battle_ball_drop: '/assets/audio/se/battle ball drop.ogg',
  battle_catch_click: '/assets/audio/se/battle catch click.ogg',
  battle_flee: '/assets/audio/se/battle flee.ogg',
  battle_damage_normal: '/assets/audio/se/battle damage normal.ogg',
  battle_damage_super: '/assets/audio/se/battle damage super.ogg',
  battle_damage_weak: '/assets/audio/se/battle damage weak.ogg',
  battle_recall: '/assets/audio/se/battle recall.ogg',
  battle_jump_to_ball: '/assets/audio/se/battle jump to ball.ogg',

  // World & Pokemon SE
  door_enter: '/assets/audio/se/door enter.ogg',
  door_exit: '/assets/audio/se/door exit.ogg',
  pkmn_faint: '/assets/audio/se/pkmn faint.ogg',
  pkmn_exp_gain: '/assets/audio/se/pkmn exp gain.ogg',
  pkmn_level_up: '/assets/audio/se/pkmn level up.ogg',
  player_bump: '/assets/audio/se/player bump.ogg',
  player_jump: '/assets/audio/se/player jump.ogg',
  exclaim: '/assets/audio/se/exclaim.ogg',
};

const LS_BGM_VOL = 'pixelmon_bgm_vol';
const LS_SE_VOL = 'pixelmon_se_vol';

/**
 * SoundManager — Quản lý âm thanh nền tảng (BGM & SFX) trong client Phaser 3.
 *
 * Hỗ trợ:
 * - Tự động tải file âm thanh theo nhu cầu từ manifest hoặc URL trực tiếp.
 * - Phát / Dừng / Đổi nhạc nền (BGM) kèm loop và volume.
 * - Phát hiệu ứng âm thanh (SE) với volume riêng biệt.
 * - Điều chỉnh và lưu trữ âm lượng (volume) vào localStorage.
 */
export class SoundManager {
  private static instance?: SoundManager;

  private scene?: Phaser.Scene;
  private currentBgm?: Phaser.Sound.BaseSound;
  private currentBgmKey?: string;

  private bgmVolume = 0.5;
  private seVolume = 0.7;

  private constructor() {
    this.loadVolumeSettings();
  }

  public static getInstance(scene?: Phaser.Scene): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    if (scene) {
      SoundManager.instance.setScene(scene);
    }
    return SoundManager.instance;
  }

  /**
   * Cập nhật scene Phaser hiện tại để nạp và phát âm thanh.
   */
  public setScene(scene: Phaser.Scene): void {
    this.scene = scene;
  }

  /**
   * Tải lại thiết lập âm lượng từ localStorage.
   */
  private loadVolumeSettings(): void {
    try {
      const savedBgm = localStorage.getItem(LS_BGM_VOL);
      if (savedBgm !== null) {
        const val = parseFloat(savedBgm);
        if (!isNaN(val)) this.bgmVolume = Phaser.Math.Clamp(val, 0, 1);
      }
      const savedSe = localStorage.getItem(LS_SE_VOL);
      if (savedSe !== null) {
        const val = parseFloat(savedSe);
        if (!isNaN(val)) this.seVolume = Phaser.Math.Clamp(val, 0, 1);
      }
    } catch {
      // ignore localStorage errors
    }
  }

  /**
   * Lưu thiết lập âm lượng vào localStorage.
   */
  private saveVolumeSettings(): void {
    try {
      localStorage.setItem(LS_BGM_VOL, String(this.bgmVolume));
      localStorage.setItem(LS_SE_VOL, String(this.seVolume));
    } catch {
      // ignore localStorage errors
    }
  }

  /**
   * Điều chỉnh âm lượng cho BGM và SE (0.0 đến 1.0).
   */
  public setVolume(bgmVol: number, seVol: number): void {
    this.bgmVolume = Phaser.Math.Clamp(bgmVol, 0, 1);
    this.seVolume = Phaser.Math.Clamp(seVol, 0, 1);
    this.saveVolumeSettings();

    if (this.currentBgm && 'setVolume' in this.currentBgm) {
      (this.currentBgm as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).setVolume(this.bgmVolume);
    }
  }

  public getBgmVolume(): number {
    return this.bgmVolume;
  }

  public getSeVolume(): number {
    return this.seVolume;
  }

  /**
   * Chuẩn hoá khoá âm thanh (bỏ gạch dưới, khoảng trắng, lowercase).
   */
  private normalizeKey(key: string): string {
    return key.trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  /**
   * Lấy URL từ manifest cho BGM.
   */
  private resolveBgmUrl(key: string): string | undefined {
    const norm = this.normalizeKey(key);
    return BGM_MANIFEST[key] ?? BGM_MANIFEST[norm];
  }

  /**
   * Lấy URL từ manifest cho SE.
   */
  private resolveSeUrl(key: string): string | undefined {
    const norm = this.normalizeKey(key);
    return SE_MANIFEST[key] ?? SE_MANIFEST[norm];
  }

  /**
   * Đảm bảo file âm thanh đã được tải vào cache của Phaser.
   */
  private ensureAudioLoaded(key: string, url: string, onLoaded: () => void): void {
    if (!this.scene) return;
    if (this.scene.cache.audio.exists(key)) {
      onLoaded();
      return;
    }

    this.scene.load.audio(key, url);
    this.scene.load.once(`filecomplete-audio-${key}`, () => {
      onLoaded();
    });
    this.scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: any) => {
      if (file?.key === key) {
        console.warn(`[SoundManager] Failed to load audio: ${key} (${url})`);
      }
    });
    if (!this.scene.load.isLoading()) {
      this.scene.load.start();
    }
  }

  /**
   * Phát nhạc nền (BGM). Nếu đang phát bài khác, sẽ dừng bài cũ.
   * @param key Tên key BGM (vd: 'battle_trainer', 'battle_wild', 'title', ...)
   * @param loop Tự động lặp lại (mặc định: true)
   */
  public playBgm(key: string, loop = true): void {
    if (!this.scene) return;
    const norm = this.normalizeKey(key);

    if (this.currentBgmKey === norm && this.currentBgm?.isPlaying) {
      return; // Đang phát đúng bài này
    }

    const url = this.resolveBgmUrl(key);
    if (!url) {
      console.warn(`[SoundManager] BGM '${key}' not found in manifest`);
      return;
    }

    const audioKey = `bgm_${norm}`;

    this.ensureAudioLoaded(audioKey, url, () => {
      if (!this.scene) return;

      this.stopBgm();

      try {
        const bgm = this.scene.sound.add(audioKey, {
          volume: this.bgmVolume,
          loop,
        });
        bgm.play();
        this.currentBgm = bgm;
        this.currentBgmKey = norm;
      } catch (err) {
        console.warn(`[SoundManager] Error playing BGM '${key}':`, err);
      }
    });
  }

  /**
   * Dừng phát nhạc nền hiện tại.
   */
  public stopBgm(): void {
    if (this.currentBgm) {
      try {
        this.currentBgm.stop();
        this.currentBgm.destroy();
      } catch {
        // ignore
      }
      this.currentBgm = undefined;
      this.currentBgmKey = undefined;
    }
  }

  /**
   * Phát hiệu ứng âm thanh (SE).
   * @param key Tên hiệu ứng (vd: 'gui_menu_open', 'battle_throw', ...)
   * @param volumeScale Tỉ lệ âm lượng nhân thêm (0.0 đến 1.0)
   */
  public playSe(key: string, volumeScale = 1): void {
    if (!this.scene) return;
    const norm = this.normalizeKey(key);
    const url = this.resolveSeUrl(key);
    if (!url) {
      // Thử phát cry hoặc fallback
      return;
    }

    const audioKey = `se_${norm}`;

    this.ensureAudioLoaded(audioKey, url, () => {
      if (!this.scene) return;
      try {
        this.scene.sound.play(audioKey, {
          volume: this.seVolume * Phaser.Math.Clamp(volumeScale, 0, 1),
        });
      } catch (err) {
        console.warn(`[SoundManager] Error playing SE '${key}':`, err);
      }
    });
  }

  /**
   * Phát tiếng kêu của Pokémon (Cry).
   * @param speciesId ID loài Pokémon (ví dụ: 'bulbasaur', 'pikachu')
   * @param volumeScale Tỉ lệ âm lượng nhân thêm (0.0 đến 1.0)
   */
  public playCry(speciesId: string, volumeScale = 1): void {
    if (!this.scene || !speciesId) return;
    const cleanId = speciesId.toLowerCase().trim();
    const url = `/assets/audio/cries/${encodeURIComponent(cleanId)}.ogg`;
    const audioKey = `cry_${cleanId}`;

    this.ensureAudioLoaded(audioKey, url, () => {
      if (!this.scene) return;
      try {
        this.scene.sound.play(audioKey, {
          volume: this.seVolume * Phaser.Math.Clamp(volumeScale, 0, 1),
        });
      } catch (err) {
        console.warn(`[SoundManager] Error playing cry '${cleanId}':`, err);
      }
    });
  }
}

