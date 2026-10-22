// ZenPanel - Custom App Studio Modal (Tự định nghĩa ứng dụng thêm vào AppStore)
import { useState, type FormEvent } from 'react';
import { Bot, Code, Cpu, Database, Globe, Package, Plus, Wrench, Zap } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Button, Field, Modal } from '../components/ui';
import { post } from '../lib/api';

const DEFAULT_COMPOSE = `version: '3.8'
services:
  app:
    image: nginx:alpine
    container_name: \${container}
    restart: unless-stopped
    ports:
      - "\${port}:80"
    volumes:
      - ./\${container}_data:/usr/share/nginx/html
`;

const ICON_OPTIONS = [
  { id: 'Globe', label: 'Web', icon: Globe },
  { id: 'Package', label: 'Package', icon: Package },
  { id: 'Code', label: 'Code', icon: Code },
  { id: 'Bot', label: 'AI Bot', icon: Bot },
  { id: 'Cpu', label: 'CPU', icon: Cpu },
  { id: 'Database', label: 'Database', icon: Database },
  { id: 'Zap', label: 'Zap', icon: Zap },
  { id: 'Wrench', label: 'Tool', icon: Wrench },
];

export function CustomAppModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const feedback = useFeedback();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('tools');
  const [icon, setIcon] = useState('Package');
  const [platform, setPlatform] = useState<'all' | 'windows' | 'linux'>('all');
  const [appType, setAppType] = useState<'docker' | 'native'>('docker');
  const [defaultPort, setDefaultPort] = useState('8080');
  const [website, setWebsite] = useState('');
  const [composeTemplate, setComposeTemplate] = useState(DEFAULT_COMPOSE);
  const [nativeCommand, setNativeCommand] = useState('');

  const handleNameChange = (val: string) => {
    setName(val);
    if (!id) {
      // Tự động sinh ID slug đơn giản
      const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      setId(slug);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      feedback.toast('Vui lòng nhập tên ứng dụng', 'error');
      return;
    }
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanId) {
      feedback.toast('Mã ID ứng dụng không hợp lệ', 'error');
      return;
    }

    setLoading(true);
    try {
      await post('/api/apps/custom', {
        id: cleanId,
        name: name.trim(),
        description: description.trim(),
        category,
        icon,
        platform,
        appType,
        website: website.trim(),
        defaultPort: defaultPort ? Number(defaultPort) : undefined,
        composeTemplate: appType === 'docker' ? composeTemplate : undefined,
        nativeCommand: appType === 'native' ? nativeCommand : undefined,
      });

      feedback.toast(`Đã thêm ứng dụng "${name}" vào App Store!`, 'success');
      onCreated();
      onClose();
    } catch (err: any) {
      feedback.toast(err?.message || 'Không thể tạo ứng dụng tùy chỉnh', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Thêm ứng dụng tùy chỉnh vào App Store" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
          ✨ <b>Custom App Studio:</b> Định nghĩa ứng dụng riêng của bạn (Docker Compose hoặc lệnh Shell Native) để quản lý trực tiếp bằng 1-Click trên giao diện ZenPanel.
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tên ứng dụng" hint="Tên hiển thị trên thẻ kho ứng dụng">
            <input
              className="input"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="VD: FastAPI Service, Web App..."
              required
            />
          </Field>
          <Field label="Mã ID ứng dụng" hint="Chỉ chữ cái thường a-z, số, gạch nối">
            <input
              className="input mono"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="vd: my-fastapi-app"
              required
            />
          </Field>
        </div>

        <Field label="Mô tả tóm tắt">
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả chức năng ứng dụng..."
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Danh mục">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="tools">Công cụ (Tools)</option>
              <option value="web">Web & Blog</option>
              <option value="ai">AI Agent</option>
              <option value="database">Cơ sở dữ liệu</option>
              <option value="devops">DevOps & CI/CD</option>
              <option value="storage">Lưu trữ</option>
              <option value="network">Mạng</option>
            </select>
          </Field>

          <Field label="Loại ứng dụng">
            <select className="input" value={appType} onChange={(e) => setAppType(e.target.value as any)}>
              <option value="docker">🐳 Docker Compose</option>
              <option value="native">⚡ Native System (Lệnh shell/script)</option>
            </select>
          </Field>

          <Field label="Kho nền tảng (OS)">
            <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as any)}>
              <option value="all">🌐 Đa nền tảng (Tất cả)</option>
              <option value="windows">🪟 Windows NT</option>
              <option value="linux">🐧 Linux Kernel</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cổng dịch vụ Web (nếu có)" hint="Dùng để tạo nút Truy cập và liên kết Public Link">
            <input
              className="input mono"
              type="number"
              value={defaultPort}
              onChange={(e) => setDefaultPort(e.target.value)}
              placeholder="8080"
            />
          </Field>

          <Field label="Website / GitHub repo" hint="Tùy chọn liên kết trang chủ tài liệu">
            <input
              className="input"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://github.com/..."
            />
          </Field>
        </div>

        <Field label="Chọn biểu tượng">
          <div className="flex flex-wrap gap-2">
            {ICON_OPTIONS.map((item) => {
              const IconComp = item.icon;
              const isSelected = icon === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIcon(item.id)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? 'border-zen-blue bg-zen-blue/20 text-white ring-1 ring-zen-blue'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <IconComp className="size-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </Field>

        {appType === 'docker' ? (
          <Field
            label="Mẫu Docker Compose (YAML)"
            hint="Hỗ trợ biến ${container} và ${port} tự động thay thế khi khởi tạo"
          >
            <textarea
              className="input mono min-h-[160px] text-xs leading-relaxed"
              value={composeTemplate}
              onChange={(e) => setComposeTemplate(e.target.value)}
              required
            />
          </Field>
        ) : (
          <Field
            label="Lệnh cài đặt Shell / Script"
            hint="Lệnh thực thi khi người dùng bấm Cài đặt (PowerShell trên Windows, Bash trên Linux)"
          >
            <textarea
              className="input mono min-h-[120px] text-xs leading-relaxed"
              value={nativeCommand}
              onChange={(e) => setNativeCommand(e.target.value)}
              placeholder="vd: apt-get update && apt-get install -y htop (hoặc lệnh PowerShell tải exe)"
              required
            />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" type="submit" loading={loading} icon={Plus}>
            Thêm vào App Store
          </Button>
        </div>
      </form>
    </Modal>
  );
}
