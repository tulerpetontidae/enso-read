/**
 * Language configuration and utilities
 */

import { franc } from 'franc';

export interface Language {
  code: string; // ISO 639-1 code
  nativeName: string;
  englishName: string;
}

// Supported languages in display order (starting with Japanese)
export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'fr', nativeName: 'Français', englishName: 'French' },
  { code: 'zh', nativeName: '中文', englishName: 'Chinese' },
];

// Map for quick lookup by code
export const LANGUAGE_MAP: Record<string, Language> = {};
SUPPORTED_LANGUAGES.forEach(lang => {
  LANGUAGE_MAP[lang.code] = lang;
});

// Find longest language name for fixed-width display
export function getLongestLanguageName(): string {
  return SUPPORTED_LANGUAGES.reduce((longest, lang) => 
    lang.nativeName.length > longest.length ? lang.nativeName : longest, 
    ''
  );
}

// Map franc ISO 639-3 codes to ISO 639-1 codes
const FRANC_TO_ISO_639_1: Record<string, string> = {
  'jpn': 'ja', // Japanese
  'rus': 'ru', // Russian
  'eng': 'en', // English
  'deu': 'de', // German
  'spa': 'es', // Spanish
  'fra': 'fr', // French
  'cmn': 'zh', // Chinese (Mandarin)
  'zho': 'zh', // Chinese (generic)
};

/**
 * Detect language from text using franc library
 * Returns ISO 639-1 code or 'unknown' if detection fails
 */
export function detectLanguage(text: string): string {
  if (!text || text.trim().length < 10) {
    return 'unknown';
  }

  try {
    // Sample first 1000 characters for faster detection
    const sample = text.substring(0, 1000);
    const detected = franc(sample);
    
    if (!detected || detected === 'und') {
      return 'unknown';
    }

    // Convert franc ISO 639-3 to ISO 639-1
    const iso6391 = FRANC_TO_ISO_639_1[detected];
    if (iso6391 && LANGUAGE_MAP[iso6391]) {
      return iso6391;
    }

    return 'unknown';
  } catch (error) {
    console.warn('Language detection failed:', error);
    return 'unknown';
  }
}

/**
 * Get language by code
 */
export function getLanguage(code: string): Language | undefined {
  return LANGUAGE_MAP[code];
}

/**
 * Get language display name (native name)
 */
export function getLanguageName(code: string): string {
  const lang = getLanguage(code);
  return lang ? lang.nativeName : code.toUpperCase();
}

/**
 * Get language code for display (uppercase)
 */
export function getLanguageCode(code: string): string {
  return code.toUpperCase();
}

