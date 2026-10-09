/**
 * World Clock + Weather — **SSOT server-authoritative** cho ngày/đêm, giờ và
 * thời tiết. Encounter filter, evolution theo `time`, và lighting client đều
 * lấy từ đây → client KHÔNG còn tự bịa đồng hồ bằng `new Date()` local.
 *
 * Mốc thời gian **tính từ epoch cố định** (`WORLD_EPOCH_MS`) nên đồng hồ chạy
 * **toàn cục**: mọi map/phòng thấy cùng một giờ, và restart server không làm
 * nhảy giờ.
 *
 * Tốc độ: **x6** (1 phút thực = 6 phút game) → 1 ngày game ≈ 4 giờ thực.
 */

/** Tốc độ thời gian game so với thực (x6 — giữ nguyên như InfoPanel cũ). */
export const TIME_SCALE = 6;

/** Epoch chuẩn hoá của thế giới game (mốc "điểm 0" của đồng hồ). */
const WORLD_EPOCH_MS = Date.UTC(2020, 0, 1, 0, 0, 0);

/** Giai đoạn trong ngày — khớp bộ lọc `timeOfDay` của encounter/evolution. */
export type TimeOfDay = 'day' | 'night' | 'dawn' | 'dusk';

/** Loại thời tiết. */
export type WeatherId = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';

export const WEATHER_IDS: readonly WeatherId[] = [
  'sunny',
  'cloudy',
  'rain',
  'storm',
  'snow',
  'fog',
];

export interface WorldClock {
  /** Phút game tính từ epoch. */
  gameMinutes: number;
  /** Giờ 0..23 trong ngày game. */
  hour: number;
  /** Phút 0..59. */
  minute: number;
  /** Chỉ số ngày game (tăng 1 mỗi lần qua nửa đêm) — dùng cho weather + daily tick. */
  day: number;
  /** 0..1 — tiến trình trong ngày (0 = nửa đêm, 0.5 = trưa), dùng cho lighting. */
  dayProgress: number;
  /** Giai đoạn trong ngày. */
  phase: TimeOfDay;
  /** Quãng game mở đầu ngày hiện tại — dùng cho tick "sang ngày mới". */
  dayStartGameMs: number;
}

/**
 * Ranh giới phase (khớp `isNight` của InfoPanel cũ: đêm = `>=20 || <5`):
 * - dawn  05:00–06:59
 * - day   07:00–17:59
 * - dusk  18:00–19:59
 * - night 20:00–04:59
 */
export function phaseAt(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 18) return 'day';
  if (hour >= 18 && hour < 20) return 'dusk';
  return 'night';
}

/** Clock tại một mốc thời gian thực (ms). */
export function worldClockAt(realMs: number): WorldClock {
  // Thời gian game = epoch + (thời gian thực đã trôi qua × scale)
  const gameMs = WORLD_EPOCH_MS + (realMs - WORLD_EPOCH_MS) * TIME_SCALE;
  const dayMs = 86400000;
  const dayStartGameMs = Math.floor(gameMs / dayMs) * dayMs;
  const msIntoDay = gameMs - dayStartGameMs;

  return {
    gameMinutes: Math.floor(gameMs / 60000),
    hour: Math.floor(msIntoDay / 3600000),
    minute: Math.floor((msIntoDay % 3600000) / 60000),
    day: Math.floor(gameMs / dayMs),
    dayProgress: msIntoDay / dayMs,
    phase: phaseAt(Math.floor(msIntoDay / 3600000)),
    dayStartGameMs,
  };
}

/** Clock ngay lúc này. */
export function worldClockNow(): WorldClock {
  return worldClockAt(Date.now());
}

/** Thời gian game còn lại (ms) cho tới lần chuyển phase kế tiếp. */
export function msUntilNextPhase(clock: WorldClock): number {
  const realMsPerGameMs = 1 / TIME_SCALE;
  const hour = clock.hour;
  const boundaries = [5, 7, 18, 20];
  for (const b of boundaries) {
    if (b > hour) {
      const gameMsLeft = (b - hour) * 3600000 - clock.minute * 60000;
      return Math.max(0, Math.floor(gameMsLeft * realMsPerGameMs));
    }
  }
  // Qua boundary cuối (20:00) → tới 05:00 sáng mai.
  const gameMsLeft = (24 - hour + 5) * 3600000 - clock.minute * 60000;
  return Math.max(0, Math.floor(gameMsLeft * realMsPerGameMs));
}

// ── Weather ──────────────────────────────────────────────────────────────
// Weather là hàm thuần tuý của (mapId, ngày game, khối trong ngày) → mọi client
// và mọi server tính ra cùng kết quả, không cần state sync cho logic. Client
// vẫn nhận `weather` qua schema để hiển thị khớp tuyệt đối với server.

/** Số khối thời tiết trong 1 ngày game (mỗi khối = 3 giờ game). */
export const WEATHER_BLOCKS = 8;

/** Khối thời tiết hiện tại (0..7) từ clock. */
export function weatherBlock(clock: WorldClock): number {
  return Math.floor(clock.dayProgress * WEATHER_BLOCKS) % WEATHER_BLOCKS;
}

/** Hash FNV-1a 32-bit — ổn định mọi nền tảng, không dùng `Math.random`. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Trọng số thời tiết theo khí hậu map. `weather` trong `ServerMap` (admin
 * cấu hình) được dùng làm **pool override**: đặt `rain` → map đó chỉ trời
 * mưa. Không đặt → pool `sunny` ưu thế (vùng ôn hoà nhiều nắng).
 */
export function weatherPoolFor(mapWeather?: string | null): readonly WeatherId[] {
  const w = (mapWeather ?? '').trim().toLowerCase();
  if (WEATHER_IDS.includes(w as WeatherId)) return [w as WeatherId];
  // Pool mặc định — nắng chiếm đa số, thời tiết xấu hiếm (hợp lý cho bản đồ ôn hoà).
  return ['sunny', 'sunny', 'sunny', 'sunny', 'cloudy', 'cloudy', 'rain', 'storm', 'fog'];
}

/** Thời tiết tại (mapId, ngày game, khối) — deterministic. */
export function weatherFor(
  mapId: string,
  mapWeather: string | null | undefined,
  day: number,
  block: number,
): WeatherId {
  const pool = weatherPoolFor(mapWeather);
  return pool[fnv1a(`${mapId}|${day}|${block}`) % pool.length];
}
