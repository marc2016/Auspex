import { describe, it, expect } from 'vitest';
import { findBraceBlockEnd, isCommentOrEmpty } from '../src/analyzer/extractors/types';

describe('Extractor Shared Utilities', () => {
  describe('isCommentOrEmpty', () => {
    it('identifies empty lines as comment or empty', () => {
      expect(isCommentOrEmpty('')).toBe(true);
    });

    it('identifies line comments // and /* and *', () => {
      expect(isCommentOrEmpty('// this is a comment')).toBe(true);
      expect(isCommentOrEmpty('/* block comment start')).toBe(true);
      expect(isCommentOrEmpty('* block comment continuation')).toBe(true);
    });

    it('identifies Python/Shell # comments', () => {
      expect(isCommentOrEmpty('# python comment')).toBe(true);
    });

    it('returns false for actual code lines', () => {
      expect(isCommentOrEmpty('const x = 1;')).toBe(false);
      expect(isCommentOrEmpty('def foo():')).toBe(false);
      expect(isCommentOrEmpty('class Bar {')).toBe(false);
    });
  });

  describe('findBraceBlockEnd', () => {
    it('finds the 1-based end line of a simple block', () => {
      const lines = [
        'function test() {', // line 1 (idx 0)
        '  var a = 1;',     // line 2
        '}',                 // line 3
      ];

      expect(findBraceBlockEnd(lines, 0)).toBe(3);
    });

    it('handles nested curly braces accurately', () => {
      const lines = [
        'class Service {',   // line 1 (idx 0)
        '  method1() {',     // line 2
        '    if (true) {',   // line 3
        '      run();',      // line 4
        '    }',             // line 5
        '  }',               // line 6
        '}',                 // line 7
      ];

      expect(findBraceBlockEnd(lines, 0)).toBe(7);
      expect(findBraceBlockEnd(lines, 1)).toBe(6);
      expect(findBraceBlockEnd(lines, 2)).toBe(5);
    });

    it('returns line count when braces are unclosed or truncated', () => {
      const lines = [
        'function unclosed() {',
        '  var x = 10;',
      ];

      expect(findBraceBlockEnd(lines, 0)).toBe(2);
    });

    it('respects maxLines limit for safety on runaway inputs', () => {
      const lines = ['function infinite() {'];
      for (let i = 0; i < 50; i++) {
        lines.push('  step();');
      }
      lines.push('}');

      const endLine = findBraceBlockEnd(lines, 0, 10);
      expect(endLine).toBe(10);
    });
  });
});
