import { describe, it, expect } from 'vitest';
import {
  StructureExtractorRegistry,
  extractorRegistry,
} from '../src/analyzer/extractors/registry';
import type {
  LanguageStructureExtractor,
  ExtractedStructure,
} from '../src/analyzer/extractors/types';

describe('StructureExtractorRegistry', () => {
  it('has default extractors for JS/TS, Python, and C-family languages', () => {
    const jsExtractor = extractorRegistry.getExtractor('javascript');
    const tsExtractor = extractorRegistry.getExtractor('typescript');
    const pyExtractor = extractorRegistry.getExtractor('python');
    const javaExtractor = extractorRegistry.getExtractor('java');

    expect(jsExtractor).toBeDefined();
    expect(tsExtractor).toBeDefined();
    expect(pyExtractor).toBeDefined();
    expect(javaExtractor).toBeDefined();

    expect(jsExtractor.supportedLanguages).toContain('javascript');
    expect(pyExtractor.supportedLanguages).toContain('python');
    expect(javaExtractor.supportedLanguages).toContain('java');
  });

  it('performs case-insensitive lookup of language extractors', () => {
    const lower = extractorRegistry.getExtractor('javascript');
    const upper = extractorRegistry.getExtractor('JAVASCRIPT');
    const mixed = extractorRegistry.getExtractor('TypeScript');

    expect(upper).toBe(lower);
    expect(mixed).toBe(lower);
  });

  it('falls back to GenericBraceExtractor for unknown or unconfigured languages', () => {
    const unknownExtractor = extractorRegistry.getExtractor('unknown-lang-xyz');
    expect(unknownExtractor).toBeDefined();
    expect(unknownExtractor.supportedLanguages).toContain('java');
  });

  it('returns the list of all registered languages', () => {
    const langs = extractorRegistry.getRegisteredLanguages();
    expect(langs).toEqual(
      expect.arrayContaining([
        'javascript',
        'typescript',
        'python',
        'java',
        'csharp',
        'go',
        'rust',
        'c',
        'cpp',
      ])
    );
  });

  it('allows registering custom language extractors seamlessly', () => {
    const customRegistry = new StructureExtractorRegistry();

    const mockRubyExtractor: LanguageStructureExtractor = {
      supportedLanguages: ['ruby'],
      extractNamespace: () => 'MyRubyModule',
      extractStructures: (_lines: string[], _lang: string): ExtractedStructure => {
        return {
          classes: [
            {
              name: 'UserRecord',
              startLine: 1,
              endLine: 20,
              loc: 20,
              methods: [
                {
                  name: 'save()',
                  startLine: 5,
                  endLine: 10,
                  loc: 6,
                },
              ],
            },
          ],
          methods: [
            {
              name: 'save()',
              startLine: 5,
              endLine: 10,
              loc: 6,
            },
          ],
        };
      },
    };

    customRegistry.register(mockRubyExtractor);

    const fetched = customRegistry.getExtractor('ruby');
    expect(fetched).toBe(mockRubyExtractor);

    const extracted = fetched.extractStructures(['class UserRecord', 'end'], 'ruby');
    expect(extracted.classes).toHaveLength(1);
    expect(extracted.classes[0].name).toBe('UserRecord');
    expect(extracted.classes[0].methods).toHaveLength(1);
    expect(extracted.methods).toHaveLength(1);
  });

  it('allows overriding an existing extractor in an isolated registry instance', () => {
    const isolatedRegistry = new StructureExtractorRegistry();
    const customPyExtractor: LanguageStructureExtractor = {
      supportedLanguages: ['python'],
      extractStructures: () => ({ classes: [], methods: [] }),
    };

    isolatedRegistry.register(customPyExtractor);
    expect(isolatedRegistry.getExtractor('python')).toBe(customPyExtractor);
  });
});
