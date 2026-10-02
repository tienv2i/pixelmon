export type GameViewAnchor =
  | 'center'
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface UserSettings {
  hud: {
    profile: boolean;
    clock: boolean;
    party: boolean;
    chat: boolean;
    minimap: boolean;
    miniMode: boolean;
  };
  gameplay: {
    showPlayerNames: boolean;
    mouseTracking: boolean;
    targetMarker: boolean;
    showGrid: boolean;
    autoRun: boolean;
    scrollToZoom: boolean;
    moveButton: 'left' | 'right';
    viewAnchor: GameViewAnchor;
  };
  audio: {
    bgm: boolean;
    sfx: boolean;
  };
  system: {
    lang: 'vi' | 'en';
    /** Làm mịn chữ & hình. false = giữ nét pixel (sắc nét cho pixel-art). */
    antialias: boolean;
  };
  zoom: {
    gameZoom: number;
    uiZoom: number;
  };
}

export const DEFAULT_SETTINGS: UserSettings = {
  hud: {
    profile: true,
    clock: true,
    party: true,
    chat: true,
    minimap: false,
    miniMode: false,
  },
  gameplay: {
    showPlayerNames: true,
    mouseTracking: true,
    targetMarker: true,
    showGrid: false,
    autoRun: false,
    scrollToZoom: false,
    moveButton: 'left',
    viewAnchor: 'center',
  },
  audio: {
    bgm: true,
    sfx: true,
  },
  system: {
    lang: 'vi',
    antialias: true,
  },
  zoom: {
    gameZoom: 1.0,
    uiZoom: 1.0,
  },
};

const LS_SETTINGS_KEY = 'pixelmon.settings';

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    let parsed: any = null;
    if (raw) {
      parsed = JSON.parse(raw);
    }

    // Fallback đọc các key cũ nếu chưa có trong parsed settings
    const legacyLang = localStorage.getItem('pixelmon.lang');
    const legacyMoveBtn = localStorage.getItem('pixelmon.moveButton');
    const legacyScroll = localStorage.getItem('pixelmon.scrollToZoom');
    const legacyUiZoom = localStorage.getItem('pixelmon.uiZoom');
    const legacyGameZoom = localStorage.getItem('pixelmon.gameZoom');

    return {
      hud: {
        profile: parsed?.hud?.profile ?? DEFAULT_SETTINGS.hud.profile,
        clock: parsed?.hud?.clock ?? DEFAULT_SETTINGS.hud.clock,
        party: parsed?.hud?.party ?? DEFAULT_SETTINGS.hud.party,
        chat: parsed?.hud?.chat ?? DEFAULT_SETTINGS.hud.chat,
        minimap: parsed?.hud?.minimap ?? DEFAULT_SETTINGS.hud.minimap,
        miniMode: parsed?.hud?.miniMode ?? DEFAULT_SETTINGS.hud.miniMode,
      },
      gameplay: {
        showPlayerNames: parsed?.gameplay?.showPlayerNames ?? DEFAULT_SETTINGS.gameplay.showPlayerNames,
        mouseTracking: parsed?.gameplay?.mouseTracking ?? DEFAULT_SETTINGS.gameplay.mouseTracking,
        targetMarker: parsed?.gameplay?.targetMarker ?? DEFAULT_SETTINGS.gameplay.targetMarker,
        showGrid: parsed?.gameplay?.showGrid ?? DEFAULT_SETTINGS.gameplay.showGrid,
        autoRun: parsed?.gameplay?.autoRun ?? DEFAULT_SETTINGS.gameplay.autoRun,
        scrollToZoom:
          parsed?.gameplay?.scrollToZoom ??
          (legacyScroll === 'true' ? true : DEFAULT_SETTINGS.gameplay.scrollToZoom),
        moveButton:
          parsed?.gameplay?.moveButton === 'left' || parsed?.gameplay?.moveButton === 'right'
            ? parsed.gameplay.moveButton
            : legacyMoveBtn === 'left' || legacyMoveBtn === 'right'
              ? legacyMoveBtn
              : DEFAULT_SETTINGS.gameplay.moveButton,
        viewAnchor: [
          'center',
          'top-left',
          'top',
          'top-right',
          'left',
          'right',
          'bottom-left',
          'bottom',
          'bottom-right',
        ].includes(parsed?.gameplay?.viewAnchor)
          ? parsed.gameplay.viewAnchor
          : DEFAULT_SETTINGS.gameplay.viewAnchor,
      },
      audio: {
        bgm: parsed?.audio?.bgm ?? DEFAULT_SETTINGS.audio.bgm,
        sfx: parsed?.audio?.sfx ?? DEFAULT_SETTINGS.audio.sfx,
      },
      system: {
        lang:
          parsed?.system?.lang === 'vi' || parsed?.system?.lang === 'en'
            ? parsed.system.lang
            : legacyLang === 'vi' || legacyLang === 'en'
              ? legacyLang
              : DEFAULT_SETTINGS.system.lang,
        antialias:
          typeof parsed?.system?.antialias === 'boolean'
            ? parsed.system.antialias
            : DEFAULT_SETTINGS.system.antialias,
      },
      zoom: {
        gameZoom:
          typeof parsed?.zoom?.gameZoom === 'number'
            ? parsed.zoom.gameZoom
            : legacyGameZoom
              ? parseFloat(legacyGameZoom)
              : DEFAULT_SETTINGS.zoom.gameZoom,
        uiZoom:
          typeof parsed?.zoom?.uiZoom === 'number'
            ? parsed.zoom.uiZoom
            : legacyUiZoom
              ? parseFloat(legacyUiZoom)
              : DEFAULT_SETTINGS.zoom.uiZoom,
      },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

export function saveSettings(
  patch: Partial<UserSettings> | { [K in keyof UserSettings]?: Partial<UserSettings[K]> },
): UserSettings {
  const current = loadSettings();
  const next: UserSettings = {
    hud: { ...current.hud, ...patch.hud },
    gameplay: { ...current.gameplay, ...patch.gameplay },
    audio: { ...current.audio, ...patch.audio },
    system: { ...current.system, ...patch.system },
    zoom: { ...current.zoom, ...patch.zoom },
  };

  try {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(next));
    // Đồng bộ legacy keys
    localStorage.setItem('pixelmon.lang', next.system.lang);
    localStorage.setItem('pixelmon.moveButton', next.gameplay.moveButton);
    localStorage.setItem('pixelmon.scrollToZoom', next.gameplay.scrollToZoom ? 'true' : 'false');
    localStorage.setItem('pixelmon.uiZoom', String(next.zoom.uiZoom));
    localStorage.setItem('pixelmon.gameZoom', String(next.zoom.gameZoom));
  } catch {
    // ignore private browsing errors
  }

  return next;
}

export function resetSettings(): UserSettings {
  try {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    localStorage.setItem('pixelmon.lang', DEFAULT_SETTINGS.system.lang);
    localStorage.setItem('pixelmon.moveButton', DEFAULT_SETTINGS.gameplay.moveButton);
    localStorage.setItem('pixelmon.scrollToZoom', 'false');
  } catch {
    // ignore
  }
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}
