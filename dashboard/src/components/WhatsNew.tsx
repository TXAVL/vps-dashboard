// ZenPanel - Hộp thoại "Có gì mới": tự hiện 1 lần sau khi cập nhật phiên bản, mở lại được từ sidebar
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Sparkles,
  ChevronDown,
  CheckCircle2,
  Clock,
  Search,
  X,
  Layers,
  Tag,
} from 'lucide-react';
import { CHANGELOG, type ChangelogEntry } from '../lib/changelog';
import { usePanel } from '../lib/panel';
import { Badge, Button, Modal, cn } from './ui';

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
  const [search, setSearch] = useState('');
  const version = info?.version;

  // Phiên bản mới nhất trong Changelog
  const latestVersion = CHANGELOG[0]?.version;

  // Trạng thái mở/đóng từng phiên bản: Bản mới nhất mở sẵn, các bản cũ đóng lại
  const [openVersions, setOpenVersions] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    CHANGELOG.forEach((entry, idx) => {
      initial[entry.version] = idx === 0; // chỉ bản đầu tiên (mới nhất) được mở
    });
    return initial;
  });

  useEffect(() => {
    if (version && readSeen() !== version && CHANGELOG.some((c) => c.version === version)) {
      setOpen(true);
    }
  }, [version]);

  // Khi mở modal, đảm bảo bản mới nhất luôn mở sẵn và các bản cũ đóng lại nếu chưa có thay đổi
  const handleOpen = () => {
    setSearch('');
    const reset: Record<string, boolean> = {};
    CHANGELOG.forEach((entry, idx) => {
      reset[entry.version] = idx === 0;
    });
    setOpenVersions(reset);
    setOpen(true);
  };

  const close = () => {
    if (version) markSeen(version);
    setOpen(false);
  };

  const toggleVersion = (ver: string) => {
    setOpenVersions((prev) => ({
      ...prev,
      [ver]: !prev[ver],
    }));
  };

  const allOlderCollapsed = useMemo(() => {
    return CHANGELOG.slice(1).every((entry) => !openVersions[entry.version]);
  }, [openVersions]);

  const toggleAll = () => {
    if (allOlderCollapsed) {
      // Mở tất cả
      const next: Record<string, boolean> = {};
      CHANGELOG.forEach((entry) => {
        next[entry.version] = true;
      });
      setOpenVersions(next);
    } else {
      // Chỉ mở bản mới nhất, đóng toàn bộ bản cũ
      const next: Record<string, boolean> = {};
      CHANGELOG.forEach((entry, idx) => {
        next[entry.version] = idx === 0;
      });
      setOpenVersions(next);
    }
  };

  // Lọc changelog theo từ khóa tìm kiếm
  const filteredChangelog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CHANGELOG;

    return CHANGELOG.map((entry) => {
      const versionMatch = entry.version.toLowerCase().includes(q);
      const filteredHighlights = entry.highlights
        .map((h) => {
          const titleMatch = h.title.toLowerCase().includes(q);
          const matchedItems = h.items.filter((item) => item.toLowerCase().includes(q));
          if (titleMatch || matchedItems.length > 0) {
            return {
              title: h.title,
              items: titleMatch ? h.items : matchedItems,
            };
          }
          return null;
        })
        .filter(Boolean) as ChangelogEntry['highlights'];

      if (versionMatch || filteredHighlights.length > 0) {
        return {
          ...entry,
          highlights: filteredHighlights.length > 0 ? filteredHighlights : entry.highlights,
        };
      }
      return null;
    }).filter(Boolean) as ChangelogEntry[];
  }, [search]);

  return (
    <WhatsNewContext.Provider value={handleOpen}>
      {children}
      <Modal
        open={open}
        onClose={close}
        size="lg"
        title={
          <div className="flex flex-wrap items-center justify-between gap-2 pr-3">
            <span className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-tr from-zen-blue to-cyan-400 text-white shadow-lg shadow-blue-500/25">
                <Sparkles className="size-4" />
              </span>
              <div>
                <span className="block text-base font-bold text-white">Có gì mới trong ZenPanel</span>
                <span className="block text-xs font-normal text-slate-400">
                  Lịch sử cập nhật & cải tiến hệ thống
                </span>
              </div>
            </span>

            {version && (
              <div className="flex items-center gap-1.5">
                <Badge tone="green" className="py-0.5 text-xs">
                  <CheckCircle2 className="size-3" /> Đang dùng v{version}
                </Badge>
              </div>
            )}
          </div>
        }
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Tổng cộng {CHANGELOG.length} phiên bản phát hành
            </div>
            <Button variant="primary" onClick={close}>
              Đã hiểu
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Toolbar: Tìm kiếm & Nút Mở/Thu gọn nhanh */}
          <div className="flex flex-col gap-2 rounded-xl border border-slate-700/50 bg-ink-950/60 p-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm tính năng, từ khoá (vd: docker, cpu, adminer...)"
                className="w-full rounded-lg border border-slate-700/60 bg-ink-900/90 py-1.5 pl-9 pr-8 text-xs text-slate-200 placeholder-slate-500 transition focus:border-zen-blue focus:outline-none focus:ring-1 focus:ring-zen-blue"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-white"
                  title="Xoá tìm kiếm"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={toggleAll}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
              title={allOlderCollapsed ? 'Mở tất cả các bản cũ để xem toàn bộ' : 'Thu gọn tất cả bản cũ, chỉ mở bản mới nhất'}
            >
              <Layers className="size-3.5 text-blue-300" />
              {allOlderCollapsed ? 'Mở tất cả bản cũ' : 'Thu gọn các bản cũ'}
            </button>
          </div>

          {/* Danh sách phiên bản Changelog */}
          {filteredChangelog.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Không tìm thấy thay đổi nào khớp với từ khoá <b className="text-white">"{search}"</b>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredChangelog.map((entry) => {
                const isLatest = entry.version === latestVersion;
                const isCurrent = entry.version === version;
                // Khi đang search, luôn tự mở để xem kết quả khớp
                const isExpanded = search.trim() ? true : !!openVersions[entry.version];

                // Đếm tổng số bullet items
                const totalItems = entry.highlights.reduce((acc, h) => acc + h.items.length, 0);

                return (
                  <div
                    key={entry.version}
                    className={cn(
                      'overflow-hidden rounded-2xl border transition-all duration-200',
                      isLatest
                        ? 'border-zen-blue/50 bg-gradient-to-br from-zen-blue/15 via-slate-900/80 to-ink-950/90 shadow-lg shadow-blue-500/10'
                        : 'border-slate-800/80 bg-ink-950/50 hover:border-slate-700/80 hover:bg-ink-950/80',
                    )}
                  >
                    {/* Header phiên bản: Click để mở/đóng */}
                    <button
                      type="button"
                      onClick={() => toggleVersion(entry.version)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 p-3.5 text-left transition sm:px-4',
                        isExpanded ? 'border-b border-slate-800/80' : '',
                      )}
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-2.5">
                        <Badge
                          tone={isLatest ? 'blue' : isCurrent ? 'green' : 'slate'}
                          className="font-mono text-xs font-bold"
                        >
                          v{entry.version}
                        </Badge>

                        {isLatest && (
                          <Badge tone="amber" className="flex items-center gap-1 py-0.5 text-[11px]">
                            <Sparkles className="size-3 text-amber-300" /> Bản mới nhất
                          </Badge>
                        )}

                        {isCurrent && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                            <CheckCircle2 className="size-3.5" /> Đang sử dụng
                          </span>
                        )}

                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="size-3" />
                          {entry.date}
                        </span>

                        {/* Khi đóng, hiển thị tóm tắt ngắn gọn các nhóm tính năng */}
                        {!isExpanded && (
                          <div className="hidden items-center gap-1.5 md:flex">
                            <span className="text-slate-600">·</span>
                            <span className="max-w-[280px] truncate text-xs text-slate-400">
                              {entry.highlights.map((h) => h.title).join(' • ')}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-400">
                          {entry.highlights.length} mục ({totalItems} cải tiến)
                        </span>
                        <div
                          className={cn(
                            'flex size-6 items-center justify-center rounded-lg border border-slate-700/40 bg-slate-800/50 text-slate-400 transition-transform duration-200',
                            isExpanded ? 'rotate-180 text-white' : '',
                          )}
                        >
                          <ChevronDown className="size-3.5" />
                        </div>
                      </div>
                    </button>

                    {/* Chi tiết nội dung khi mở ra */}
                    {isExpanded && (
                      <div className="space-y-4 p-4 sm:p-5">
                        {entry.highlights.map((h) => (
                          <div
                            key={h.title}
                            className="rounded-xl border border-slate-800/60 bg-ink-950/60 p-3.5"
                          >
                            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
                              <Tag className="size-3.5 text-zen-blue" />
                              {h.title}
                            </div>
                            <ul className="space-y-2 pl-1">
                              {h.items.map((item, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed text-slate-300 sm:text-sm">
                                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-zen-blue ring-2 ring-zen-blue/20" />
                                  <span className="flex-1">{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </WhatsNewContext.Provider>
  );
}

export function useWhatsNew(): () => void {
  return useContext(WhatsNewContext);
}
