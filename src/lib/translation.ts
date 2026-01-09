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

// Map of language pair keys to active loaders (for cancellation)
const activeLoaders = new Map<string, { abortController: AbortController; onProgress?: (progress: number) => void }>();

// Cache for available language pairs
let availableLanguagePairsCache: Map<string, string[]> | null = null;

/**
 * Clear the cached language pairs (useful for retry after errors)
 */
export function clearBergamotLanguagePairsCache(): void {
  availableLanguagePairsCache = null;
}

/**
 * Fetch available language pairs from the Mozilla registry via API proxy
 * Uses Next.js API route to bypass CORS restrictions
 * @param retries Number of retry attempts (default: 3)
 * @returns Map of source language codes to arrays of target language codes
 */
export async function getAvailableBergamotLanguagePairs(retries: number = 3): Promise<Map<string, string[]>> {
  // Client-side check
  if (typeof window === 'undefined') {
    console.warn('getAvailableBergamotLanguagePairs called on server-side, returning empty map');
    return new Map();
  }

  // Return cached result if available
  if (availableLanguagePairsCache) {
    return availableLanguagePairsCache;
  }

  // Use API route to bypass CORS
  const apiUrl = '/api/bergamot/registry';
  
  let lastError: Error | null = null;
  
  // Retry logic with exponential backoff
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
        cache: 'default', // Allow browser caching
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Registry fetch failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid registry response: expected object');
      }

      if (!data.models || typeof data.models !== 'object') {
        throw new Error('Invalid registry format: missing or invalid "models" field');
      }

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
      
      if (pairs.size === 0) {
        throw new Error('Registry fetched but no valid language pairs found');
      }

      // Cache the result
      availableLanguagePairsCache = pairs;
      console.log(`Bergamot registry loaded: ${pairs.size} source languages with models`);
      return pairs;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Registry fetch timeout after 10 seconds');
        break;
      }
      
      // Don't retry on last attempt
      if (attempt < retries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
        console.warn(`Registry fetch attempt ${attempt + 1} failed, retrying in ${delay}ms...`, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`Failed to fetch Bergamot language pairs after ${retries} attempts:`, lastError);
      }
    }
  }

  // All retries failed
  console.error('Failed to fetch Bergamot registry:', lastError);
  return new Map();
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
 * @param sourceLang Source language code
 * @param targetLang Target language code
 * @param abortSignal Optional AbortSignal to cancel the operation
 * @param onProgress Optional progress callback (0-100)
 */
