/**
 * i18n — Đa ngôn ngữ (EN/VI) cho server API messages.
 *
 * - Request header  `Accept-Language: vi`  → dùng VI
 * - User setting   (users.language)       → dùng khi login/me
 * - Mặc định       = 'en'
 *
 * Cách dùng:
 *   import { t, localeFromRequest } from '../i18n/index.js';
 *   res.json({ ok: false, message: t(locale, 'BANNED') });
 */
import type { Request } from 'express';

export type Locale = 'en' | 'vi';
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALES: readonly Locale[] = ['en', 'vi'];

type Dict = Record<string, [string, string]>; // [en, vi]

const MESSAGES: Dict = {
  // Auth
  INVALID_CREDENTIALS: ['Wrong username or password', 'Sai tên đăng nhập hoặc mật khẩu'],
  BANNED: [
    'Your account has been banned. Contact an administrator.',
    'Tài khoản đã bị khóa. Liên hệ quản trị viên.',
  ],
  USER_EXISTS: ['Username already taken', 'Tên đăng nhập đã tồn tại'],
  VALIDATION: ['Invalid input', 'Dữ liệu không hợp lệ'],
  NO_TOKEN: ['Authentication required', 'Yêu cầu đăng nhập'],
  INVALID_TOKEN: ['Invalid token', 'Token không hợp lệ'],
  FORBIDDEN: ['Admin access required', 'Chỉ admin mới được truy cập'],
  SESSION_EXPIRED: ['Session expired', 'Phiên đăng nhập đã hết hạn'],
  LOGIN_FAILED: ['Login failed', 'Đăng nhập thất bại'],
  REGISTRATION_FAILED: ['Registration failed', 'Đăng ký thất bại'],
  USER_NOT_FOUND: ['User not found', 'Không tìm thấy người dùng'],
  // Admin
  MISSING_FIELDS: ['Username and password are required', 'Username và password bắt buộc'],
  INVALID_RANGE: [
    'Username ≥ 3 chars, password ≥ 6 chars',
    'Username ≥ 3 ký tự, password ≥ 6 ký tự',
  ],
  INVALID_ROLE: ['Invalid role. Allowed: ', 'Role không hợp lệ. Chỉ chấp nhận: '],
  INVALID_LANGUAGE: [
    'Invalid language. Allowed: en, vi',
    'Ngôn ngữ không hợp lệ. Chỉ chấp nhận: en, vi',
  ],
  UPDATE_OK: ['User updated', 'Đã cập nhật người dùng'],
  RESET_PASSWORD_OK: ['Password reset', 'Đã đặt lại mật khẩu'],
  BAN_OK: ['User banned', 'Đã khóa tài khoản'],
  UNBAN_OK: ['User unbanned', 'Đã mở khóa tài khoản'],
  ALREADY_BANNED: ['User is already banned', 'Tài khoản đã bị khóa'],
  NOT_BANNED: ['User is not banned', 'Tài khoản không bị khóa'],
  DELETE_OK: ['User deleted', 'Đã xóa người dùng'],
  CREATE_OK: ['User created', 'Đã tạo người dùng'],
  INFO_SAVED: ['Profile saved', 'Đã lưu thông tin'],
  // Generic
  INTERNAL: ['Internal server error', 'Lỗi máy chủ'],
  NOT_FOUND: ['Not found', 'Không tìm thấy'],
};

/**
 * Trả message theo locale.
 * @param key   key trong MESSAGES
 * @param locale 'en' | 'vi'
 */
export function t(locale: Locale | string | undefined, key: keyof typeof MESSAGES): string {
  const loc: Locale = locale === 'vi' ? 'vi' : 'en';
  const entry = MESSAGES[key];
  if (!entry) return key;
  return entry[loc === 'vi' ? 1 : 0];
}

/** Ghép prefix + params (vd: INVALID_ROLE + danh sách) */
export function tcat(
  locale: Locale | undefined,
  key: keyof typeof MESSAGES,
  suffix: string,
): string {
  return t(locale, key) + suffix;
}

/**
 * Xác định locale từ request:
 * 1. Query param `?lang=vi`
 * 2. Header `Accept-Language: vi`
 * 3. Mặc định 'en'
 */
export function localeFromRequest(req: Request): Locale {
  const q = req.query.lang;
  if (typeof q === 'string' && (LOCALES as readonly string[]).includes(q)) return q as Locale;

  const header = req.headers['accept-language'];
  if (typeof header === 'string') {
    const first = header.split(',')[0]?.trim().toLowerCase();
    if (first?.startsWith('vi')) return 'vi';
    if (first?.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}
