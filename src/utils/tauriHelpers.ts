import { invoke } from '@tauri-apps/api/tauri';
import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';

export async function exportDatabase(): Promise<void> {
  const dbPath = await invoke<string>('get_db_path');
  const destination = await save({
    defaultPath: 'proof_of_presence_backup.db',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
  });
  if (destination) {
    await invoke('export_database', { dbPath, destination });
  }
}

export async function computeFileHash(path: string): Promise<string> {
  return invoke('compute_file_hash', { path });
}

export async function downloadReport(filename: string, content: string): Promise<void> {
  const path = await save({
    defaultPath: filename,
    filters: [{ name: 'Text File', extensions: ['txt'] }],
  });
  if (path) {
    await writeTextFile(path, content);
  }
}
