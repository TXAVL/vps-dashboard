// ZenPanel - Nhật ký các lần AI gọi MCP (initialize, tools/list, tools/call...). Giữ tối đa MAX bản ghi mới nhất.
import { randomBytes } from 'node:crypto';
import { readJson, writeJson } from './store.js';

const FILE = 'mcp-log.json';
const MAX = 500;

export interface McpLogEntry {
  id: string;
  at: string;
  token: string;
  ip: string;
  /** User-Agent của client (Claude Code, Cursor, Zed...) */
  client: string;
  method: string;
  tool: string | null;
  args: string | null;
  ok: boolean;
  error: string | null;
  ms: number;
}

let cache: McpLogEntry[] | null = null;
let timer: NodeJS.Timeout | null = null;

function load(): McpLogEntry[] {
  cache ??= readJson<McpLogEntry[]>(FILE, []);
  return cache;
}

export function addMcpLog(entry: Omit<McpLogEntry, 'id' | 'at'>): void {
  const list = load();
  list.unshift({ id: randomBytes(4).toString('hex'), at: new Date().toISOString(), ...entry });
  if (list.length > MAX) list.length = MAX;
  // Gộp ghi đĩa để không ghi mỗi request
  timer ??= setTimeout(() => {
    timer = null;
    writeJson(FILE, load());
  }, 3000);
}

export function listMcpLogs(limit = 200): McpLogEntry[] {
  return load().slice(0, limit);
}

export function clearMcpLogs(): void {
  cache = [];
  writeJson(FILE, cache);
}
