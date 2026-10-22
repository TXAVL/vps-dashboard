// ZenPanel - Màn hình đăng nhập
import { useState, type FormEvent } from 'react';
import { KeyRound, LogIn, User } from 'lucide-react';
import { post, setToken } from '../lib/api';
import { Button, ErrorBox } from '../components/ui';
import { WindowMockup } from '../components/layout/WindowMockup';

export function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await post<{ token: string }>('/api/auth/login', { username, password });
      setToken(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-zen-blue to-zen-green text-3xl shadow-2xl shadow-zen-blue/30">🧘</div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">ZenPanel</h1>
          <p className="mt-2 text-sm text-slate-400">Quản trị VPS an nhàn, trực quan, không cần nhớ lệnh</p>
        </div>

        <WindowMockup title="Đăng nhập">
          <form onSubmit={submit} className="space-y-4 bg-ink-900/80 p-6">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tên đăng nhập</span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input className="input pl-9" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
              </div>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mật khẩu</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input
                  className="input pl-9"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  required
                />
              </div>
            </label>
            {error && <ErrorBox message={error} />}
            <Button type="submit" variant="primary" className="w-full" icon={LogIn} loading={loading}>
              Đăng nhập
            </Button>
            <p className="text-center text-xs text-slate-500">
              Mật khẩu được in ra console của agent ở lần chạy đầu tiên. Quên mật khẩu? Chạy <code className="mono text-slate-300">npm run reset-password</code> trong thư mục agent.
            </p>
          </form>
        </WindowMockup>
      </div>
    </div>
  );
}
