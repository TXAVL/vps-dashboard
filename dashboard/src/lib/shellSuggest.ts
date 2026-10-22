// ZenPanel - Gợi ý lệnh cho Web Terminal: lịch sử lệnh đã gõ + thư viện lệnh thường dùng theo hệ điều hành

const HISTORY_KEY = 'zenpanel.shellHistory';
const MAX_HISTORY = 300;

const COMMON = [
  'zenpanel status',
  'zenpanel restart',
  'zenpanel logs',
  'zenpanel url',
  'zenpanel update',
  'zenpanel reset-password',
  'docker ps',
  'docker ps -a',
  'docker images',
  'docker logs -f --tail 100 ',
  'docker exec -it ',
  'docker compose up -d',
  'docker compose down',
  'docker compose logs -f',
  'docker compose pull',
  'docker system prune -af',
  'docker stats --no-stream',
  'git status',
  'git pull',
  'git log --oneline -10',
  'git clone ',
  'npm install',
  'npm run build',
  'npm start',
  'node -v',
  'ping -c 4 8.8.8.8',
];

const LINUX = [
  'ls -la',
  'cd ~',
  'pwd',
  'df -h',
  'free -h',
  'du -sh * | sort -h',
  'top',
  'htop',
  'uptime',
  'whoami',
  'uname -a',
  'cat /etc/os-release',
  'ip a',
  'ss -tulnp',
  'tail -f /var/log/syslog',
  'journalctl -u zenpanel -f',
  'journalctl -xe',
  'systemctl status ',
  'systemctl restart ',
  'systemctl list-units --type=service --state=running',
  'apt update && apt upgrade -y',
  'apt install -y ',
  'ufw status verbose',
  'ufw allow ',
  'iptables -L -n -v',
  'crontab -l',
  'ps aux --sort=-%mem | head',
  'kill -9 ',
  'chmod +x ',
  'chown -R ',
  'tar -xzf ',
  'tar -czf backup.tar.gz ',
  'curl -I ',
  'wget ',
  'nano ',
  'python3 -m venv venv',
  'source venv/bin/activate',
  'pip install -r requirements.txt',
  'pm2 list',
  'pm2 logs',
  'reboot',
];

const WINDOWS = [
  'Get-ChildItem',
  'Get-Location',
  'Set-Location ',
  'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10',
  'Get-Service | Where-Object Status -eq Running',
  'Restart-Service ',
  'Stop-Process -Name ',
  'Get-NetTCPConnection -State Listen',
  'Get-NetIPAddress',
  'Test-NetConnection google.com -Port 443',
  'ipconfig /all',
  'systeminfo',
  'Get-PSDrive -PSProvider FileSystem',
  'Get-NetFirewallRule -Enabled True | Select-Object -First 20',
  'Get-EventLog -LogName System -Newest 20',
  'Get-Content -Wait -Tail 50 ',
  'Get-ScheduledTask',
  'winget upgrade --all',
  'winget install ',
  'Expand-Archive ',
  'Compress-Archive ',
  'Invoke-WebRequest ',
  'Restart-Computer',
  'python -m venv venv',
  '.\\venv\\Scripts\\Activate.ps1',
  'pip install -r requirements.txt',
];

export function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function pushHistory(command: string): void {
  const cmd = command.trim();
  if (!cmd || cmd.length > 500) return;
  const next = [cmd, ...loadHistory().filter((c) => c !== cmd)].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // storage bị chặn: chỉ mất lịch sử gợi ý
  }
}

/** Gợi ý cho dòng đang gõ: ưu tiên lịch sử (mới nhất trước), sau đó thư viện lệnh, chỉ lệnh bắt đầu bằng phần đã gõ */
export function suggest(line: string, windows: boolean, limit = 6): string[] {
  if (!line.trim() || line.length < 1) return [];
  const lower = line.toLowerCase();
  const pool = [...loadHistory(), ...COMMON, ...(windows ? WINDOWS : LINUX)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cmd of pool) {
    if (out.length >= limit) break;
    const key = cmd.toLowerCase();
    if (seen.has(key) || key === lower || !key.startsWith(lower)) continue;
    seen.add(key);
    out.push(cmd);
  }
  return out;
}
