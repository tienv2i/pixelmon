/**
 * Dev config — đặt `DEV_MODE = true` để bỏ qua LoginScreen và đăng nhập auto.
 * Sau khi UI xong → đổi lại `false` để kích hoạt login bình thường.
 */
export const DEV_MODE = false;

/** Tài khoản auto-login khi DEV_MODE = true. */
export const DEV_CREDENTIALS = { username: 'admin', password: 'admin123' } as const;
