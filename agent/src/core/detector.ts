// ZenPanel - Engine tự nhận diện OS và nạp adapter tương ứng
import type { OSAdapter } from '../adapters/base.adapter.js';
import { LinuxAdapter } from '../adapters/linux.adapter.js';
import { WindowsAdapter } from '../adapters/windows.adapter.js';

let cached: OSAdapter | null = null;

export function detectAdapter(): OSAdapter {
  if (cached) return cached;
  switch (process.platform) {
    case 'win32':
      cached = new WindowsAdapter();
      break;
    case 'linux':
      cached = new LinuxAdapter();
      break;
    default:
      throw new Error(`ZenPanel chưa hỗ trợ hệ điều hành "${process.platform}" (chỉ Windows & Linux)`);
  }
  return cached;
}
