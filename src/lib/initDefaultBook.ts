/**
 * Initialize default book (Genji) on first load
 */

import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import ePub from 'epubjs';

// Simple hash function for paragraph text (same as in TranslatableParagraph)
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}


export async function initializeDefaultBook(): Promise<void> {
  try {
    // Don't initialize if user is logged in - cloud sync will handle books
    try {
      // Access currentUser value safely (it's an Observable/BehaviorSubject)
      const currentUser = (db.cloud?.currentUser as any);
      const user = currentUser?.value || currentUser;
      if (user?.isLoggedIn) {
        return;
      }
    } catch (e) {
      // If currentUser is not available, continue with initialization
    }
    
    // Check if we've already initialized (check this first to avoid unnecessary book queries)
    const initFlag = await db.settings.get('default_book_initialized');
    if (initFlag?.value === 'true') {
      return; // Already initialized
    }
    
    // Add a small delay to avoid race conditions with restore operations
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Check if database already has books (check again after delay)
    const existingBooks = await db.books.toArray();
    if (existingBooks.length > 0) {
      // Mark as initialized if books exist (even if flag wasn't set)
      await db.settings.put({ key: 'default_book_initialized', value: 'true' });
      return; // Already has books
    }
    
    // Double-check init flag after delay (in case it was set during the delay)
    const initFlagAfterDelay = await db.settings.get('default_book_initialized');
    if (initFlagAfterDelay?.value === 'true') {
      return; // Was initialized during the delay
    }

    // Load the Genji EPUB file
    const response = await fetch('/genji_kiritsubo.epub');
    if (!response.ok) {
      console.warn('Could not load default book file');
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    
    // Extract cover image
    let coverImage: string | undefined;
    try {
      // @ts-ignore
      const book = ePub(arrayBuffer);
      await book.ready;
      
      // @ts-ignore
      const coverUrl = await book.coverUrl();
      if (coverUrl) {
        const coverResponse = await fetch(coverUrl);
        const blob = await coverResponse.blob();
        coverImage = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
      book.destroy();
    } catch (e) {
      console.warn('Cover extraction failed:', e);
    }

    // Create book entry
    const bookId = uuidv4();
    await db.books.add({
      id: bookId,
      title: '源氏物語 桐壺 (sample)',
      data: arrayBuffer,
      addedAt: Date.now(),
      coverImage,
      sourceLanguage: 'ja', // Japanese
    });

    // Find first proper paragraph and add translation/notes
    try {
      // @ts-ignore
      const book = ePub(arrayBuffer);
      await book.ready;

      let firstParagraph: string | null = null;

      // Search through sections to find first proper paragraph
      // @ts-ignore
      const maxSections = Math.min(10, book.spine.length);
      
      for (let i = 0; i < maxSections; i++) {
        try {
          // @ts-ignore
          const section = book.spine.get(i);
          if (!section) continue;
          
          await section.load(book.load.bind(book));
          const content = section.document;
          
          if (content) {
            // Get all paragraphs from the document
            const paragraphs = content.querySelectorAll('p');
            for (const p of paragraphs) {
              const text = p.textContent?.trim() || '';
              // Look for paragraphs with substantial Japanese text
              if (text.length > 50 && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
                firstParagraph = text;
                break;
              }
            }
          }
          section.unload();
          
          if (firstParagraph) break;
        } catch (e) {
          // Suppress replaceCss errors - they don't break text extraction
          continue;
        }
      }

      book.destroy();

      if (firstParagraph) {
        console.log('Found first paragraph:', firstParagraph.substring(0, 100) + '...');
        const paragraphHash = hashText(firstParagraph);
        const translationId = `${bookId}-${paragraphHash}`;
        const noteId = `${bookId}-${paragraphHash}`;

        // Add default translation
        const defaultTranslation = "In the reign of which Emperor it was I cannot say, but among the many ladies of the inner palace—those known as nyōgo and kōi—there was one who, though not of the very highest aristocratic birth, enjoyed an exceptionally deep imperial favor. The nyōgo who had entered court confident that they themselves were the ones, relying on the power of their parents and brothers, resented her as an impertinent woman. The kōi, of equal rank or lower, had all the more reason to let the flames of jealousy burn. Morning after morning, when she withdrew from the night watch quarters of His Majesty's residence, and night after night when she alone was summoned again, the others saw it with their own eyes and heard it with their own ears, and their mortified resentment took its toll: many a kōi, growing frail and anxious, would often retreat to her family home. And as that happened, the Emperor seemed ever more drawn to this one woman alone, unable to show the least restraint no matter what people might say. It had come to a state that might even leave a dark blot on the pages of history that record an emperor's sacred virtues. High officials and courtiers alike were at a loss; though they waited for him to come to his senses, his indulgence was such that they adopted an attitude of wanting, for the time being, to look the other way. In China, too, it was whispered that the appearance of such a favored consort—the Yang family woman—had brewed disorder. Now this woman was being deemed a trouble to the whole realm. Who could say when the post station of Mawei might be reenacted? Even amid an atmosphere so painful it seemed unbearable, she lived on, relying only on the depth of his love. Her father, a Dainagon, was already dead. Her widowed mother, a well-born woman of sound judgment, could serve as a good protector, ensuring her daughter did not fall behind the daughters of the powerful, glittering houses of the day. Even so, as a mere kōi without the backing of great ministers, she always seemed to feel helpless whenever anything arose.";

        await db.translations.put({
          id: translationId,
          bookId,
          paragraphHash,
          originalText: firstParagraph,
          translatedText: defaultTranslation,
          createdAt: Date.now(),
        });
        console.log('Translation saved:', translationId);

        // Add default notes (shortened)
        const defaultNotes = `• 大納言 (Dainagon) - Senior court rank, showing her family had some status but not the highest.`;

        await db.notes.put({
          id: noteId,
          bookId,
          paragraphHash,
          content: defaultNotes,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        console.log('Notes saved:', noteId);

        // Set initial progress to 4%
        await db.progress.put({
          bookId,
          scrollPosition: 4,
          updatedAt: Date.now(),
        });
        console.log('Progress set to 4%');
      } else {
        console.warn('Could not find first paragraph in Genji book');
      }
    } catch (e) {
      console.warn('Failed to add default translation/notes:', e);
    }

    // Mark as initialized
    await db.settings.put({ key: 'default_book_initialized', value: 'true' });
  } catch (error) {
    console.error('Failed to initialize default book:', error);
  }
}

