// ZenPanel - Hộp thoại "Có gì mới": tự hiện 1 lần sau khi cập nhật phiên bản, mở lại được từ sidebar
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { CHANGELOG } from '../lib/changelog';
import { usePanel } from '../lib/panel';
import { Badge, Button, Modal } from './ui';

const SEEN_KEY = 'zenpanel.seenVersion';
const WhatsNewContext = createContext<() => void>(() => undefined);

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function markSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    // storage bị chặn: hộp thoại có thể hiện lại lần sau
  }
}

export function WhatsNewProvider({ children }: { children: ReactNode }) {
  const { info } = usePanel();
  const [open, setOpen] = useState(false);
  const version = info?.version;

  useEffect(() => {
    if (version && readSeen() !== version && CHANGELOG.some((c) => c.version === version)) setOpen(true);
  }, [version]);

  const close = () => {
    if (version) markSeen(version);
    setOpen(false);
  };

  return (
    <WhatsNewContext.Provider value={() => setOpen(true)}>
      {children}
      <Modal
        open={open}
        onClose={close}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-5 text-blue-300" /> Có gì mới trong ZenPanel {version ? `v${version}` : ''}
          </span>
        }
        footer={
          <Button variant="primary" onClick={close}>
            Đã hiểu
          </Button>
        }
      >
        <div className="space-y-6">
          {CHANGELOG.map((entry, index) => (
            <section key={entry.version} className={index > 0 ? 'opacity-70' : ''}>
              <div className="mb-3 flex items-center gap-2">
                <Badge tone={entry.version === version ? 'green' : 'slate'}>v{entry.version}</Badge>
                {entry.version === version && <span className="text-xs font-semibold text-emerald-300">Đang dùng</span>}
                <span className="text-xs text-slate-500">{entry.date}</span>
              </div>
              <div className="space-y-3">
                {entry.highlights.map((h) => (
                  <div key={h.title}>
                    <div className="mb-1.5 text-sm font-bold text-white">{h.title}</div>
                    <ul className="space-y-1.5">
                      {h.items.map((item) => (
                        <li key={item} className="flex gap-2 text-sm text-slate-300">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-zen-blue" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Modal>
    </WhatsNewContext.Provider>
  );
}

export function useWhatsNew(): () => void {
  return useContext(WhatsNewContext);
}
