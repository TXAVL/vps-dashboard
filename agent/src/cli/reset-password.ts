// ZenPanel - Đặt lại mật khẩu admin khi quên: npm run reset-password [mật-khẩu-mới]
import { ensureAdminAccount, generatePassword, getSettings, setPassword } from '../core/auth.js';

const created = ensureAdminAccount();
if (created) {
  console.log(`Đã tạo tài khoản mới.\nUsername: ${created.username}\nPassword: ${created.password}`);
} else {
  const password = process.argv[2] || generatePassword();
  if (password.length < 8) {
    console.error('Mật khẩu phải có ít nhất 8 ký tự');
    process.exit(1);
  }
  setPassword(password);
  console.log(`Đã đặt lại mật khẩu ZenPanel (mọi phiên đăng nhập cũ bị đăng xuất).\nUsername: ${getSettings()!.username}\nPassword: ${password}`);
}
