/**
 * Translation service supporting multiple engines
 */

export type TranslationEngine = 'openai' | 'google' | 'bergamot';

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

// Bergamot translator instance cache (in-memory)
// Map of language pair keys to translator instances
const bergamotTranslators = new Map<string, any>();

// Cache for available language pairs
let availableLanguagePairsCache: Map<string, string[]> | null = null;

/**
 * Fetch available language pairs from the Mozilla registry
 */
export async function getAvailableBergamotLanguagePairs(): Promise<Map<string, string[]>> {
  if (availableLanguagePairsCache) {
    return availableLanguagePairsCache;
  }

  try {
    const response = await fetch('https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json');
    const data = await response.json();
    
    const pairs = new Map<string, string[]>();
    
    // Parse the registry format: { "models": { "ja-en": [...], "en-ja": [...] } }
    for (const [pairKey, models] of Object.entries(data.models || {})) {
      const [source, target] = pairKey.split('-');
      if (source && target && Array.isArray(models) && models.length > 0) {
        // Store both directions if available
        if (!pairs.has(source)) {
          pairs.set(source, []);
        }
        pairs.get(source)!.push(target);
      }
    }
    
    availableLanguagePairsCache = pairs;
    return pairs;
  } catch (error) {
    console.error('Failed to fetch Bergamot language pairs:', error);
    return new Map();
  }
}

/**
 * Check if a language pair is available in the Bergamot registry (direct only)
 */
export async function isBergamotLanguagePairAvailable(sourceLang: string, targetLang: string): Promise<boolean> {
  const pairs = await getAvailableBergamotLanguagePairs();
  return pairs.get(sourceLang)?.includes(targetLang) || false;
}

/**
 * Translation pair information for UI display
 */
export interface TranslationPairInfo {
  available: boolean;
  isDirect: boolean;
  isPivot: boolean;
  pivotPath?: string; // e.g., "de → en → ja"
  modelCount: number; // 1 for direct, 2 for pivot
}

/**
 * Get detailed translation pair info including pivot support
 * @param source Source language code
 * @param target Target language code
 * @returns Information about the translation pair
 */
export async function getTranslationPairInfo(source: string, target: string): Promise<TranslationPairInfo> {
  const pairs = await getAvailableBergamotLanguagePairs();
  
  // Same language - no translation needed
  if (source === target) {
    return {
      available: false,
      isDirect: false,
      isPivot: false,
      modelCount: 0,
    };
  }
  
  // Check for direct translation
  const hasDirectPath = pairs.get(source)?.includes(target) || false;
  if (hasDirectPath) {
    return {
      available: true,
      isDirect: true,
      isPivot: false,
      modelCount: 1,
    };
  }
  
  // Check for pivot through English
  const pivotLang = 'en';
  
  // If source or target is English, no pivot possible (would need direct)
  if (source === pivotLang || target === pivotLang) {
    return {
      available: false,
      isDirect: false,
      isPivot: false,
      modelCount: 0,
    };
  }
  
  // Check if source→en and en→target both exist
  const hasSourceToEn = pairs.get(source)?.includes(pivotLang) || false;
  const hasEnToTarget = pairs.get(pivotLang)?.includes(target) || false;
  
  if (hasSourceToEn && hasEnToTarget) {
    return {
      available: true,
      isDirect: false,
      isPivot: true,
      pivotPath: `${source} → ${pivotLang} → ${target}`,
      modelCount: 2,
    };
  }
  
  // No translation path available
  return {
    available: false,
    isDirect: false,
    isPivot: false,
    modelCount: 0,
  };
}

/**
 * Get all possible language pairs (both direct and pivot through English)
 * @returns Object with direct and pivot pairs
 */
export async function getAllBergamotLanguagePairs(): Promise<{
  direct: Map<string, string[]>;
  pivot: Map<string, string[]>;
}> {
  const directPairs = await getAvailableBergamotLanguagePairs();
  const pivotPairs = new Map<string, string[]>();
  
  const pivotLang = 'en';
  
  // Get all languages that can translate to/from English
  const toEnglish = new Set<string>();
  const fromEnglish = new Set<string>();
  
  for (const [source, targets] of directPairs.entries()) {
    if (targets.includes(pivotLang)) {
      toEnglish.add(source);
    }
    if (source === pivotLang) {
      for (const target of targets) {
        fromEnglish.add(target);
      }
    }
  }
  
  // Calculate all pivot pairs (source→en→target where source≠en and target≠en)
  for (const source of toEnglish) {
    if (source === pivotLang) continue;
    
    const pivotTargets: string[] = [];
    for (const target of fromEnglish) {
      if (target === pivotLang) continue;
      if (source === target) continue;
      
      // Only add as pivot if there's no direct path
      const hasDirectPath = directPairs.get(source)?.includes(target) || false;
      if (!hasDirectPath) {
        pivotTargets.push(target);
      }
    }
    
    if (pivotTargets.length > 0) {
      pivotPairs.set(source, pivotTargets);
    }
  }
  
  return {
    direct: directPairs,
    pivot: pivotPairs,
  };
}

