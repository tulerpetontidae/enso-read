/**
 * Translation service supporting multiple engines
 */

export type TranslationEngine = 'openai' | 'google';

// Chrome Translator API types
interface TranslatorAPI {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<'available' | 'downloadable' | 'unavailable'>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorInstance>;
}

interface TranslatorInstance {
  translate(text: string): Promise<string>;
}

declare global {
  interface WindowOrWorkerGlobalScope {
    Translator?: TranslatorAPI;
  }
}

export interface TranslationResult {
  translation: string;
  engine: TranslationEngine;
}

/**
 * Translate text using Google Translate (Chrome Translator API)
 */
export async function translateWithGoogle(
  text: string,
  sourceLanguage: string = 'ja',
  targetLanguage: string = 'en'
): Promise<string | null> {
  if (typeof self === 'undefined') {
    return null;
  }

  if (!('Translator' in self)) {
    return null;
  }

  try {
    const Translator = (self as unknown as WindowOrWorkerGlobalScope).Translator;
    
    if (!Translator) {
      return null;
    }

    // Check if availability method exists
    if (typeof Translator.availability !== 'function') {
      console.error('Translator.availability is not a function');
      return null;
    }

    const availability = await Translator.availability({
      sourceLanguage,
      targetLanguage,
    });

    if (availability === 'unavailable') {
      return null;
    }

    // Create a translator instance
    if (typeof Translator.create !== 'function') {
      console.error('Translator.create is not a function');
      return null;
    }

    const translator = await Translator.create({
      sourceLanguage,
      targetLanguage,
    });

    // Translate the text using the instance
    const result = await translator.translate(text);

    return result || null;
  } catch (error) {
    console.error('Google Translate error:', error);
    return null;
  }
}

/**
 * Translate text using OpenAI API
 */
export async function translateWithOpenAI(
  text: string,
  apiKey: string,
  sourceLanguage: string = 'ja',
  targetLanguage: string = 'en'
): Promise<string> {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      apiKey,
      engine: 'openai',
      sourceLanguage,
      targetLanguage,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Translation failed');
  }

  const data = await response.json();
  return data.translation;
}

/**
 * Translate text using the specified engine
 */
export async function translate(
  text: string,
  engine: TranslationEngine,
  apiKey?: string,
  sourceLanguage: string = 'ja',
  targetLanguage: string = 'en'
): Promise<string | null> {
  if (engine === 'google') {
    return await translateWithGoogle(text, sourceLanguage, targetLanguage);
  } else if (engine === 'openai') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    return await translateWithOpenAI(text, apiKey, sourceLanguage, targetLanguage);
  }
  throw new Error(`Unknown translation engine: ${engine}`);
}