async function getBergamotTranslator(
  sourceLang: string,
  targetLang: string,
  abortSignal?: AbortSignal,
  onProgress?: (progress: number) => void
): Promise<any> {
  const modelKey = `${sourceLang}-${targetLang}`;
  
  // Check if cancelled before starting
  if (abortSignal?.aborted) {
    throw new Error('Operation aborted');
  }
  
  // If we already have a translator for this language pair, return it
  if (bergamotTranslators.has(modelKey)) {
    return bergamotTranslators.get(modelKey);
  }

  // Check if there's already a loader for this pair
  if (activeLoaders.has(modelKey)) {
    // Wait for existing loader to complete or fail
    // This prevents duplicate downloads
    while (activeLoaders.has(modelKey) && !abortSignal?.aborted) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (bergamotTranslators.has(modelKey)) {
        return bergamotTranslators.get(modelKey);
      }
    }
    
    if (abortSignal?.aborted) {
      throw new Error('Operation aborted');
    }
    
    // If loader finished but translator wasn't created, continue below
  }

  // Create abort controller for this operation
  const controller = new AbortController();
  const abortHandler = () => controller.abort();
  abortSignal?.addEventListener('abort', abortHandler);
  
  try {
    // Register this loader
    activeLoaders.set(modelKey, { abortController: controller, onProgress });
    
    // Import LatencyOptimisedTranslator and TranslatorBacking
    const { LatencyOptimisedTranslator, TranslatorBacking } = await import('@browsermt/bergamot-translator/translator.js');
    
    // Create a custom backing that uses our worker URL and new registry format
    // We extend TranslatorBacking to inherit all model loading functionality
    class CustomBacking extends TranslatorBacking {
      private baseUrl: string = '';
      private abortSignal?: AbortSignal;
      private onProgress?: (progress: number) => void;
      private filesDownloaded: number = 0;
      private totalFilesEstimate: number = 3; // Typical: model, vocab, lex (per model)
      private isPivot: boolean = false;
      private sourceLang: string;
      private targetLang: string;

      constructor(options: any, abortSignal?: AbortSignal, onProgress?: (progress: number) => void, sourceLang?: string, targetLang?: string) {
        // Use the API route for registry (bypasses CORS)
        const registryUrl = typeof window !== 'undefined' 
          ? `${window.location.origin}/api/bergamot/registry`
          : 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json';
        
        // Use the new Mozilla registry URL and ensure pivot through English is enabled
        const mergedOptions = {
          ...options,
          registryUrl: options.registryUrl || registryUrl,
          pivotLanguage: options.pivotLanguage ?? 'en', // Enable pivot translation through English
        };
        // Call parent constructor to initialize registry, buffers, etc.
        super(mergedOptions);
        this.abortSignal = abortSignal;
        this.onProgress = onProgress;
        this.sourceLang = sourceLang || '';
        this.targetLang = targetLang || '';
      }
      
      // Update progress helper with throttling to ensure UI updates are visible
      private lastProgressUpdate: number = 0;
      private updateProgress(baseProgress: number, fileProgress: number, fileWeight: number): void {
        if (this.onProgress) {
          // baseProgress is the base percentage (e.g., 5% for registry loaded)
          // fileProgress is progress for current file (0-100)
          // fileWeight is how much this file contributes to total (e.g., 0.5 for 50%)
          const progress = baseProgress + (fileProgress * fileWeight / 100);
          const clampedProgress = Math.min(95, Math.max(0, Math.round(progress)));
          
          // Throttle updates to at most once every 100ms to ensure UI can render
          const now = Date.now();
          if (clampedProgress !== this.lastProgressUpdate || now - this.lastProgressUpdate > 100) {
            this.onProgress(clampedProgress);
            this.lastProgressUpdate = clampedProgress;
          }
        }
      }
      
      // Check for abort before operations
      private checkAborted(): void {
        if (this.abortSignal?.aborted || controller.signal.aborted) {
          throw new Error('Operation aborted by user');
        }
      }

      // Override loadModelRegistery to parse the new registry format
      async loadModelRegistery(): Promise<any[]> {
        this.checkAborted();
        
        // Start at 5% (registry loading)
        this.updateProgress(0, 0, 0);
        
        const response = await fetch(this.registryUrl, { 
          credentials: 'omit',
          signal: controller.signal,
        });
        
        this.checkAborted();
        
        const data = await response.json();
        
        // Registry loaded - 5%
        this.updateProgress(5, 100, 0);
        
        // Store baseUrl for model file loading
        this.baseUrl = data.baseUrl || 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data';
        
        // Parse the new format: { "models": { "ja-en": [{ files: {...} }] } }
        const registry: any[] = [];
        
        // Check if this is a pivot translation by looking for both source-en and en-target
        const pivotLang = 'en';
        this.isPivot = this.sourceLang !== pivotLang && this.targetLang !== pivotLang && 
                      data.models?.[`${this.sourceLang}-${pivotLang}`] && 
                      data.models?.[`${pivotLang}-${this.targetLang}`];
        
        // Estimate total files: for pivot we have 2 models, for direct 1 model
        // Each model typically has: model file (largest), vocab, lex
        this.totalFilesEstimate = this.isPivot ? 6 : 3;
        this.filesDownloaded = 0;
        
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
        this.checkAborted();
        
        // Determine file type and weight for progress calculation
        // Model files are largest (~70% of download), vocab (~20%), lex (~10%)
        let fileWeight = 0.25; // Default weight per file
        let isModelFile = false;
        
        if (url.includes('/model.') || url.includes('model.')) {
          fileWeight = this.isPivot ? 0.35 : 0.70; // Model files are largest
          isModelFile = true;
        } else if (url.includes('vocab') || url.includes('vocab.')) {
          fileWeight = this.isPivot ? 0.15 : 0.20;
        } else if (url.includes('lex') || url.includes('lexical')) {
          fileWeight = this.isPivot ? 0.05 : 0.10;
        }
        
          // Calculate base progress: 5% (registry) + cumulative progress from previous files
          // We use 85% for file downloads (5-90%), leaving 10% for initialization
          // Each file gets equal share of the 85%, but weighted by file size
          const progressRange = 85; // 5% to 90%
          const baseProgress = 5 + (this.filesDownloaded / this.totalFilesEstimate) * progressRange;
          
          // File-specific progress within its allocation
          // Model files get more of their share (they're bigger), but all files get equal allocation
          const fileAllocation = progressRange / this.totalFilesEstimate; // Each file gets this much
          
          const fileName = url.substring(url.lastIndexOf('/') + 1);
          console.log(`[Progress] File ${this.filesDownloaded + 1}/${this.totalFilesEstimate}: ${fileName}`);
          console.log(`[Progress] Base: ${baseProgress.toFixed(1)}%, Allocation: ${fileAllocation.toFixed(1)}%, Weight: ${(fileWeight * 100).toFixed(0)}%`);
          
          // Start of file download - show we're starting this file
          this.updateProgress(baseProgress, 0, fileAllocation);
        
        // Combine abort signals: our loader's signal and any external signal
        const fetchController = new AbortController();
        const combinedAbort = () => fetchController.abort();
        
        // Use our main controller signal
        controller.signal.addEventListener('abort', combinedAbort);
        
        // Also maintain the original abort signal from extra
        if (extra?.signal) {
          extra.signal.addEventListener('abort', combinedAbort);
        }
        
        // Timeout for individual file fetch
        const downloadTimeout = (this as any).downloadTimeout || 120000; // 2 minutes for large files
        const timeout = downloadTimeout ? setTimeout(combinedAbort, downloadTimeout) : null;

        try {
          // For Google Cloud Storage, skip integrity check as it may not be supported
          const options: RequestInit = {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            signal: fetchController.signal,
          };

          try {
            console.log(`Fetching Bergamot model file: ${url}`);
            
            // Use a ReadableStream to track download progress if available
            const response = await fetch(url, options);
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
            }

            // Track download progress using response body stream
            const contentLength = response.headers.get('content-length');
            const totalBytes = contentLength ? parseInt(contentLength, 10) : null;
            
            // Check if response is from cache
            const cached = response.headers.get('x-cache') === 'HIT' || 
                          (response as any).fromCache || 
                          (response as any).wasCached;
            
            let downloadedBytes = 0;
            const chunks: Uint8Array[] = [];
            
            if (cached) {
              console.log(`[Progress] File ${fileName} served from cache - will be instant`);
              // Even if cached, show progress through this file
              // Update quickly: 10% -> 50% -> 100% to show we're processing it
              this.updateProgress(baseProgress, 10, fileAllocation);
              await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to show progress
              this.updateProgress(baseProgress, 50, fileAllocation);
              
              // Still need to read the cached response
              const arrayBuffer = await response.arrayBuffer();
              console.log(`[Progress] Cached file ${fileName} loaded: ${arrayBuffer.byteLength} bytes`);
              
              // Check if the file is gzipped
              const isGzipped = url.endsWith('.gz') || this.isGzipData(arrayBuffer);
              
              if (isGzipped) {
                this.updateProgress(baseProgress, 80, fileAllocation);
                console.log(`[Progress] Decompressing cached ${fileName}...`);
                const decompressed = await this.decompressGzip(arrayBuffer);
                console.log(`[Progress] Decompressed ${fileName}: ${decompressed.byteLength} bytes`);
                this.filesDownloaded++;
                const nextBaseProgress = 5 + (this.filesDownloaded / this.totalFilesEstimate) * progressRange;
                console.log(`[Progress] Cached file ${this.filesDownloaded}/${this.totalFilesEstimate} complete. Next base: ${nextBaseProgress.toFixed(1)}%`);
                this.updateProgress(baseProgress, 100, fileAllocation);
                this.checkAborted();
                return decompressed;
              }
              
              // Not gzipped, return as-is
              this.filesDownloaded++;
              const nextBaseProgress = 5 + (this.filesDownloaded / this.totalFilesEstimate) * progressRange;
              console.log(`[Progress] Cached file ${this.filesDownloaded}/${this.totalFilesEstimate} complete. Next base: ${nextBaseProgress.toFixed(1)}%`);
              this.updateProgress(baseProgress, 100, fileAllocation);
              this.checkAborted();
              return arrayBuffer;
            }
            
            if (totalBytes && response.body) {
              // Track progress during download (files not cached)
              const reader = response.body.getReader();
              
              // Start at a small percentage to show download has started
              this.updateProgress(baseProgress, 5, fileAllocation);
              
              while (true) {
                this.checkAborted();
                const { done, value } = await reader.read();
                if (done) break;
                
                chunks.push(value);
                downloadedBytes += value.length;
                
                // Update progress during download (0-90% of this file's allocation)
                // Update more frequently for large files
                if (totalBytes && this.onProgress) {
                  const fileProgress = Math.min(90, (downloadedBytes / totalBytes) * 100);
                  // Update every ~5% or every 50KB, whichever is more frequent
                  if (fileProgress % 5 < 0.1 || downloadedBytes % (50 * 1024) === 0) {
                    this.updateProgress(baseProgress, fileProgress, fileAllocation);
                  }
                }
              }
              
              // Combine chunks into single array buffer
              const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
              const arrayBuffer = new ArrayBuffer(totalLength);
              const view = new Uint8Array(arrayBuffer);
              let offset = 0;
              for (const chunk of chunks) {
                view.set(chunk, offset);
                offset += chunk.length;
              }
              
              console.log(`Downloaded ${url}, compressed size: ${arrayBuffer.byteLength} bytes`);
              
              // Check if the file is gzipped
              const isGzipped = url.endsWith('.gz') || this.isGzipData(arrayBuffer);
              
              if (isGzipped) {
                // Decompression progress (90-100% of this file's allocation)
                this.updateProgress(baseProgress, 90, fileAllocation);
                console.log(`[Progress] Decompressing ${fileName}...`);
                const decompressed = await this.decompressGzip(arrayBuffer);
                console.log(`[Progress] Decompressed ${fileName}: ${decompressed.byteLength} bytes`);
                this.updateProgress(baseProgress, 100, fileAllocation);
                
                // Mark file as downloaded
                this.filesDownloaded++;
                const nextBaseProgress = 5 + (this.filesDownloaded / this.totalFilesEstimate) * progressRange;
                console.log(`[Progress] File ${this.filesDownloaded}/${this.totalFilesEstimate} complete. Next base: ${nextBaseProgress.toFixed(1)}%`);
                this.checkAborted();
                return decompressed;
              }
              
              // Mark file as downloaded
              this.filesDownloaded++;
              const nextBaseProgress = 5 + (this.filesDownloaded / this.totalFilesEstimate) * progressRange;
              console.log(`[Progress] File ${this.filesDownloaded}/${this.totalFilesEstimate} complete. Next base: ${nextBaseProgress.toFixed(1)}%`);
              this.updateProgress(baseProgress, 100, fileAllocation);
              this.checkAborted();
              return arrayBuffer;
            } else {
              // Fallback: no content-length header, can't track progress precisely
              // But still show progress is happening
              this.updateProgress(baseProgress, 30, fileAllocation);
              const arrayBuffer = await response.arrayBuffer();
              console.log(`[Progress] Downloaded ${fileName}: ${arrayBuffer.byteLength} bytes (no content-length)`);
              
              // Check if the file is gzipped
              const isGzipped = url.endsWith('.gz') || this.isGzipData(arrayBuffer);
              
              if (isGzipped) {
                this.updateProgress(baseProgress, 70, fileAllocation);
                console.log(`[Progress] Decompressing ${fileName}...`);
                const decompressed = await this.decompressGzip(arrayBuffer);
                console.log(`[Progress] Decompressed ${fileName}: ${decompressed.byteLength} bytes`);
                this.filesDownloaded++;
                const nextBaseProgress = 5 + (this.filesDownloaded / this.totalFilesEstimate) * progressRange;
                console.log(`[Progress] File ${this.filesDownloaded}/${this.totalFilesEstimate} complete. Next base: ${nextBaseProgress.toFixed(1)}%`);
                this.updateProgress(baseProgress, 100, fileAllocation);
                this.checkAborted();
                return decompressed;
              }
              
              this.filesDownloaded++;
              const nextBaseProgress = 5 + (this.filesDownloaded / this.totalFilesEstimate) * progressRange;
              console.log(`[Progress] File ${this.filesDownloaded}/${this.totalFilesEstimate} complete. Next base: ${nextBaseProgress.toFixed(1)}%`);
              this.updateProgress(baseProgress, 100, fileAllocation);
              this.checkAborted();
              return arrayBuffer;
            }
          } catch (fetchError: any) {
            this.checkAborted(); // Check again after error
            console.error(`Failed to fetch ${url}:`, fetchError);
            if (fetchError.name === 'AbortError' || controller.signal.aborted) {
              throw new Error('Model download cancelled by user');
            }
            if (fetchError.message?.includes('CORS') || fetchError.message?.includes('Failed to fetch')) {
              throw new Error(`CORS or network error fetching ${url}. The file may not be accessible from this origin.`);
            }
            throw new Error(`Could not fetch ${url}: ${fetchError.message || 'Unknown error'}`);
          }
        } finally {
          if (timeout) {
            clearTimeout(timeout);
          }
          controller.signal.removeEventListener('abort', combinedAbort);
          if (extra?.signal) {
            extra.signal.removeEventListener('abort', combinedAbort);
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
    const backing = new CustomBacking({}, controller.signal, onProgress, sourceLang, targetLang);
    
    // Note: Model files will be downloaded when translate() is first called
    // The CustomBacking.fetch() method will track progress during downloads
    // So we don't set progress here - it will be updated during actual file downloads
    
    const translator = new LatencyOptimisedTranslator({}, backing);
    
    // Store in cache
    bergamotTranslators.set(modelKey, translator);
    
    // Translator created, but models not yet loaded (will be loaded on first translate call)
    // Progress will be updated during actual file downloads in CustomBacking.fetch()
    if (onProgress) {
      onProgress(5); // Just registry loaded, files will download when translate() is called
    }
    
    return translator;
  } catch (error) {
    console.error('Failed to create Bergamot translator:', error);
    // Remove from cache if loading failed
    bergamotTranslators.delete(modelKey);
    throw error;
  } finally {
    // Clean up loader registration
    activeLoaders.delete(modelKey);
    abortSignal?.removeEventListener('abort', abortHandler);
  }
}

/**
 * Cancel loading for a specific language pair
 * @param sourceLang Source language code
 * @param targetLang Target language code
 */
export function cancelBergamotModelLoad(sourceLang: string, targetLang: string): void {
  const modelKey = `${sourceLang}-${targetLang}`;
  const loader = activeLoaders.get(modelKey);
  if (loader) {
    loader.abortController.abort();
    activeLoaders.delete(modelKey);
    // Also remove from translator cache if it was partially created
    bergamotTranslators.delete(modelKey);
  }
}

/**
 * Load Bergamot model for a language pair
 * This pre-loads the model by attempting a dummy translation
 * The model files are downloaded and cached by the browser automatically
 * @param sourceLang Source language code
 * @param targetLang Target language code
 * @param abortSignal Optional AbortSignal to cancel the operation
 * @param onProgress Optional progress callback (0-100)
 */
export async function loadBergamotModel(
  sourceLang: string,
  targetLang: string,
  abortSignal?: AbortSignal,
  onProgress?: (progress: number) => void
): Promise<any> {
  const modelKey = `${sourceLang}-${targetLang}`;
  
  // Check if cancelled before starting
  if (abortSignal?.aborted) {
    throw new Error('Operation aborted');
  }
  
  // If already loaded, return existing translator
  if (bergamotTranslators.has(modelKey)) {
    if (onProgress) {
      onProgress(100);
    }
    return bergamotTranslators.get(modelKey);
  }

  try {
    const translator = await getBergamotTranslator(sourceLang, targetLang, abortSignal, onProgress);
    
    // Check if cancelled after translator creation
    if (abortSignal?.aborted) {
      throw new Error('Operation aborted');
    }
    
      // Trigger model download by attempting a dummy translation
      // This will download the model files if not already cached
      // The CustomBacking.fetch() method will track progress during downloads (5-90%)
      // The package handles caching automatically via the browser's cache
      try {
        // Track progress before translate call - should be at 5% (registry loaded)
        let progressBeforeTranslate = 0;
        if (onProgress) {
          // Get current progress if possible (we don't have direct access, so estimate)
          progressBeforeTranslate = 5; // Registry loaded
        }
        
        console.log(`[Progress] Starting translate() call - files should download now. Current progress: ~${progressBeforeTranslate}%`);
        
        const result = await translator.translate({
          from: sourceLang,
          to: targetLang,
          text: 'test',
          html: false,
        });
        
        console.log('[Progress] Translate() completed. All required files have been loaded.');
        
        // Translation test completed - models are loaded
        // If files were cached, fetch() completed very quickly and progress might still be low
        // We need to ensure progress smoothly completes to show all files are loaded
        if (onProgress) {
          // Wait a bit to ensure any final progress updates from fetch() are processed
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Ensure progress completes smoothly
          // If files were cached and progress is still low (e.g., 25%), animate it to 90%
          // This shows the user that all files were loaded (even if from cache)
          // We'll update in steps to show progress is happening
          onProgress(90); // All files loaded (downloaded or cached)
          
          // Small delays to show progress updates
          await new Promise(resolve => setTimeout(resolve, 200));
          onProgress(95); // Model initialized and translation test passed
          
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log('Bergamot model loaded successfully for', modelKey);
        
        if (onProgress) {
          onProgress(100); // Complete
        }
    } catch (e) {
      // If translation fails, the model might not be available for this language pair
      console.error('Failed to load Bergamot model - translation test failed:', e);
      if (e instanceof Error && e.message.includes('aborted')) {
        throw e;
      }
      throw new Error(`Bergamot model for ${sourceLang}-${targetLang} is not available or failed to load: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    
    return translator;
  } catch (error) {
    console.error('Failed to load Bergamot model:', error);
    // Remove from cache if loading failed
    bergamotTranslators.delete(modelKey);

    throw error;
  }
}

/**
 * Translate text using Bergamot Translator
 * @param text Text to translate
 * @param sourceLanguage Source language code
 * @param targetLanguage Target language code
 * @param abortSignal Optional AbortSignal to cancel the operation
 */
export async function translateWithBergamot(
  text: string,
  sourceLanguage: string = 'ja',
  targetLanguage: string = 'en',
  abortSignal?: AbortSignal
): Promise<string | null> {
  try {
    const translator = await getBergamotTranslator(sourceLanguage, targetLanguage, abortSignal);
    
    // Check if cancelled
    if (abortSignal?.aborted) {
      throw new Error('Translation aborted');
    }
    
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
    if (error instanceof Error && error.message.includes('aborted')) {
      throw error;
    }
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

