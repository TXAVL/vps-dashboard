// ZenPanel - Modal riêng cho cập nhật / quay lại phiên bản panel:
// xem có gì mới (changelog thân thiện) → tải gói (tiến độ thật) → cài & khởi động lại → kết nối lại → hoàn tất
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, AlertTriangle, CheckCircle2, ChevronDown, Clipboard, Clock, Copy, Database, ExternalLink, GitCommit, Globe, KeyRound, Loader2, Rocket, RotateCcw, ShieldCheck, Sparkles, WifiOff, XCircle } from 'lucide-react';
import { get, getToken, post } from '../../lib/api';
import { formatBytes, formatDuration, formatRelative } from '../../lib/format';
import type { Job, UpdateChangelog, VersionPackage } from '../../lib/types';
import { Badge, Button, CopyButton, Modal, Notice, cn } from '../ui';
import { LogConsole, ProgressTrack, useJobWatch } from './jobkit';

export interface UpdateTarget {
  ref: string;
  sha: string;
  version: string;
  label?: string;
}

type Phase = 'review' | 'download' | 'install' | 'restart' | 'reconnect' | 'done' | 'error';

const STAGES: { id: Phase; label: string }[] = [
  { id: 'download', label: 'Tải gói' },
  { id: 'install', label: 'Cài & build' },
  { id: 'restart', label: 'Khởi động lại' },
  { id: 'reconnect', label: 'Kết nối lại' },
];

const order: Phase[] = ['review', 'download', 'install', 'restart', 'reconnect', 'done'];

