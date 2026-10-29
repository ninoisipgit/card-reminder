/**
 * Backup files on the phone: save to a folder the user picks (Downloads,
 * Google Drive, …) and read one back. The data rules live in data/backup.ts.
 */
import { Directory, File } from 'expo-file-system';

import { exportBackup, parseBackup, summarize, type Backup, type BackupSummary } from '@/data/backup';
import { DataError, type Db } from '@/data/db';
import { updateSettings } from '@/data/settings';

import { todayIso } from './cycles';

function isCancel(e: unknown): boolean {
  return e instanceof Error && /cancel/i.test(e.message);
}

/** Asks for a folder, writes the backup there. Returns null if the user cancels. */
export async function saveBackupToFolder(db: Db): Promise<{ fileName: string; summary: BackupSummary } | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
  const backup = await exportBackup(db);
  const file = folder.createFile(`card-reminder-backup-${todayIso()}.json`, 'application/json');
  await file.write(JSON.stringify(backup, null, 2));
  await updateSettings(db, { lastBackupAt: backup.exportedAt });
  return { fileName: file.name, summary: summarize(backup) };
}

/** Asks for a backup file and checks it. Returns null if the user cancels. Nothing is changed yet. */
export async function pickBackupFile(): Promise<Backup | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', 'application/octet-stream'] });
  if (picked.canceled) return null;
  const text = await picked.result.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DataError('BAD_BACKUP', 'This isn’t a valid backup file (it isn’t JSON).');
  }
  return parseBackup(data);
}
