import { db } from './db';
import type { Book, Progress, WebConfig, DictionaryEntry, Translation, Note } from './db';
import type { ExportData } from './dbExport';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Convert base64 string back to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Validate exported data structure
 */
export function validateExportData(data: any): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  // Check top-level structure
  if (!data || typeof data !== 'object') {
    errors.push({ field: 'root', message: 'Invalid file format: not a valid JSON object' });
    return { valid: false, errors };
  }

  if (!data.version || typeof data.version !== 'string') {
    errors.push({ field: 'version', message: 'Missing or invalid version field' });
  }

  if (!data.exportDate || typeof data.exportDate !== 'string') {
    errors.push({ field: 'exportDate', message: 'Missing or invalid exportDate field' });
  }

  if (typeof data.schemaVersion !== 'number') {
    errors.push({ field: 'schemaVersion', message: 'Missing or invalid schemaVersion field' });
  }

  if (!data.data || typeof data.data !== 'object') {
    errors.push({ field: 'data', message: 'Missing or invalid data object' });
    return { valid: false, errors };
  }

  const { books, progress, settings, dictionary, translations, notes } = data.data;

  // Validate books array
  if (!Array.isArray(books)) {
    errors.push({ field: 'data.books', message: 'Books must be an array' });
  } else {
    books.forEach((book: any, index: number) => {
      if (!book.id || typeof book.id !== 'string') {
        errors.push({ field: `data.books[${index}].id`, message: 'Missing or invalid book id' });
      }
      if (!book.title || typeof book.title !== 'string') {
        errors.push({ field: `data.books[${index}].title`, message: 'Missing or invalid book title' });
      }
      if (!book.data || typeof book.data !== 'string') {
        errors.push({ field: `data.books[${index}].data`, message: 'Missing or invalid book data (should be base64 string)' });
      } else {
        // Try to decode base64 to verify it's valid
        try {
          atob(book.data);
        } catch (e) {
          errors.push({ field: `data.books[${index}].data`, message: 'Invalid base64 encoding in book data' });
        }
      }
      if (typeof book.addedAt !== 'number') {
        errors.push({ field: `data.books[${index}].addedAt`, message: 'Missing or invalid addedAt timestamp' });
      }
    });
  }

  // Validate progress array
  if (!Array.isArray(progress)) {
    errors.push({ field: 'data.progress', message: 'Progress must be an array' });
  } else {
    progress.forEach((prog: any, index: number) => {
      if (!prog.bookId || typeof prog.bookId !== 'string') {
        errors.push({ field: `data.progress[${index}].bookId`, message: 'Missing or invalid bookId' });
      }
      if (typeof prog.scrollPosition !== 'number') {
        errors.push({ field: `data.progress[${index}].scrollPosition`, message: 'Missing or invalid scrollPosition' });
      }
      if (typeof prog.updatedAt !== 'number') {
        errors.push({ field: `data.progress[${index}].updatedAt`, message: 'Missing or invalid updatedAt timestamp' });
      }
    });
  }

  // Validate settings array
  if (!Array.isArray(settings)) {
    errors.push({ field: 'data.settings', message: 'Settings must be an array' });
  } else {
    settings.forEach((setting: any, index: number) => {
      if (!setting.key || typeof setting.key !== 'string') {
        errors.push({ field: `data.settings[${index}].key`, message: 'Missing or invalid setting key' });
      }
      if (typeof setting.value !== 'string') {
        errors.push({ field: `data.settings[${index}].value`, message: 'Missing or invalid setting value' });
      }
    });
  }

  // Validate dictionary array
  if (!Array.isArray(dictionary)) {
    errors.push({ field: 'data.dictionary', message: 'Dictionary must be an array' });
  } else {
    dictionary.forEach((entry: any, index: number) => {
      if (!entry.kanji || typeof entry.kanji !== 'string') {
        errors.push({ field: `data.dictionary[${index}].kanji`, message: 'Missing or invalid kanji' });
      }
      if (!entry.reading || typeof entry.reading !== 'string') {
        errors.push({ field: `data.dictionary[${index}].reading`, message: 'Missing or invalid reading' });
      }
      if (!Array.isArray(entry.definitions)) {
        errors.push({ field: `data.dictionary[${index}].definitions`, message: 'Missing or invalid definitions array' });
      }
      if (!Array.isArray(entry.tags)) {
        errors.push({ field: `data.dictionary[${index}].tags`, message: 'Missing or invalid tags array' });
      }
    });
  }

  // Validate translations array
  if (!Array.isArray(translations)) {
    errors.push({ field: 'data.translations', message: 'Translations must be an array' });
  } else {
    translations.forEach((trans: any, index: number) => {
      if (!trans.id || typeof trans.id !== 'string') {
        errors.push({ field: `data.translations[${index}].id`, message: 'Missing or invalid translation id' });
      }
      if (!trans.bookId || typeof trans.bookId !== 'string') {
        errors.push({ field: `data.translations[${index}].bookId`, message: 'Missing or invalid bookId' });
      }
      if (!trans.paragraphHash || typeof trans.paragraphHash !== 'string') {
        errors.push({ field: `data.translations[${index}].paragraphHash`, message: 'Missing or invalid paragraphHash' });
      }
      if (typeof trans.originalText !== 'string') {
        errors.push({ field: `data.translations[${index}].originalText`, message: 'Missing or invalid originalText' });
      }
      if (typeof trans.translatedText !== 'string') {
        errors.push({ field: `data.translations[${index}].translatedText`, message: 'Missing or invalid translatedText' });
      }
      if (typeof trans.createdAt !== 'number') {
        errors.push({ field: `data.translations[${index}].createdAt`, message: 'Missing or invalid createdAt timestamp' });
      }
    });
  }

  // Validate notes array
  if (!Array.isArray(notes)) {
    errors.push({ field: 'data.notes', message: 'Notes must be an array' });
  } else {
    notes.forEach((note: any, index: number) => {
      if (!note.id || typeof note.id !== 'string') {
        errors.push({ field: `data.notes[${index}].id`, message: 'Missing or invalid note id' });
      }
      if (!note.bookId || typeof note.bookId !== 'string') {
        errors.push({ field: `data.notes[${index}].bookId`, message: 'Missing or invalid bookId' });
      }
      if (!note.paragraphHash || typeof note.paragraphHash !== 'string') {
        errors.push({ field: `data.notes[${index}].paragraphHash`, message: 'Missing or invalid paragraphHash' });
      }
      if (typeof note.content !== 'string') {
        errors.push({ field: `data.notes[${index}].content`, message: 'Missing or invalid content' });
      }
      if (typeof note.createdAt !== 'number') {
        errors.push({ field: `data.notes[${index}].createdAt`, message: 'Missing or invalid createdAt timestamp' });
      }
      if (typeof note.updatedAt !== 'number') {
        errors.push({ field: `data.notes[${index}].updatedAt`, message: 'Missing or invalid updatedAt timestamp' });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Import database data with overwrite mode
 * Clears all existing data and imports new data
 */
export async function importDatabaseOverwrite(exportData: ExportData): Promise<void> {
  try {
    // Clear all tables
    await Promise.all([
      db.books.clear(),
      db.progress.clear(),
      db.settings.clear(),
      db.dictionary.clear(),
      db.translations.clear(),
      db.notes.clear(),
    ]);

    // Convert base64 book data back to ArrayBuffer
    const books: Book[] = exportData.data.books.map(book => ({
      ...book,
      data: base64ToArrayBuffer(book.data),
    }));

    // Import all data
    await Promise.all([
      db.books.bulkAdd(books),
      db.progress.bulkAdd(exportData.data.progress),
      db.settings.bulkAdd(exportData.data.settings),
      db.dictionary.bulkAdd(exportData.data.dictionary),
      db.translations.bulkAdd(exportData.data.translations),
      db.notes.bulkAdd(exportData.data.notes),
    ]);
  } catch (error) {
    console.error('Import overwrite failed:', error);
    throw new Error('Failed to import database: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Import database data with merge mode
 * Merges new data with existing data, with newer data taking precedence
 */
export async function importDatabaseMerge(exportData: ExportData): Promise<void> {
  try {
    // Convert base64 book data back to ArrayBuffer
    const books: Book[] = exportData.data.books.map(book => ({
      ...book,
      data: base64ToArrayBuffer(book.data),
    }));

    // Merge books: add new ones, update existing ones (always update if exists)
    for (const book of books) {
      const existing = await db.books.get(book.id);
      if (existing) {
        // Always update existing book in merge mode
        await db.books.put(book);
      } else {
        // Add new book
        await db.books.add(book);
      }
    }

    // Merge progress: update if newer timestamp
    for (const prog of exportData.data.progress) {
      const existing = await db.progress.get(prog.bookId);
      if (!existing || prog.updatedAt > existing.updatedAt) {
        await db.progress.put(prog);
      }
    }

    // Merge settings: add/update, but don't overwrite API key if it exists
    for (const setting of exportData.data.settings) {
      // Skip API key in merge mode (preserve existing)
      if (setting.key === 'openai_api_key') {
        continue;
      }
      await db.settings.put(setting);
    }

    // Merge dictionary: add new entries (by id if exists, or by content)
    for (const entry of exportData.data.dictionary) {
      if (entry.id) {
        await db.dictionary.put(entry);
      } else {
        // Add new entry without id
        await db.dictionary.add(entry);
      }
    }

    // Merge translations: replace by ID (new version always wins in merge mode)
    for (const trans of exportData.data.translations) {
      await db.translations.put(trans);
    }

    // Merge notes: replace by ID (new version always wins in merge mode)
    for (const note of exportData.data.notes) {
      await db.notes.put(note);
    }
  } catch (error) {
    console.error('Import merge failed:', error);
    throw new Error('Failed to import database: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Parse and validate JSON file
 */
export async function parseImportFile(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        resolve(data as ExportData);
      } catch (error) {
        reject(new Error('Invalid JSON file: ' + (error instanceof Error ? error.message : 'Unknown error')));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

