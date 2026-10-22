// ZenPanel - Thông báo (toast) và hộp thoại xác nhận dùng chung
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button, Modal } from './ui';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Bắt người dùng gõ lại chuỗi này để xác nhận (thao tác nguy hiểm) */
  typeToConfirm?: string;
}

interface PromptOptions {
  title: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

interface FeedbackContextValue {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Hộp nhập 1 dòng, trả về null nếu hủy */
  prompt: (options: PromptOptions) => Promise<string | null>;
  /** Chạy thao tác bất đồng bộ, tự báo lỗi/thành công */
  run: <T>(task: () => Promise<T>, success?: string) => Promise<T | undefined>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const toastStyle: Record<ToastKind, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'border-zen-green/40 text-zen-green' },
  error: { icon: XCircle, className: 'border-zen-red/40 text-zen-red' },
  info: { icon: Info, className: 'border-zen-blue/40 text-zen-blue' },
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [promptDialog, setPromptDialog] = useState<PromptOptions | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const promptResolver = useRef<((value: string | null) => void) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setTyped('');
    setDialog(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    setPromptValue(options.defaultValue ?? '');
    setPromptDialog(options);
    return new Promise<string | null>((resolve) => {
      promptResolver.current = resolve;
    });
  }, []);

  const closePrompt = (value: string | null) => {
    promptResolver.current?.(value);
    promptResolver.current = null;
    setPromptDialog(null);
  };

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setDialog(null);
  };

  const run = useCallback(
    async <T,>(task: () => Promise<T>, success?: string) => {
      try {
        const result = await task();
        if (success) toast(success);
        return result;
      } catch (err) {
        toast((err as Error).message, 'error');
        return undefined;
      }
    },
    [toast],
  );

  const blocked = Boolean(dialog?.typeToConfirm && typed !== dialog.typeToConfirm);

  return (
    <FeedbackContext.Provider value={{ toast, confirm, prompt, run }}>
      {children}

      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const { icon: Icon, className } = toastStyle[t.kind];
          return (
            <div key={t.id} className={`glass pointer-events-auto flex items-start gap-3 border px-4 py-3 text-sm ${className}`}>
              <Icon className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1 whitespace-pre-line break-words text-slate-200">{t.message}</p>
              <button className="text-slate-500 hover:text-slate-200" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}>
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>

      <Modal open={Boolean(dialog)} onClose={() => close(false)} title={dialog?.title ?? ''} size="sm">
        {dialog && (
          <div className="space-y-4">
            <div className="flex gap-3">
              {dialog.danger && <AlertTriangle className="size-5 shrink-0 text-zen-amber" />}
              <div className="text-sm text-slate-300">{dialog.message}</div>
            </div>
            {dialog.typeToConfirm && (
              <label className="block space-y-1.5 text-sm">
                <span className="text-slate-400">
                  Gõ <b className="mono text-slate-100">{dialog.typeToConfirm}</b> để xác nhận
                </span>
                <input className="input mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(false)}>
                Hủy
              </Button>
              <Button variant={dialog.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)}>
                {dialog.confirmLabel ?? 'Xác nhận'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(promptDialog)} onClose={() => closePrompt(null)} title={promptDialog?.title ?? ''} size="sm">
        {promptDialog && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (promptValue.trim()) closePrompt(promptValue.trim());
            }}
          >
            <label className="block space-y-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{promptDialog.label}</span>
              <input className="input mono" value={promptValue} placeholder={promptDialog.placeholder} onChange={(e) => setPromptValue(e.target.value)} autoFocus />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => closePrompt(null)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" disabled={!promptValue.trim()}>
                {promptDialog.confirmLabel ?? 'OK'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback phải nằm trong FeedbackProvider');
  return value;
}
