import Dexie, { type EntityTable } from 'dexie';

interface Book {
  id: string; // UUID
  title: string;
  data: ArrayBuffer;
  addedAt: number;
  coverImage?: string; // Base64 data URL of cover image
  sourceLanguage?: string; // ISO 639-1 code (e.g., 'ja', 'en', 'ru')
}

interface WebConfig {
  key: string;
  value: string;
}

interface Progress {
  bookId: string;
  scrollPosition: number; // scroll percentage 0-100
  updatedAt: number;
}

interface DictionaryEntry {
  id?: number;
  kanji: string;
  reading: string;
  definitions: string[];
  tags: string[];
}

interface Translation {
  id: string; // bookId + paragraphHash
  bookId: string;
  paragraphHash: string; // hash of original text
  originalText: string;
  translatedText: string;
  createdAt: number;
}

interface Note {
  id: string; // bookId + paragraphHash
  bookId: string;
  paragraphHash: string;
  content: string;
  height?: number; // Height in pixels for resizable notes
  createdAt: number;
  updatedAt: number;
}

interface ChatMessage {
  id: string; // auto-generated UUID
  threadId: string; // bookId + '|' + paragraphHash
  bookId: string;
  paragraphHash: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

const db = new Dexie('EnsoReadDB') as Dexie & {
  books: EntityTable<Book, 'id'>;
  progress: EntityTable<Progress, 'bookId'>;
  settings: EntityTable<WebConfig, 'key'>;
  dictionary: EntityTable<DictionaryEntry, 'id'>;
  translations: EntityTable<Translation, 'id'>;
  notes: EntityTable<Note, 'id'>;
  chats: EntityTable<ChatMessage, 'id'>;
};

// Schema declaration
db.version(2).stores({
  books: 'id, title, addedAt',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags'
});

db.version(3).stores({
  books: 'id, title, addedAt',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags',
  translations: 'id, bookId, paragraphHash, createdAt'
});

db.version(4).stores({
  books: 'id, title, addedAt',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags',
  translations: 'id, bookId, paragraphHash, createdAt',
  notes: 'id, bookId, paragraphHash, updatedAt'
});

db.version(5).stores({
  books: 'id, title, addedAt',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags',
  translations: 'id, bookId, paragraphHash, createdAt',
  notes: 'id, bookId, paragraphHash, updatedAt'
}).upgrade(async (tx) => {
  // Migration: add sourceLanguage field to existing books (will be undefined, can be set later)
  // No data migration needed as it's an optional field
});

db.version(6).stores({
  books: 'id, title, addedAt, sourceLanguage',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags',
  translations: 'id, bookId, paragraphHash, createdAt',
  notes: 'id, bookId, paragraphHash, updatedAt',
  chats: 'id, threadId, bookId, paragraphHash, createdAt'
});

export type { Book, Progress, WebConfig, DictionaryEntry, Translation, Note, ChatMessage };
export { db };
