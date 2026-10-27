// ZenPanel CLI - In đường dẫn đăng nhập nhanh kèm token
import { createSession, issueToken, ensureAdminAccount, getSettings } from '../core/auth.js';

try {
  ensureAdminAccount();
  const settings = getSettings();
  if (!settings) {
    console.error('Lỗi: Không tìm thấy tài khoản admin ZenPanel');
    process.exit(1);
  }
  // Có phiên riêng: thiết bị mở link này hiện trong "Phiên đăng nhập" và thu hồi / đăng xuất được
  const { token } = issueToken(createSession(null, settings.username, Date.now() + 7 * 24 * 60 * 60 * 1000));
  const base = (process.argv[2] || '').trim().replace(/\/+$/, '');
  if (base) {
    console.log(`${base}/?token=${encodeURIComponent(token)}&auto_login=1`);
  } else {
    console.log(token);
  }
} catch (err) {
  console.error('Lỗi khi tạo login-url:', err);
  process.exit(1);
}
