// ZenPanel - Quy tắc độ mạnh mật khẩu (dashboard dùng bộ quy tắc giống hệt để kiểm tra realtime)

/** Mật khẩu ngẫu nhiên: người dùng chọn độ dài (mặc định 8) */
export const RANDOM_MIN_LENGTH = 8;
export const RANDOM_MAX_LENGTH = 64;
export const RANDOM_DEFAULT_LENGTH = 8;

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'Ít nhất 12 ký tự', test: (p) => p.length >= 12 },
  { id: 'lower', label: 'Có chữ thường (a-z)', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'Có chữ hoa (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'digit', label: 'Có chữ số (0-9)', test: (p) => /\d/.test(p) },
  { id: 'symbol', label: 'Có ký tự đặc biệt (!@#$...)', test: (p) => /[^A-Za-z0-9]/.test(p) },
  { id: 'spaces', label: 'Không chứa khoảng trắng', test: (p) => p.length > 0 && !/\s/.test(p) },
  { id: 'admin', label: 'Không chứa chữ "admin"', test: (p) => p.length > 0 && !/admin/i.test(p) },
];

/** Trả về danh sách quy tắc chưa đạt (rỗng = mật khẩu đủ mạnh) */
export function failedRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password));
}
