// ZenPanel CLI - In đường dẫn đăng nhập nhanh kèm token
import { issueToken, ensureAdminAccount, getSettings } from '../core/auth.js';

try {
  ensureAdminAccount();
  const settings = getSettings();
  if (!settings) {
    console.error('Lỗi: Không tìm thấy tài khoản admin ZenPanel');
    process.exit(1);
  }
  const { token } = issueToken();
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