/**
 * Get or create a Bergamot translator instance for a language pair
 * Models are automatically downloaded when translate() is called
 */
async function getBergamotTranslator(
  sourceLang: string,
  targetLang: string,
  onProgress?: (progress: number) => void
): Promise<any> {
  const modelKey = `${sourceLang}-${targetLang}`;
  
  // If we already have a translator for this language pair, return it
  if (bergamotTranslators.has(modelKey)) {
    return bergamotTranslators.get(modelKey);
  }

  try {
    // Import LatencyOptimisedTranslator and TranslatorBacking
    const { LatencyOptimisedTranslator, TranslatorBacking } = await import('@browsermt/bergamot-translator/translator.js');
    
    // Create a custom backing that uses our worker URL and new registry format
    // We extend TranslatorBacking to inherit all model loading functionality
    class CustomBacking extends TranslatorBacking {
      private baseUrl: string = '';

      constructor(options: any) {
        // Use the new Mozilla registry URL and ensure pivot through English is enabled
        const mergedOptions = {
          ...options,
          registryUrl: options.registryUrl || 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json',
          pivotLanguage: options.pivotLanguage ?? 'en', // Enable pivot translation through English
        };
        // Call parent constructor to initialize registry, buffers, etc.
        super(mergedOptions);
      }

      // Override loadModelRegistery to parse the new registry format
      async loadModelRegistery(): Promise<any[]> {
        const response = await fetch(this.registryUrl, { credentials: 'omit' });
        const data = await response.json();
        
        // Store baseUrl for model file loading
        this.baseUrl = data.baseUrl || 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data';
        
        // Parse the new format: { "models": { "ja-en": [{ files: {...} }] } }
        const registry: any[] = [];
        
        for (const [pairKey, models] of Object.entries(data.models || {})) {
          if (!Array.isArray(models) || models.length === 0) continue;
          
          // Get the first model (prefer Release status, otherwise first available)
          // releaseStatus can be "Release", "Release Desktop", "Nightly", etc.
          let model = models.find((m: any) => m.releaseStatus?.includes('Release')) || models[0];
          
          if (!model.files) continue;
          
          const [from, to] = pairKey.split('-');
          if (!from || !to) continue;
          
          // Convert to the format expected by TranslatorBacking
          const files: any = {
            model: {
              name: `${this.baseUrl}/${model.files.model.path}`,
              expectedSha256Hash: model.files.model.uncompressedHash,
            },
          };
          
          // Handle vocab - can be single vocab or separate srcVocab/trgVocab
          if (model.files.vocab) {
            files.vocab = {
              name: `${this.baseUrl}/${model.files.vocab.path}`,
            };
          } else if (model.files.srcVocab && model.files.trgVocab) {
            files.srcvocab = {
              name: `${this.baseUrl}/${model.files.srcVocab.path}`,
            };
            files.trgvocab = {
              name: `${this.baseUrl}/${model.files.trgVocab.path}`,
            };
          }
          
          // Handle lexical shortlist (called 'lex' in parent class)
          if (model.files.lexicalShortlist) {
            files.lex = {
              name: `${this.baseUrl}/${model.files.lexicalShortlist.path}`,
            };
          }
          
          registry.push({
            from,
            to,
            files
          });
        }
        
        return registry;
      }

      // Override fetch to handle CORS, gzip decompression, and integrity checks for Google Cloud Storage
      async fetch(url: string, checksum?: string, extra?: any): Promise<ArrayBuffer> {
        // Rig up a timeout cancel signal for our fetch
        const controller = new AbortController();
        const abort = () => controller.abort();

        const downloadTimeout = (this as any).downloadTimeout || 120000; // 2 minutes for large files
        const timeout = downloadTimeout ? setTimeout(abort, downloadTimeout) : null;

        try {
          // Also maintain the original abort signal
          if (extra?.signal) {
            extra.signal.addEventListener('abort', abort);
          }

          // For Google Cloud Storage, skip integrity check as it may not be supported
          const options: RequestInit = {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            signal: controller.signal,
          };

          try {
            console.log(`Fetching Bergamot model file: ${url}`);
            const response = await fetch(url, options);
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
            }

            // Get the raw data
            let arrayBuffer = await response.arrayBuffer();
            console.log(`Downloaded ${url}, compressed size: ${arrayBuffer.byteLength} bytes`);
            
            // Check if the file is gzipped (by URL or by checking magic bytes)
            const isGzipped = url.endsWith('.gz') || this.isGzipData(arrayBuffer);
            
            if (isGzipped) {
              console.log(`Decompressing gzipped file: ${url}`);
              arrayBuffer = await this.decompressGzip(arrayBuffer);
              console.log(`Decompressed size: ${arrayBuffer.byteLength} bytes`);
            }
            
            return arrayBuffer;
          } catch (fetchError: any) {
            console.error(`Failed to fetch ${url}:`, fetchError);
            if (fetchError.message?.includes('CORS') || fetchError.message?.includes('Failed to fetch')) {
              throw new Error(`CORS or network error fetching ${url}. The file may not be accessible from this origin.`);
            }
            throw new Error(`Could not fetch ${url}: ${fetchError.message || 'Unknown error'}`);
          }
        } finally {
          if (timeout) {
            clearTimeout(timeout);
          }
          if (extra?.signal) {
            extra.signal.removeEventListener('abort', abort);
          }
        }
      }

      // Check if data is gzip compressed by looking at magic bytes
      isGzipData(data: ArrayBuffer): boolean {
        const bytes = new Uint8Array(data);
        // Gzip magic bytes: 0x1f 0x8b
        return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      }

      // Decompress gzip data using the browser's DecompressionStream API
      async decompressGzip(compressedData: ArrayBuffer): Promise<ArrayBuffer> {
        // Check if DecompressionStream is available (modern browsers)
        if (typeof DecompressionStream !== 'undefined') {
          try {
            const stream = new Response(compressedData).body!
              .pipeThrough(new DecompressionStream('gzip'));
            const decompressedResponse = new Response(stream);
            return await decompressedResponse.arrayBuffer();
          } catch (e) {
            console.warn('DecompressionStream failed, falling back to manual decompression:', e);
          }
        }

        // Fallback: Use pako if available, or throw error
        // Since we can't easily add pako, we'll use a simple inflate implementation
        // or rely on the browser's built-in gzip support
        
        // Try using fetch with blob URL as a workaround
        try {
          const blob = new Blob([compressedData], { type: 'application/gzip' });
          const response = await fetch(URL.createObjectURL(blob));
          // This might not decompress, but let's try
          const result = await response.arrayBuffer();
          
          // If the result is still gzipped, we need to decompress it manually
          if (this.isGzipData(result)) {
            throw new Error('Browser does not support automatic gzip decompression');
          }
          return result;
        } catch (e) {
          // Final fallback: return original data and hope the worker handles it
          console.error('Failed to decompress gzip data:', e);
          throw new Error('Gzip decompression not supported. Please use a modern browser (Chrome 80+, Firefox 113+, Safari 16.4+).');
        }
      }

      async loadWorker() {
        // Use absolute URL for the worker file in public directory
        const workerUrl = new URL('/bergamot-worker/translator-worker.js', window.location.origin);
        console.log('Loading Bergamot worker from:', workerUrl.href);
        
        const worker = new Worker(workerUrl);
        
        // Verify worker is loading
        worker.addEventListener('error', (event: ErrorEvent) => {
          console.error('Worker failed to load:', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          });
        }, { once: true });

        let serial = 0;
        const pending = new Map<number, { accept: (value: any) => void; reject: (error: Error) => void; callsite?: any }>();

        const call = (name: string, ...args: any[]) => {
          return new Promise((accept, reject) => {
            const id = ++serial;
            pending.set(id, {
              accept,
              reject,
              callsite: {
                message: `${name}(${args.map(arg => String(arg)).join(', ')})`,
                stack: new Error().stack
              }
            });
            worker.postMessage({ id, name, args });
          });
        };

        worker.addEventListener('message', (event: MessageEvent) => {
          const { id, result, error } = event.data;
          if (!pending.has(id)) {
            console.debug('Received message with unknown id:', event.data);
            return;
          }

          const { accept, reject, callsite } = pending.get(id)!;
          pending.delete(id);

          if (error !== undefined) {
            const err = Object.assign(new Error(), error, {
              message: error.message + ` (response to ${callsite?.message || 'unknown'})`,
              stack: error.stack ? `${error.stack}\n${callsite?.stack || ''}` : callsite?.stack
            });
            reject(err);
          } else {
            accept(result);
          }
        });

        worker.addEventListener('error', (event: ErrorEvent) => {
          console.error('Worker error event:', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error,
          });
          (this as any).onerror(new Error(event.message || 'Worker error'));
        });

        // Also listen for unhandled errors in the worker
        worker.addEventListener('messageerror', (event: MessageEvent) => {
          console.error('Worker message error:', event);
        });

        // Initialize the worker with options (same as parent class)
        try {
          await call('initialize', (this as any).options);
        } catch (initError: any) {
          console.error('Worker initialization failed:', initError);
          // If initialization fails, the WASM might not have loaded
          // This could be due to CORS, missing files, or WASM loading issues
          throw new Error(`Failed to initialize Bergamot worker: ${initError.message || 'Unknown error'}. Make sure the worker files (translator-worker.js, bergamot-translator-worker.wasm) are accessible at /bergamot-worker/.`);
        }

        // Return worker and proxy for method calls
        return {
          worker,
          exports: new Proxy({} as any, {
            get: (_target, name: string | symbol) => {
              // Prevent this object from being marked "then-able"
              if (name === 'then') {
                return undefined;
              }
              return (...args: any[]) => call(name as string, ...args);
            }
          })
        };
      }
    }
    
    // Create translator instance with custom backing
    const backing = new CustomBacking({});
    const translator = new LatencyOptimisedTranslator({}, backing);
    
    // Store in cache
    bergamotTranslators.set(modelKey, translator);
    
    return translator;
  } catch (error) {
    console.error('Failed to create Bergamot translator:', error);
    throw new Error(`Failed to create Bergamot translator for ${sourceLang}-${targetLang}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Load Bergamot model for a language pair
 * This pre-loads the model by attempting a dummy translation
 * The model files are downloaded and cached by the browser automatically
 */
export async function loadBergamotModel(
  sourceLang: string,
  targetLang: string,
  onProgress?: (progress: number) => void
): Promise<any> {
  const modelKey = `${sourceLang}-${targetLang}`;
  
  // If already loaded, return existing translator
  if (bergamotTranslators.has(modelKey)) {
    return bergamotTranslators.get(modelKey);
  }

  try {
    const translator = await getBergamotTranslator(sourceLang, targetLang, onProgress);
    
    // Trigger model download by attempting a dummy translation
    // This will download the model files if not already cached
    // The package handles caching automatically via the browser's cache
    try {
      const result = await translator.translate({
        from: sourceLang,
        to: targetLang,
        text: 'test',
        html: false,
      });
      
      // If translation succeeds, model is loaded
      // Store a flag that model is ready
      console.log('Bergamot model loaded successfully for', modelKey);
    } catch (e) {
      // If translation fails, the model might not be available for this language pair
      console.error('Failed to load Bergamot model - translation test failed:', e);
      throw new Error(`Bergamot model for ${sourceLang}-${targetLang} is not available or failed to load: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    
    return translator;
  } catch (error) {
    console.error('Failed to load Bergamot model:', error);
    // Remove from cache if loading failed
    bergamotTranslators.delete(modelKey);
    throw new Error(`Failed to load Bergamot model for ${sourceLang}-${targetLang}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Translate text using Bergamot Translator
 */
export async function translateWithBergamot(
  text: string,
  sourceLanguage: string = 'ja',
  targetLanguage: string = 'en'
): Promise<string | null> {
  try {
    const translator = await getBergamotTranslator(sourceLanguage, targetLanguage);
    
    // Translate using the translator
    const result = await translator.translate({
      from: sourceLanguage,
      to: targetLanguage,
      text,
      html: false,
    });
    
    return result?.target?.text || null;
  } catch (error) {
    console.error('Bergamot translation error:', error);
    throw new Error(`Bergamot translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if Bergamot model is loaded for a language pair
 */
export async function isBergamotModelLoaded(sourceLang: string, targetLang: string): Promise<boolean> {
  const modelKey = `${sourceLang}-${targetLang}`;
  return bergamotTranslators.has(modelKey);
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
  } else if (engine === 'bergamot') {
    return await translateWithBergamot(text, sourceLanguage, targetLanguage);
  }
  throw new Error(`Unknown translation engine: ${engine}`);
}

