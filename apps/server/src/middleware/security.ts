import type { Request, Response, NextFunction } from 'express';

/**
 * Security middleware (Plan hardening).
 *
 * Gồm 2 phần, không phụ thuộc package ngoài:
 *  - `rateLimit` — fixed-window limiter in-memory, chặn brute-force login.
 *  - `securityHeaders` — CSP + các header chống clickjacking/MIME sniffing.
 */

// ── Rate limit ───────────────────────────────────────────────────────────────

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Độ dài cửa sổ (ms). */
  windowMs: number;
  /** Số request tối đa mỗi IP trong 1 cửa sổ. */
  max: number;
  /** Thông báo trả về khi vượt hạn mức. */
  message?: string;
  /** Tùy biến khoá (mặc định IP + method + path). */
  keyFn?: (req: Request) => string;
}

/**
 * Fixed-window rate limiter dùng Map in-memory.
 *
 * Phù hợp cho single-instance dev/small deploy. Nếu scale nhiều instance thì
 * phải thay bằng store chia sẻ (Redis) — hiện tại đủ để bịt brute-force login.
 */
export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max } = opts;
  const message = opts.message ?? 'Quá nhiều yêu cầu. Vui lòng thử lại sau.';
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  const sweep = (now: number): void => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    // Dọn rác định kỳ để Map không phình vô hạn.
    if (now - lastSweep > Math.max(windowMs, 60_000)) {
      sweep(now);
      lastSweep = now;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = opts.keyFn ? opts.keyFn(req) : `${ip}|${req.method}|${req.baseUrl}${req.path}`;

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ ok: false, error: 'rate_limited', message });
      return;
    }
    next();
  };
}

// ── Security headers / CSP ───────────────────────────────────────────────────

/**
 * CSP + hardening headers cho các trang server tự phục vụ (landing + admin).
 *
 * Lưu ý: `script-src` buộc phải có `'unsafe-inline'` vì `admin.js` render nút
 * bằng thuộc tính `onclick="..."` (inline event handler). Muốn siết về
 * `'self'` thuần thì phải refactor admin.js sang event delegation — việc này
 * tách riêng. Dù vậy CSP vẫn chặn: script từ origin lạ, nhúng `<object>`,
 * chèn `<base>`, framing (clickjacking) và form gửi ra ngoài.
 */
export function securityHeaders() {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');

  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  };
}
