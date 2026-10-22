// ZenPanel - Dịch vụ Ghi chú Máy chủ (Server Notepad & Scratchpad)
import { readJson, writeJson } from '../core/store.js';

export interface ServerNotes {
  content: string;
  updatedAt: string;
}

const NOTES_FILE = 'server-notes.json';

export class ServerNotesService {
  get(): ServerNotes {
    return readJson<ServerNotes>(NOTES_FILE, {
      content: '',
      updatedAt: new Date().toISOString(),
    });
  }

  save(content: string): ServerNotes {
    const record: ServerNotes = {
      content: String(content ?? ''),
      updatedAt: new Date().toISOString(),
    };
    writeJson(NOTES_FILE, record);
    return record;
  }
}

export const serverNotesService = new ServerNotesService();
