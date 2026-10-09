import { pool } from '../../config/database.js';
import {
  worldClockAt,
  weatherFor,
  weatherBlock,
  FRIENDSHIP_EVO_THRESHOLD,
  type WorldClock,
  type TimeOfDay,
  type WeatherId,
} from '@pixelmon/shared';

/**
 * WorldClockService — **nguồn sự thật duy nhất** cho giờ/thời tiết của toàn bộ
 * thế giới game, dùng chung cho mọi `WorldRoom` (mỗi map 1 room).
 *
 * - Đồng hồ chạy **toàn cục** (tính từ epoch cố định) → mọi map cùng giờ.
 * - Thời tiết **per-map** (deterministic theo mapId + thời điểm) → client
 *   nhận qua schema, không cần mỗi client tự tính.
 * - **Daily friendship tick**: mỗi ngày game trôi qua, party Pokémon online
 *   được +friendship (mở khóa evolution `friendship`/`time` kiểu Espeon/Umbreon).
 *
 * Cách dùng: mỗi `WorldRoom.onCreate` gọi `start(room)` — service tự set interval
 * refresh state + tick ngày mới. Room giữ reference để `stop()` khi dispose.
 */
export class WorldClockService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastDay = -1;

  constructor(
    private onChange: (clock: WorldClock, weather: WeatherId) => void,
  ) {}

  /** Clock + thời tiết tại thời điểm này cho một map cụ thể. */
  snapshot(mapId: string, mapWeather?: string | null): {
    clock: WorldClock;
    timeOfDay: TimeOfDay;
    weather: WeatherId;
  } {
    const clock = worldClockAt(Date.now());
    const weather = weatherFor(mapId, mapWeather, clock.day, weatherBlock(clock));
    return { clock, timeOfDay: clock.phase, weather };
  }

  /**
   * Bắt đầu đồng hồ cho một room. `intervalMs` (mặc định 10s) — nhưng chỉ gọi
   * `onChange` khi giá trị thực sự thay đổi (phase hoặc weather) để tránh spam
   * schema sync.
   */
  start(mapId: string, mapWeather: string | null | undefined): void {
    this.stop();
    const first = this.snapshot(mapId, mapWeather);
    this.lastDay = first.clock.day;
    this.onChange(first.clock, first.weather);

    this.timer = setInterval(() => {
      const snap = this.snapshot(mapId, mapWeather);
      // Daily tick (chỉ chạy 1 lần khi sang ngày game mới).
      if (snap.clock.day !== this.lastDay) {
        this.lastDay = snap.clock.day;
        void this.grantDailyFriendship();
      }
      this.onChange(snap.clock, snap.weather);
    }, 10000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * +friendship cho MỌI Pokémon online của MỌI người chơi đang đăng nhập khi
   * sang ngày game mới. Đơn giản, không cần track "AI đang online" vì
   * `player_info`/`pokemon` luôn có sẵn trong DB.
   */
  private async grantDailyFriendship(): Promise<void> {
    try {
      // Tăng friendship cho toàn bộ Pokémon (tối đa 255) — mỗi ngày +1.
      await pool.query(
        `UPDATE pokemon SET friendship = LEAST(255, friendship + 1) WHERE friendship < 255`,
      );
    } catch (err) {
      console.warn('[worldClock] daily friendship tick failed:', err);
    }
  }
}

/** Ngưỡng friendship cho evolution (re-export để server dùng chung). */
export { FRIENDSHIP_EVO_THRESHOLD };
