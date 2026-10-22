// ZenPanel - Web Terminal nhiều tab (PowerShell trên Windows, Bash/Zsh trên Linux)
import { useState } from 'react';
import { Plus, SquareTerminal, X } from 'lucide-react';
import { TerminalPanel } from '../components/TerminalPanel';
import { Button, PageHeader, cn } from '../components/ui';
import { WindowMockup } from '../components/layout/WindowMockup';
import { usePanel } from '../lib/panel';

export default function TerminalView() {
  const { info } = usePanel();
  const [tabs, setTabs] = useState([1]);
  const [active, setActive] = useState(1);
  const shell = info?.os.family === 'windows' ? 'PowerShell' : 'Bash';

  const add = () => {
    const id = Math.max(0, ...tabs) + 1;
    setTabs([...tabs, id]);
    setActive(id);
  };

  const close = (id: number) => {
    const rest = tabs.filter((t) => t !== id);
    setTabs(rest.length ? rest : [Math.max(...tabs) + 1]);
    if (active === id) setActive(rest[rest.length - 1] ?? Math.max(...tabs) + 1);
  };

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[420px] flex-col">
      <PageHeader
        title="Terminal"
        description={`${shell} trên ${info?.os.hostname ?? 'máy chủ'} — chạy với quyền của ZenPanel Agent`}
        icon={SquareTerminal}
        actions={
          <Button icon={Plus} variant="primary" onClick={add}>
            Tab mới
          </Button>
        }
      />
      <WindowMockup
        title={shell}
        className="flex-1"
        actions={
          <div className="flex max-w-[40vw] gap-1 overflow-x-auto">
            {tabs.map((id, index) => (
              <div
                key={id}
                className={cn(
                  'flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold',
                  active === id ? 'bg-zen-green/20 text-emerald-300' : 'text-slate-400 hover:bg-slate-800',
                )}
                onClick={() => setActive(id)}
              >
                {shell} {index + 1}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    close(id);
                  }}
                  className="rounded p-0.5 hover:bg-slate-700"
                  aria-label="Đóng tab"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        }
      >
        {tabs.map((id) => (
          <TerminalPanel key={id} className={cn('absolute inset-0', active !== id && 'invisible')} />
        ))}
      </WindowMockup>
    </div>
  );
}
