declare module '@browsermt/bergamot-translator/translator.js' {
  export class TranslatorBacking {
    registryUrl: string;
    constructor(options?: {
      registryUrl?: string;
      pivotLanguage?: string;
      downloadTimeout?: number;
      workerUrl?: string;
      cacheSize?: number;
      useNativeIntGemm?: boolean;
    });
    
    loadModelRegistery(): Promise<any[]>;
    loadWorker(): Promise<any>;
    fetch(url: string, checksum?: string, extra?: any): Promise<ArrayBuffer>;
  }
  
  export class LatencyOptimisedTranslator {
    constructor(options: any, backing: TranslatorBacking);
    translate(input: { from: string; to: string; text: string }): Promise<{ translation: string }>;
    delete(): void;
  }
}

