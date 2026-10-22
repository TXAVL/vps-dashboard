// ZenPanel - Đặt lại mật khẩu admin khi quên: npm run reset-password [mật-khẩu-mới]
import { failedRules } from '../core/password.js';
import { ensureAdminAccount, generatePassword, getSettings, setPassword } from '../core/auth.js';

const created = ensureAdminAccount();
if (created) {
  console.log(`Đã tạo tài khoản mới.\nUsername: ${created.username}\nPassword: ${created.password}`);
} else {
  const password = process.argv[2] || generatePassword(20);
  const failed = failedRules(password);
  if (failed.length) {
    console.error(`Mật khẩu chưa đủ mạnh:\n${failed.map((r) => `  ✗ ${r.label}`).join('\n')}`);
    process.exit(1);
  }
  setPassword(password);
  console.log(`Đã đặt lại mật khẩu ZenPanel (mọi phiên đăng nhập cũ bị đăng xuất).\nUsername: ${getSettings()!.username}\nPassword: ${password}`);
}
