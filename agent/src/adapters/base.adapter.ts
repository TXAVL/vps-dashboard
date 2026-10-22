// ZenPanel - Interface quy chuẩn chung cho mọi OS adapter.
// Mọi thao tác hệ thống phải đi qua đây, không gọi lệnh OS trực tiếp trong service/controller.

export type OSFamily = 'windows' | 'linux';

export interface OSInfo {
  family: OSFamily;
  /** Tên hiển thị, ví dụ "Ubuntu 24.04 LTS" hoặc "Windows Server 2022" */
  name: string;
  arch: string;
  hostname: string;
}

export interface OSAdapter {
  readonly family: OSFamily;
  getInfo(): Promise<OSInfo>;

  /** Tìm file thực thi trong PATH, trả về đường dẫn tuyệt đối hoặc null */
  findExecutable(name: string): Promise<string | null>;

  /** Cấp quyền thực thi cho file vừa tải về (no-op trên Windows) */
  makeExecutable(filePath: string): Promise<void>;

  /** Tên file cloudflared trên GitHub Releases tương ứng OS + kiến trúc CPU */
  cloudflaredAssetName(): string;

  /** Tên file cloudflared khi lưu xuống đĩa */
  cloudflaredBinaryName(): string;
}
