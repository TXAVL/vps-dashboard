// ZenPanel - Quản lý cấu hình Shell & Alias (tự động đọc và lưu vĩnh viễn vào ~/.bashrc và profile)
import { existsSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface TerminalAlias {
  name: string;
  command: string;
  source: string;
}

/** Đọc tất cả các alias hiện có trong .bashrc, .bash_aliases, .zshrc, hoặc PowerShell Profile */
export async function listShellAliases(): Promise<TerminalAlias[]> {
  const home = os.homedir();
  const isWin = process.platform === 'win32';
  const list: TerminalAlias[] = [];
  const seen = new Set<string>();

  if (!isWin) {
    const files = [
      path.join(home, '.bashrc'),
      path.join(home, '.bash_aliases'),
      path.join(home, '.profile'),
      path.join(home, '.zshrc'),
      '/etc/environment',
      '/etc/profile.d/zenpanel.sh',
    ];

    for (const f of files) {
      if (!existsSync(f)) continue;
      try {
        const text = await readFile(f, 'utf8');
        // Match: alias name='command' or alias name="command" or alias name=cmd
        const aliasRegex = /^\s*alias\s+([a-zA-Z0-9_\-.:]+)=(?:'([^']*)'|"([^"]*)"|([^\s#]+))/gm;
        let match: RegExpExecArray | null;
        while ((match = aliasRegex.exec(text)) !== null) {
          const name = match[1];
          const command = match[2] || match[3] || match[4] || '';
          if (name && !seen.has(name)) {
            seen.add(name);
            list.push({ name, command, source: path.basename(f) });
          }
        }
      } catch {
        // bỏ qua nếu file bị khoá quyền
      }
    }
  } else {
    // Windows: đọc từ PowerShell Profile
    const docs = path.join(home, 'Documents');
    const files = [
      path.join(docs, 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
      path.join(docs, 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
    ];
    for (const f of files) {
      if (!existsSync(f)) continue;
      try {
        const text = await readFile(f, 'utf8');
        const aliasRegex = /^\s*Set-Alias\s+(?:-Name\s+)?([a-zA-Z0-9_\-]+)\s+(?:-Value\s+)?([^\s#]+)/gim;
        let match: RegExpExecArray | null;
        while ((match = aliasRegex.exec(text)) !== null) {
          const name = match[1];
          const command = match[2] || '';
          if (name && !seen.has(name)) {
            seen.add(name);
            list.push({ name, command, source: 'PowerShell Profile' });
          }
        }
      } catch {}
    }
  }

  return list;
}

/** Lưu vĩnh viễn alias vào ~/.bashrc (Linux) hoặc PowerShell Profile (Windows) */
export async function saveShellAlias(name: string, command: string): Promise<{ ok: boolean; file: string }> {
  const home = os.homedir();
  const isWin = process.platform === 'win32';
  const cleanName = name.trim().replace(/[^a-zA-Z0-9_\-.:]/g, '');
  const cleanCmd = command.trim();

  if (!cleanName || !cleanCmd) {
    throw new Error('Tên alias hoặc lệnh không hợp lệ');
  }

  if (!isWin) {
    const bashrc = path.join(home, '.bashrc');
    const entry = `\nalias ${cleanName}='${cleanCmd.replace(/'/g, "'\\''")}' # ZenPanel Alias\n`;
    await appendFile(bashrc, entry, 'utf8');
    return { ok: true, file: '~/.bashrc' };
  } else {
    const psProfile = path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
    const entry = `\nSet-Alias -Name "${cleanName}" -Value "${cleanCmd}" # ZenPanel Alias\n`;
    await appendFile(psProfile, entry, 'utf8');
    return { ok: true, file: 'PowerShell Profile' };
  }
}
