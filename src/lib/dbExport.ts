import { db } from './db';
import type { Book, Progress, WebConfig, DictionaryEntry, Translation, Note } from './db';

export interface ExportData {
  version: string;
  exportDate: string;
  schemaVersion: number;
  data: {
    books: Array<Omit<Book, 'data'> & { data: string }>; // ArrayBuffer converted to base64
    progress: Progress[];
    settings: WebConfig[];
    dictionary: DictionaryEntry[];
    translations: Translation[];
    notes: Note[];
  };
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Export all database data to JSON format
 * Excludes API key from settings for security
 */
export async function exportDatabase(): Promise<string> {
  try {
    // Fetch all data from all tables
    const [books, progress, settings, dictionary, translations, notes] = await Promise.all([
      db.books.toArray(),
      db.progress.toArray(),
      db.settings.toArray(),
      db.dictionary.toArray(),
      db.translations.toArray(),
      db.notes.toArray(),
    ]);

    // Convert book ArrayBuffers to base64 strings
    const booksWithBase64 = books.map(book => ({
      ...book,
      data: arrayBufferToBase64(book.data),
    }));

    // Filter out API key from settings
    const settingsWithoutApiKey = settings.filter(setting => setting.key !== 'openai_api_key');

    // Create export object
    const exportData: ExportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      schemaVersion: 5, // Current schema version
      data: {
        books: booksWithBase64,
        progress,
        settings: settingsWithoutApiKey,
        dictionary,
        translations,
        notes,
      },
    };

    // Convert to JSON string
    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error('Export failed:', error);
    throw new Error('Failed to export database: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Trigger download of exported database
 */
export function downloadExport(jsonString: string, filename?: string): void {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `ensoread-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

