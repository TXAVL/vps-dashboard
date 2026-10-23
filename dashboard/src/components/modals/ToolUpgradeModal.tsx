// ZenPanel - Modal riêng cho nâng cấp công cụ / runtime hệ thống (Node.js, npm, Git, cloudflared, Docker...):
// so sánh phiên bản → chạy (bước thật + % backend) → xác minh phiên bản mới sau cài
import { useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, RefreshCw, RotateCw, ShieldAlert, XCircle } from 'lucide-react';
import { formatDuration } from '../../lib/format';
import type { Job } from '../../lib/types';
import { useJobs } from '../jobs';
import { Button, Modal, Notice, cn } from '../ui';
import { errorLines, LogConsole, ProgressTrack, StepList, useJobWatch } from './jobkit';

export interface ToolUpgradeInfo {
  name: string;
  icon: ReactNode;
  currentVersion: string | null;
  targetVersion: string;
  description?: string;
  changelogUrl?: string | null;
  securityNotes?: string | null;
  /** Ghi chú sau khi cài (vd cần khởi động lại ZenPanel để dùng Node mới) */
  restartNote?: string;
}

export function ToolUpgradeModal({
  tool,
  start,
  verify,
  onClose,
}: {
  tool: ToolUpgradeInfo;
  start: () => Promise<Job>;
  /** Đọc lại phiên bản sau khi cài để xác nhận */
  verify: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [verified, setVerified] = useState<string | null | undefined>(undefined);
  const { trackJob } = useJobs();
  const { job, elapsed } = useJobWatch(jobId, (done) => {
    if (done.status === 'success') void verify().then(setVerified).catch(() => setVerified(null));
  });

  const run = async () => {
    setStarting(true);
    setStartError(null);
    setVerified(undefined);
    try {
      const started = await start();
      setJobId(started.id);
    } catch (err) {
      setStartError((err as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const phase = !jobId ? 'confirm' : !job || job.status === 'running' ? 'run' : job.status === 'success' ? 'done' : 'error';
  const close = () => {
    if (jobId && phase === 'run') trackJob(jobId);
    onClose();
  };

  return (
    <Modal open onClose={close} size="lg" title={`Nâng cấp ${tool.name}`}>
      <div className="mb-5 flex items-center gap-4 rounded-2xl border border-slate-700/50 bg-gradient-to-br from-ink-950 via-slate-900/50 to-ink-950 p-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-200 ring-1 ring-slate-700">{tool.icon}</div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3 sm:gap-5">
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Hiện tại</div>
            <div className="mono text-lg font-black text-slate-300">{tool.currentVersion || 'Chưa cài'}</div>
          </div>
          <ArrowRight className="size-5 text-sky-400" />
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">{phase === 'done' ? 'Đã cài' : 'Mục tiêu'}</div>
            <div className="mono text-lg font-black text-emerald-300">{phase === 'done' && verified ? verified : tool.targetVersion}</div>
          </div>
        </div>
      </div>

      {phase === 'confirm' && (
        <div className="space-y-4">
          {tool.description && <p className="text-sm text-slate-400">{tool.description}</p>}
          {tool.securityNotes && (
            <Notice tone="red" icon={ShieldAlert}>
              {tool.securityNotes}
            </Notice>
          )}
          {tool.restartNote && (
            <Notice tone="amber" icon={AlertTriangle}>
              {tool.restartNote}
            </Notice>
          )}
          {startError && (
            <Notice tone="red" icon={XCircle}>
              {startError}
            </Notice>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-4">
            {tool.changelogUrl && (
              <a href={tool.changelogUrl} target="_blank" rel="noreferrer" className="mr-auto flex items-center gap-1 text-xs font-semibold text-blue-300 hover:underline">
                Xem changelog <ExternalLink className="size-3" />
              </a>
            )}
            <Button variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button variant="primary" icon={RefreshCw} loading={starting} onClick={() => void run()}>
              Nâng cấp ngay
            </Button>
          </div>
        </div>
      )}

      {phase !== 'confirm' && (
        <div className="space-y-5">
          {phase === 'run' && (
            <div className="rounded-2xl border border-sky-500/20 bg-sky-950/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-white">{job?.stage ?? 'Đang khởi tạo...'}</span>
                <span className="mono shrink-0 text-sm font-bold text-sky-300">{job?.progress !== undefined ? `${job.progress}%` : formatDuration(elapsed)}</span>
              </div>
              <ProgressTrack className="mt-3" percent={job?.progress ?? null} status="running" />
            </div>
          )}

          {phase === 'done' && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4">
              <CheckCircle2 className="size-9 shrink-0 text-emerald-400" />
              <div className="text-sm">
                <div className="font-bold text-white">Đã nâng cấp {tool.name}</div>
                <div className="text-slate-400">
                  {verified === undefined ? 'Đang xác minh phiên bản...' : verified ? `Phiên bản trên máy hiện là ${verified}.` : 'Không đọc được phiên bản mới, hãy bấm "Kiểm tra bản mới".'} Mất {formatDuration(elapsed)}.
                </div>
                {tool.restartNote && <div className="mt-1 text-xs text-amber-300">{tool.restartNote}</div>}
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4">
              <div className="flex items-center gap-3">
                <XCircle className="size-7 shrink-0 text-rose-400" />
                <div className="text-sm">
                  <div className="font-bold text-white">Nâng cấp thất bại</div>
                  <div className="text-rose-200/90">{job?.error}</div>
                </div>
              </div>
              {errorLines(job?.log ?? '').length > 0 && (
                <pre className="mono mt-3 whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-rose-200">{errorLines(job?.log ?? '').join('\n')}</pre>
              )}
            </div>
          )}

          <div className={cn(phase === 'error' && 'opacity-90')}>
            <StepList steps={job?.steps ?? []} now={Date.now()} />
          </div>
          <LogConsole log={job?.log ?? ''} defaultOpen={phase === 'error'} fileName={`${tool.name.toLowerCase().replace(/\W+/g, '-')}-upgrade.log`} />

          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            {phase === 'run' ? (
              <Button variant="ghost" onClick={close}>
                Chạy nền
              </Button>
            ) : (
              <>
                <Button variant={phase === 'done' ? 'primary' : 'ghost'} onClick={onClose}>
                  Đóng
                </Button>
                {phase === 'error' && (
                  <Button variant="primary" icon={RotateCw} onClick={() => void run()}>
                    Thử lại
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
