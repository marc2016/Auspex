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

    it('ignores curly braces inside strings and comments', () => {
      const lines = [
        'function parse() {',             // 1
        '  const a = "}";',                // 2 - string with }
        '  const b = \'{\';',              // 3 - string with {
        '  // inline comment with }',     // 4 - line comment with }
        '  /* block comment',              // 5
        '     with } braces */',           // 6 - block comment with }
        '  return a + b;',                 // 7
        '}',                               // 8
      ];

      expect(findBraceBlockEnd(lines, 0)).toBe(8);
    });

    it('handles template literals and interpolated expressions', () => {
      const lines = [
        'function render() {',             // 1
        '  const tmpl = `Closing: }`;',    // 2 - raw template with }
        '  const expr = `Val: ${user.name} and }`;', // 3 - expression with } in raw part
        '  const nested = `Obj: ${{ x: 10 }.x}`;',   // 4 - inner braces in expression
        '  return tmpl + expr + nested;',  // 5
        '}',                               // 6
      ];

      expect(findBraceBlockEnd(lines, 0)).toBe(6);
    });

    it('handles regular expression literals with braces', () => {
      const lines = [
        'function matchPattern() {',       // 1
        '  const re = /\\{([0-9]{1,3})\\}/;', // 2 - regex containing braces
        '  return re;',                    // 3
        '}',                               // 4
      ];

      expect(findBraceBlockEnd(lines, 0)).toBe(4);
    });

    it('handles parameter destructuring and type annotations spanning multiple lines', () => {
      const lines = [
        'export function UserProfile(',     // 1
        '  { userId }: { userId: string }', // 2 - destructuring inside parens
        ') {',                              // 3 - actual body start
        '  const x = 1;',                   // 4
        '  return x;',                      // 5
        '}',                                // 6
      ];

      expect(findBraceBlockEnd(lines, 0)).toBe(6);
    });

    it('handles return type annotations with object literal types', () => {
      const lines = [
        'function createPoint(): {',        // 1
        '  x: number;',                     // 2
        '  y: number;',                     // 3
        '} {',                              // 4 - body start
        '  return { x: 0, y: 0 };',         // 5
        '}',                                // 6
      ];

      expect(findBraceBlockEnd(lines, 0)).toBe(6);
    });

    it('handles arrow functions with expression bodies ending with semicolon', () => {
      const lines = [
        'const add = (a: number, b: number) => a + b;', // 1
        'const nextFn = () => 42;',                    // 2
      ];

      expect(findBraceBlockEnd(lines, 0)).toBe(1);
      expect(findBraceBlockEnd(lines, 1)).toBe(2);
    });

    it('handles arrow functions returning parenthesized object literals', () => {
      const lines = [
        'const makeUser = (id: string) => ({', // 1
        '  id,',                               // 2
        '  active: true,',                     // 3
        '});',                                 // 4
      ];

      expect(findBraceBlockEnd(lines, 0)).toBe(4);
    });
  });
});
