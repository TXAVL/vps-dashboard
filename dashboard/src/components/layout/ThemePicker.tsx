// ZenPanel - Nút & Popover đổi nhanh Theme giao diện và màu nền trực tiếp trên Header
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Check, Moon, Palette, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { usePanel } from '../../lib/panel';
import type { PanelPrefs } from '../../lib/types';
import { cn } from '../ui';

export const THEME_OPTIONS: { id: PanelPrefs['theme']; label: string; color: string }[] = [
  { id: 'zen', label: 'Zen Blue', color: '#3b82f6' },
  { id: 'emerald', label: 'Emerald', color: '#10b981' },
  { id: 'violet', label: 'Violet', color: '#8b5cf6' },
  { id: 'cyan', label: 'Cyan', color: '#06b6d4' },
  { id: 'amber', label: 'Amber', color: '#f59e0b' },
  { id: 'rose', label: 'Rose', color: '#f43f5e' },
];

export const BASE_OPTIONS: { id: PanelPrefs['base']; label: string; desc: string; colors: [string, string] }[] = [
  { id: 'slate', label: 'Dark Slate', desc: 'Xanh xám hiện đại', colors: ['#0b0f19', '#1e293b'] },
  { id: 'navy', label: 'Midnight Navy', desc: 'Xanh đậm huyền bí', colors: ['#060b1f', '#16224a'] },
  { id: 'oled', label: 'OLED Black', desc: 'Đen tuyệt đối', colors: ['#000000', '#171717'] },
];

export function ThemePicker() {
  const { prefs, savePrefs } = usePanel();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Đóng khi click ngoài hoặc ấn ESC
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const activeTheme = THEME_OPTIONS.find((t) => t.id === prefs.theme) ?? THEME_OPTIONS[0];

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'relative flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-ink-950/70 px-2.5 py-1.5 text-xs font-bold transition hover:border-slate-500 hover:text-white',
          open ? 'border-zen-blue text-white ring-2 ring-zen-blue/20' : 'text-slate-300',
        )}
        data-tip="Đổi giao diện & màu sắc"
        aria-label="Đổi giao diện & màu sắc"
      >
        <div className="relative flex items-center justify-center">
          <Palette className="size-4" style={{ color: activeTheme.color }} />
          <span
            className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-ink-950"
            style={{ backgroundColor: activeTheme.color }}
          />
        </div>
        <span className="hidden sm:inline">Theme</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 animate-in fade-in zoom-in-95 rounded-2xl border border-slate-700/80 bg-ink-950/95 p-4 shadow-2xl shadow-black/80 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-zen-blue/15 text-blue-300">
                <Sparkles className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">Đổi giao diện nhanh</h3>
                <p className="text-[11px] text-slate-400">Chọn màu nhấn & tông nền phù hợp</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Đóng bảng màu"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Chọn Màu nhấn (Theme Color) */}
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Palette className="size-3.5 text-blue-400" />
                Màu nhấn (Theme)
              </span>
              <span className="text-[11px] font-normal text-slate-400">{activeTheme.label}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((t) => {
                const isSelected = prefs.theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => savePrefs({ theme: t.id })}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border p-2 text-left text-xs font-semibold transition',
                      isSelected
                        ? 'border-zen-blue bg-zen-blue/15 text-white ring-2 ring-zen-blue/30 shadow-sm'
                        : 'border-slate-800/80 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200',
                    )}
                  >
                    <span
                      className="size-4 shrink-0 rounded-full shadow"
                      style={{ backgroundColor: t.color, boxShadow: `0 0 10px ${t.color}80` }}
                    />
                    <span className="truncate">{t.label.split(' ')[0]}</span>
                    {isSelected && <Check className="ml-auto size-3 text-blue-300 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chọn Tông nền (Base Background) */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Moon className="size-3.5 text-indigo-400" />
                Tông nền (Base)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {BASE_OPTIONS.map((b) => {
                const isSelected = prefs.base === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => savePrefs({ base: b.id })}
                    className={cn(
                      'overflow-hidden rounded-xl border p-1 text-center transition',
                      isSelected
                        ? 'border-zen-blue bg-zen-blue/15 ring-2 ring-zen-blue/30'
                        : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700',
                    )}
                    data-tip={b.desc}
                  >
                    <div
                      className="mx-auto flex h-6 w-full items-center justify-center rounded-lg border border-slate-700/40 text-[10px]"
                      style={{ backgroundColor: b.colors[0] }}
                    >
                      <div className="h-3 w-6 rounded" style={{ backgroundColor: b.colors[1] }} />
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-300">
                      <span>{b.label.split(' ')[0]}</span>
                      {isSelected && <Check className="size-3 text-blue-300" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer liên kết tới Cài đặt */}
          <div className="mt-4 border-t border-slate-800/80 pt-3 flex items-center justify-between text-xs">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 font-medium text-slate-400 hover:text-white transition"
            >
              <SlidersHorizontal className="size-3.5" />
              Tất cả tùy chọn giao diện →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