function compare(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export function PanelUpdateModal({
  target,
  current,
  pkg,
  onClose,
  onFinished,
}: {
  target: UpdateTarget;
  current: string;
  pkg?: VersionPackage;
  onClose: () => void;
  onFinished: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('review');
  const [changelog, setChangelog] = useState<UpdateChangelog | null>(null);
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState(0);
  const [downloadJob, setDownloadJob] = useState<string | null>(null);
  const [installLog, setInstallLog] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [tunnelRenewed, setTunnelRenewed] = useState(false);
  const [initialDirectUrl, setInitialDirectUrl] = useState<string | null>(null);
  const [customInputUrl, setCustomInputUrl] = useState('');
  const initialOrigin = useRef(window.location.origin);
  const cancelled = useRef(false);
  const downgrade = compare(target.version, current) < 0;

  useEffect(() => {
    void get<UpdateChangelog>(`/api/update/changelog?ref=${encodeURIComponent(target.sha)}`)
      .then(setChangelog)
      .catch((err: Error) => setChangelogError(err.message));

    void get<{ directUrl?: string | null }>('/api/update/status', { timeout: 3500 })
      .then((s) => {
        if (s?.directUrl) setInitialDirectUrl(s.directUrl);
      })
      .catch(() => undefined);

    return () => {
      cancelled.current = true;
    };
  }, [target.sha]);

  useEffect(() => {
    if (!['download', 'install', 'restart', 'reconnect'].includes(phase)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const { job: dl } = useJobWatch(downloadJob, (done) => {
    if (done.status === 'success') {
      const id = (done.result as { id?: string } | undefined)?.id;
      if (id) void install(id);
      else fail('Không xác định được gói vừa tải');
    } else fail(done.error ?? 'Tải gói thất bại');
  });

  const fail = (message: string) => {
    setError(message);
    setPhase('error');
  };

  const start = async () => {
    setError(null);
    setStartedAt(Date.now());
    if (pkg) return install(pkg.id);
    setPhase('download');
    try {
      const job = await post<Job>('/api/update/download', { ref: target.sha });
      setDownloadJob(job.id);
    } catch (err) {
      fail((err as Error).message);
    }
  };

  /** Chạy installer rồi theo dõi: agent tắt (restart) → bật lại (startedAt mới) → tunnel có URL mới */
  const install = async (id: string) => {
    setPhase('install');
    const installStart = Date.now();
    try {
      await post(`/api/update/packages/${encodeURIComponent(id)}/install`, {}, { timeout: 10000 });
    } catch (err) {
      return fail((err as Error).message);
    }
    let sawDown = false;
    let downAt = 0;
    const isTryCloudflare = window.location.hostname.endsWith('trycloudflare.com');

    for (let i = 0; i < 90 && !cancelled.current; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const log = await get<{ log: string }>('/api/update/log', { timeout: 3000 }).catch(() => null);
      if (log?.log) setInstallLog(log.log);
      const status = await get<{
        startedAt: number;
        tunnelUrl: string | null;
        tunnelStatus?: string;
        publicUrl?: string | null;
        directUrl?: string | null;
      }>('/api/update/status', { timeout: 3000 }).catch(() => null);

      if (!status) {
        if (!sawDown) {
          sawDown = true;
          downAt = Date.now();
        }
        setPhase('restart');

        // Khi người dùng đang mở panel qua trycloudflare.com:
        // Lúc agent khởi động lại, tunnel cũ bị ngắt vĩnh viễn và Cloudflare cấp domain mới.
        // Sau khi đã thấy agent tắt (sawDown) và chờ đủ ~35s cho installer build & restart:
        if (isTryCloudflare && downAt && Date.now() - downAt > 35_000) {
          setTunnelRenewed(true);
          setPhase('done');
          onFinished();
          return;
        }
        continue;
      }

      if (status.startedAt > installStart - 5000) {
        setPhase('reconnect');
        if (status.directUrl) setInitialDirectUrl(status.directUrl);

        // Quét tìm link Cloudflare Tunnel từ cả status API lẫn install log
        const logMatches = [...(log?.log ?? '').matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi)];
        const logTunnelUrl = logMatches.length > 0 ? logMatches[logMatches.length - 1][0] : null;
        const resolvedTunnel = status.tunnelUrl || logTunnelUrl;

        // Nếu máy chủ bật tunnel (tunnelStatus === 'starting' hoặc 'idle')
        // và chưa lấy được URL, ta tiếp tục chờ (tối đa ~80s) để bắt được URL mới chính xác
        const isTunnelStarting = (status.tunnelStatus === 'starting' || status.tunnelStatus === 'idle') && !resolvedTunnel;
        if (isTunnelStarting && i < 60) {
          continue;
        }

        const finalUrl = resolvedTunnel || status.publicUrl || status.directUrl || null;
        setNewUrl(finalUrl);
        setPhase('done');
        onFinished();
        return;
      } else if (sawDown) {
        setPhase('restart');
      }

      if (/(✘|error:|lỗi nghiêm trọng|failed to)/i.test(log?.log.split('\n').slice(-3).join('\n') ?? '')) {
        return fail('Installer báo lỗi, xem nhật ký bên dưới');
      }
    }
    if (!cancelled.current) {
      if (isTryCloudflare && sawDown) {
        setTunnelRenewed(true);
        setPhase('done');
        onFinished();
        return;
      }
      fail(
        isTryCloudflare
          ? 'Quá thời gian chờ kết nối lại. Khi cập nhật qua Cloudflare Tunnel, đường dẫn sẽ đổi mới sau khi khởi động. Hãy chạy "zenpanel url" trên máy chủ để lấy link mới.'
          : 'Quá 5 phút chưa thấy ZenPanel khởi động lại. Kiểm tra nhật ký hoặc chạy "zenpanel status" trên máy chủ.',
      );
    }
  };

  const locked = phase === 'install' || phase === 'restart' || phase === 'reconnect';
  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const dlResult = (dl?.result ?? {}) as { received?: number; total?: number | null; speed?: number };
  const token = getToken();

  // Bóc tách URL nếu người dùng dán cả link chứa ?token=...&auto_login=1
  let customBase = customInputUrl.trim();
  let extractedToken = '';
  if (customBase) {
    try {
      const parsed = new URL(customBase);
      customBase = parsed.origin;
      extractedToken = parsed.searchParams.get('token') || '';
    } catch {
      // Giữ nguyên chuỗi nếu chưa parse được
    }
  }

  // Khi đang dùng TryCloudflare mà agent khởi động lại nhưng trình duyệt chưa tự kết nối được URL mới
  const isOldUrlDead = Boolean(tunnelRenewed && !newUrl && !customBase);

  // Không bao giờ fallback về window.location.origin nếu domain cũ đã ngắt
  const effectiveBase = (customBase || newUrl || (isOldUrlDead ? '' : window.location.origin)).replace(/\/+$/, '');
  const activeToken = extractedToken || token;
  const autoLogin = activeToken && effectiveBase ? `${effectiveBase}/?token=${encodeURIComponent(activeToken)}&auto_login=1` : effectiveBase;

  let urlChanged = false;
  if (customBase || newUrl) {
    try {
      urlChanged = !initialOrigin.current.includes(new URL(effectiveBase).hostname);
    } catch {
      urlChanged = effectiveBase.replace(/\/+$/, '') !== initialOrigin.current.replace(/\/+$/, '');
    }
  } else if (isOldUrlDead) {
    urlChanged = true;
  }

  const stageIndex = order.indexOf(phase);
  const percent =
    phase === 'download' ? (dl?.progress ?? null) : phase === 'install' ? null : phase === 'restart' ? 70 : phase === 'reconnect' ? 90 : phase === 'done' ? 100 : null;

  return (
    <Modal
      open
      onClose={locked ? () => undefined : onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2">
          {downgrade ? <RotateCcw className="size-5 text-amber-400" /> : <Rocket className="size-5 text-sky-400" />}
          <span>{downgrade ? 'Quay lại phiên bản cũ' : 'Cập nhật ZenPanel'}</span>
        </div>
      }
    >
      {/* Hero: số phiên bản */}
      <div className="mb-5 flex items-center justify-center gap-4 rounded-2xl border border-slate-700/50 bg-gradient-to-br from-ink-950 via-slate-900/60 to-ink-950 p-5">
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Đang dùng</div>
          <div className="mono text-2xl font-black text-slate-300">v{current}</div>
        </div>
        <ArrowRight className={cn('size-6', downgrade ? 'text-amber-400' : 'text-sky-400')} />
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">{downgrade ? 'Quay về' : 'Bản mới'}</div>
          <div className={cn('mono text-2xl font-black', downgrade ? 'text-amber-300' : 'text-emerald-300')}>v{target.version}</div>
        </div>
      </div>

      {phase === 'review' && (
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
              <Sparkles className="size-4 text-amber-300" /> {downgrade ? 'Những gì sẽ mất khi quay lại' : 'Có gì mới'}
            </div>
            {!changelog && !changelogError && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 p-4 text-sm text-slate-400">
                <Loader2 className="size-4 animate-spin" /> Đang đọc nhật ký thay đổi từ GitHub...
              </div>
            )}
            {changelogError && <Notice tone="amber">Không tải được nhật ký thay đổi: {changelogError}</Notice>}
            {changelog && changelog.entries.length > 0 && (
              <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                {changelog.entries.map((entry, idx) => (
                  <div key={entry.version} className="overflow-hidden rounded-xl border border-slate-700/50 bg-ink-950/50">
                    <button type="button" onClick={() => setOpenEntry(openEntry === idx ? -1 : idx)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                      <Badge tone={idx === 0 ? 'green' : 'slate'}>v{entry.version}</Badge>
                      <span className="text-xs text-slate-500">{entry.date}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{entry.highlights[0]?.title}</span>
                      <ChevronDown className={cn('size-4 shrink-0 text-slate-500 transition', openEntry === idx && 'rotate-180')} />
                    </button>
                    {openEntry === idx && (
                      <div className="space-y-3 border-t border-slate-800 px-4 py-3">
                        {entry.highlights.map((h) => (
                          <div key={h.title}>
                            <div className="text-sm font-semibold text-slate-100">{h.title}</div>
                            <ul className="mt-1 space-y-1">
                              {h.items.map((item) => (
                                <li key={item} className="flex gap-2 text-xs leading-relaxed text-slate-400">
                                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-sky-400" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {changelog && changelog.entries.length === 0 && (
              <div className="space-y-1.5 rounded-xl border border-slate-700/50 bg-ink-950/50 p-3">
                <div className="text-xs text-slate-500">Bản này chưa có ghi chú thay đổi, các thay đổi gần nhất:</div>
                {changelog.commits.map((c) => (
                  <div key={c.sha} className="flex items-center gap-2 text-xs">
                    <GitCommit className="size-3.5 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1 truncate text-slate-300">{c.message}</span>
                    <span className="shrink-0 text-slate-500">{formatRelative(c.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { icon: Database, text: 'Website, database, app & cài đặt giữ nguyên' },
              { icon: Clock, text: 'Panel tạm ngắt khoảng 1–2 phút' },
              { icon: Globe, text: 'Link Cloudflare có thể đổi, ZenPanel sẽ đưa link mới' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-2 rounded-xl border border-slate-700/40 bg-ink-950/40 p-3 text-xs text-slate-400">
                <Icon className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                {text}
              </div>
            ))}
          </div>
          {pkg && <div className="text-xs text-slate-500">Gói đã có sẵn trên máy ({formatBytes(pkg.size)}), bỏ qua bước tải.</div>}

          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <Button variant="ghost" onClick={onClose}>
              Để sau
            </Button>
            <Button variant={downgrade ? 'secondary' : 'primary'} icon={downgrade ? RotateCcw : Rocket} onClick={() => void start()}>
              {downgrade ? `Quay lại v${target.version}` : `Cập nhật lên v${target.version}`}
            </Button>
          </div>
        </div>
      )}

      {phase !== 'review' && (
        <div className="space-y-5">
          {/* Thanh 4 giai đoạn */}
          <div className="grid grid-cols-4 gap-2">
            {STAGES.map((s) => {
              const idx = order.indexOf(s.id);
              const failedHere = phase === 'error' && error && idx === Math.max(1, stageIndex);
              const state = phase === 'done' || idx < stageIndex ? 'done' : idx === stageIndex ? 'active' : 'todo';
              return (
                <div key={s.id} className="text-center">
                  <div
                    className={cn(
                      'mx-auto flex size-9 items-center justify-center rounded-full ring-2 transition',
                      failedHere ? 'bg-rose-500/15 text-rose-300 ring-rose-500/50' : state === 'done' ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/50' : state === 'active' ? 'bg-sky-500/15 text-sky-300 ring-sky-400' : 'bg-slate-800/60 text-slate-600 ring-slate-700',
                    )}
                  >
                    {state === 'done' ? <CheckCircle2 className="size-4" /> : state === 'active' ? <Loader2 className="size-4 animate-spin" /> : <span className="text-xs font-bold">{idx}</span>}
                  </div>
                  <div className={cn('mt-1.5 text-[11px]', state === 'active' ? 'font-bold text-white' : 'text-slate-500')}>{s.label}</div>
                </div>
              );
            })}
          </div>

          {phase !== 'done' && phase !== 'error' && (
            <div className="rounded-2xl border border-sky-500/20 bg-sky-950/20 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-white">
                  {phase === 'download' && 'Đang tải gói mã nguồn từ GitHub...'}
                  {phase === 'install' && 'Đang cài dependencies và build dashboard...'}
                  {phase === 'restart' && 'ZenPanel đang khởi động lại...'}
                  {phase === 'reconnect' && 'Đang chờ Cloudflare Tunnel cấp đường dẫn...'}
                </span>
                <span className="mono text-xs text-slate-400">{formatDuration(elapsed)}</span>
              </div>
              <ProgressTrack className="mt-3" percent={percent} status="running" />
              {phase === 'download' && dlResult.received ? (
                <div className="mt-2 text-[11px] text-slate-400">
                  {formatBytes(dlResult.received)}
                  {dlResult.total ? ` / ${formatBytes(dlResult.total)}` : ''} · {formatBytes(dlResult.speed ?? 0)}/s
                </div>
              ) : null}
              {phase === 'restart' && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300">
                  <WifiOff className="size-3.5" /> Mất kết nối tạm thời là bình thường, đừng đóng tab này.
                </div>
              )}
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4">
                <CheckCircle2 className="size-9 shrink-0 text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white">Đã khởi động lại với ZenPanel v{target.version}</div>
                  <div className="text-xs text-slate-400">Hoàn tất trong {formatDuration(elapsed)} · toàn bộ dữ liệu & cài đặt được bảo toàn nguyên vẹn.</div>
                </div>
              </div>

              {/* Thẻ in URL mới & Nút Mở Tab Mới Tự Động Đăng Nhập */}
              <div className="space-y-3.5 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-ink-950 via-emerald-950/20 to-ink-950 p-4 sm:p-5 shadow-xl shadow-emerald-950/25">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    <Globe className="size-4 text-sky-400" /> {urlChanged ? 'Đường dẫn Website mới' : 'Đường dẫn Website (Không đổi)'}
                  </span>
                  {isOldUrlDead ? (
                    <Badge tone="amber">Cần mở link mới</Badge>
                  ) : urlChanged ? (
                    <Badge tone="green">Đường dẫn mới</Badge>
                  ) : (
                    <Badge tone="blue">Giữ nguyên URL</Badge>
                  )}
                </div>

                {isOldUrlDead ? (
                  /* Trường hợp domain trycloudflare.com bị đổi sau khi restart */
                  <div className="space-y-3 pt-1">
                    <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                        <AlertTriangle className="size-4 shrink-0 text-amber-400" />
                        <span>Đường dẫn cũ đã đóng do Cloudflare Tunnel khởi động lại trên VPS</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        ZenPanel đã khởi động lại xong với phiên bản mới. Do đang dùng Quick Tunnel tạm thời, máy chủ đã được cấp một domain mới và ngắt domain cũ. Hãy dùng một trong các cách sau:
                      </p>

                      <div className="space-y-2 pt-1 border-t border-amber-500/20">
                        <div className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
                          <span className="flex size-4 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-bold text-sky-300">1</span>
                          Lấy link mới từ terminal VPS (Chạy lệnh sau):
                        </div>
                        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-2">
                          <code className="mono flex-1 text-xs text-emerald-300 font-bold">zenpanel url</code>
                          <CopyButton value="zenpanel url" />
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
                          <span className="flex size-4 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-bold text-sky-300">2</span>
                          Dán link vừa lấy vào đây để vào thẳng Web mới:
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={customInputUrl}
                            onChange={(e) => setCustomInputUrl(e.target.value)}
                            placeholder="Dán link (https://xxxx.trycloudflare.com/...)"
                            className="flex-1 rounded-xl border border-slate-700 bg-black/60 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Clipboard}
                            onClick={async () => {
                              try {
                                const clip = await navigator.clipboard?.readText();
                                if (clip) setCustomInputUrl(clip.trim());
                              } catch {}
                            }}
                          >
                            Dán
                          </Button>
                        </div>
                      </div>

                      {initialDirectUrl && (
                        <div className="pt-2 border-t border-amber-500/20 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                            <span className="flex size-4 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-bold text-sky-300">3</span>
                            Hoặc mở qua IP máy chủ: <code className="text-emerald-300 font-mono font-semibold">{initialDirectUrl}</code>
                          </div>
                          <Button
                            size="xs"
                            variant="primary"
                            icon={ExternalLink}
                            onClick={() =>
                              window.open(activeToken ? `${initialDirectUrl}/?token=${encodeURIComponent(activeToken)}&auto_login=1` : initialDirectUrl, '_blank')
                            }
                          >
                            Mở qua IP ngay
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 1. In URL công khai */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-400">Đường dẫn truy cập (Public URL):</div>
                      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-2.5">
                        <code className="mono flex-1 truncate text-xs sm:text-sm font-semibold text-emerald-300">{effectiveBase}</code>
                        <CopyButton value={effectiveBase} />
                      </div>
                    </div>

                    {/* 2. In Link đăng nhập 1-Click tự động login */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-amber-300/90 flex items-center gap-1">
                        <KeyRound className="size-3.5 text-amber-400" /> Link đăng nhập 1-Click (Tự động vào thẳng web mới không cần gõ lại mật khẩu):
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2.5">
                        <code className="mono flex-1 truncate text-xs text-amber-200">{autoLogin}</code>
                        <CopyButton value={autoLogin} />
                      </div>
                    </div>

                    {/* Nút hành động trực tiếp */}
                    <div className="pt-1.5 flex flex-wrap items-center gap-2">
                      {!urlChanged ? (
                        <Button
                          variant="primary"
                          size="md"
                          className="flex-1 sm:flex-initial font-bold shadow-lg shadow-emerald-500/25"
                          icon={RotateCcw}
                          onClick={() => window.location.reload()}
                        >
                          Tải lại trang (F5) để dùng ngay
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="md"
                          className="flex-1 sm:flex-initial font-bold shadow-lg shadow-sky-500/25"
                          icon={ExternalLink}
                          onClick={() => window.open(autoLogin, '_blank')}
                        >
                          Mở tab mới & Tự đăng nhập ngay
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="md"
                        icon={Copy}
                        onClick={() => {
                          void navigator.clipboard?.writeText(autoLogin);
                        }}
                      >
                        Sao chép link đăng nhập
                      </Button>
                      {!urlChanged && (
                        <Button
                          variant="ghost"
                          size="md"
                          icon={ExternalLink}
                          onClick={() => window.open(autoLogin, '_blank')}
                        >
                          Mở tab mới
                        </Button>
                      )}
                    </div>

                    {initialDirectUrl && (
                      <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-xs">
                        <span className="text-slate-400 truncate">Hoặc mở trực tiếp qua IP máy chủ: <code className="text-slate-300 font-mono">{initialDirectUrl}</code></span>
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={ExternalLink}
                          onClick={() =>
                            window.open(activeToken ? `${initialDirectUrl}/?token=${encodeURIComponent(activeToken)}&auto_login=1` : initialDirectUrl, '_blank')
                          }
                        >
                          Mở qua IP
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4">
              <XCircle className="mt-0.5 size-6 shrink-0 text-rose-400" />
              <div className="text-sm">
                <div className="font-bold text-white">Cập nhật chưa hoàn tất</div>
                <div className="text-rose-200/90">{error}</div>
                <div className="mt-1 text-xs text-slate-400">Phiên bản cũ vẫn được giữ, bạn có thể thử lại.</div>
              </div>
            </div>
          )}

          <LogConsole log={installLog || dl?.log || ''} defaultOpen={phase === 'error'} fileName={`zenpanel-update-${target.version}.log`} />

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-4">
            {locked && (
              <span className="mr-auto flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="size-3.5" /> Không thể đóng trong lúc cài đặt
              </span>
            )}
            {phase === 'download' && (
              <Button variant="ghost" onClick={onClose}>
                Chạy nền
              </Button>
            )}
            {phase === 'error' && (
              <>
                <Button variant="ghost" onClick={onClose}>
                  Đóng
                </Button>
                <Button variant="primary" icon={RotateCcw} onClick={() => void start()}>
                  Thử lại
                </Button>
              </>
            )}
            {phase === 'done' && (
              <>
                <Button variant="ghost" onClick={onClose}>
                  Đóng
                </Button>
                {!urlChanged ? (
                  <Button
                    variant="primary"
                    icon={RotateCcw}
                    onClick={() => window.location.reload()}
                  >
                    Tải lại trang (F5)
                  </Button>
                ) : effectiveBase ? (
                  <Button
                    variant="primary"
                    icon={ExternalLink}
                    onClick={() => window.open(autoLogin, '_blank')}
                  >
                    Mở tab mới (Tự đăng nhập)
                  </Button>
                ) : initialDirectUrl ? (
                  <Button
                    variant="primary"
                    icon={ExternalLink}
                    onClick={() =>
                      window.open(activeToken ? `${initialDirectUrl}/?token=${encodeURIComponent(activeToken)}&auto_login=1` : initialDirectUrl, '_blank')
                    }
                  >
                    Mở qua IP ({initialDirectUrl})
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
