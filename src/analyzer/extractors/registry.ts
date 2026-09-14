import type { LanguageStructureExtractor } from './types';
import { JavaScriptExtractor } from './JavaScriptExtractor';
import { PythonExtractor } from './PythonExtractor';
import { GenericBraceExtractor } from './GenericBraceExtractor';

/**
 * Registry managing language-specific structure and AST extractors.
 * New languages can be added easily by implementing `LanguageStructureExtractor`
 * and calling `registry.register(extractor)`.
 */
export class StructureExtractorRegistry {
  private static instance: StructureExtractorRegistry;
  private extractors = new Map<string, LanguageStructureExtractor>();
  private defaultExtractor: LanguageStructureExtractor;

  constructor() {
    this.defaultExtractor = new GenericBraceExtractor();
    this.registerDefaults();
  }

  public static getInstance(): StructureExtractorRegistry {
    if (!StructureExtractorRegistry.instance) {
      StructureExtractorRegistry.instance = new StructureExtractorRegistry();
    }
    return StructureExtractorRegistry.instance;
  }

  private registerDefaults(): void {
    this.register(new JavaScriptExtractor());
    this.register(new PythonExtractor());
    this.register(this.defaultExtractor);
  }

  /**
   * Registers a new or custom language extractor.
   */
  public register(extractor: LanguageStructureExtractor): void {
    for (const lang of extractor.supportedLanguages) {
      this.extractors.set(lang.toLowerCase(), extractor);
    }
  }

  /**
   * Gets the extractor for the given language identifier.
   * Falls back to the generic brace extractor if no specific extractor is found.
   */
  public getExtractor(lang: string): LanguageStructureExtractor {
    return this.extractors.get(lang.toLowerCase()) || this.defaultExtractor;
  }

  /**
   * List all registered languages.
   */
  public getRegisteredLanguages(): string[] {
    return Array.from(this.extractors.keys());
  }
}

export const extractorRegistry = StructureExtractorRegistry.getInstance();
