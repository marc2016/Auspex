import type { ClassInfo, MethodInfo } from '../types';
import {
  type LanguageStructureExtractor,
  type ExtractedStructure,
  findBraceBlockEnd,
  isCommentOrEmpty,
} from './types';

export class JavaScriptExtractor implements LanguageStructureExtractor {
  readonly supportedLanguages = ['javascript', 'typescript'];

  extractNamespace(lines: string[]): string | undefined {
    for (let i = 0; i < Math.min(lines.length, 60); i++) {
      const line = lines[i].trim();
      const nsMatch = line.match(/^(?:export\s+)?(?:namespace|module)\s+([a-zA-Z0-9_.]+)/);
      if (nsMatch) {
        return nsMatch[1];
      }
    }
    return undefined;
  }

  extractStructures(lines: string[], _lang: string): ExtractedStructure {
    const classes: (ClassInfo & { kind?: 'class' | 'object_literal' | 'prototype' })[] = [];
    const methods: MethodInfo[] = [];

    // Patterns for container declarations (ES6 classes, Object Literals, Prototype objects)
    const es6ClassPattern =
      /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/;

    const prototypeObjectPattern =
      /^\s*([a-zA-Z0-9_$]+)\.prototype\s*=\s*\{/;

    const objectLiteralPattern =
      /^\s*(?:export\s+)?(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*\{/;

    const globalObjectPattern =
      /^\s*(?:(?:window|global|exports|module\.exports)\.)?([a-zA-Z0-9_$]+)\s*=\s*\{/;

    // Patterns for functions / methods
    const functionPatterns: {
      regex: RegExp;
      getName: (match: RegExpMatchArray) => { funcName: string; className?: string };
    } = {
      // Prototype single assignment: Foo.prototype.bar = function(...)
      regex: /^\s*([a-zA-Z0-9_$]+)\.prototype\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/,
      getName: (m) => ({ className: m[1], funcName: m[2] }),
    };

    const generalFunctionPatterns = [
      // function foo(...)
      /(?:export\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)\s*\(/,
      // const foo = (...) =>
      /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
      // const foo = function(...)
      /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?function/,
      // Class field arrow: foo = () =>
      /^\s*(?:(?:public|private|protected|readonly|static)\s+)*([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
      // Object literal method: foo: function(...)
      /^\s*([a-zA-Z0-9_$]+)\s*:\s*(?:async\s+)?function\s*\(/,
      // Object literal method: foo: (...) =>
      /^\s*([a-zA-Z0-9_$]+)\s*:\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
      // ES6 method shorthand: foo(...) {
      /^\s*(?:(?:public|private|protected|static|async|get|set|readonly)\s+)*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/,
      // Property assignment: Foo.bar = function(...)
      /(?:[a-zA-Z0-9_$]+\.)+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?function/,
    ];

    const reservedKeywords = new Set([
      'if',
      'for',
      'while',
      'switch',
      'catch',
      'with',
      'return',
      'throw',
      'else',
      'do',
      'try',
      'finally',
    ]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (isCommentOrEmpty(trimmed)) {
        continue;
      }

      // 1. Check ES6 Class
      const classMatch = line.match(es6ClassPattern);
      if (classMatch && classMatch[1]) {
        const className = classMatch[1];
        const startLine = i + 1;
        const endLine = findBraceBlockEnd(lines, i);

        classes.push({
          name: className,
          startLine,
          endLine,
          loc: Math.max(endLine - startLine + 1, 1),
          methods: [],
          kind: 'class',
        });
      } else {
        // 2. Check Prototype Object Assignment (e.g. Foo.prototype = { ... })
        const protoMatch = line.match(prototypeObjectPattern);
        if (protoMatch && protoMatch[1]) {
          const className = protoMatch[1];
          const startLine = i + 1;
          const endLine = findBraceBlockEnd(lines, i);

          classes.push({
            name: `${className}.prototype`,
            startLine,
            endLine,
            loc: Math.max(endLine - startLine + 1, 1),
            methods: [],
            kind: 'prototype',
          });
        } else {
          // 3. Check Object Literals (var Foo = { ... } or window.Foo = { ... })
          const objMatch = line.match(objectLiteralPattern) || line.match(globalObjectPattern);
          if (objMatch && objMatch[1] && line.includes('{')) {
            const objName = objMatch[1];
            if (!reservedKeywords.has(objName)) {
              const startLine = i + 1;
              const endLine = findBraceBlockEnd(lines, i);

              // Only treat multi-line object definitions as container candidates
              if (endLine > startLine) {
                classes.push({
                  name: objName,
                  startLine,
                  endLine,
                  loc: Math.max(endLine - startLine + 1, 1),
                  methods: [],
                  kind: 'object_literal',
                });
              }
            }
          }
        }
      }

      // Fast filter: functions require '(' or '=>'
      if (!line.includes('(') && !line.includes('=>')) {
        continue;
      }

      // 4. Check Prototype single assignment: Foo.prototype.bar = function()
      let funcName: string | null = null;
      let explicitClassName: string | undefined;

      const protoSingleMatch = line.match(functionPatterns.regex);
      if (protoSingleMatch) {
        const info = functionPatterns.getName(protoSingleMatch);
        funcName = info.funcName;
        explicitClassName = info.className;
      } else {
        for (const pattern of generalFunctionPatterns) {
          const match = line.match(pattern);
          if (match && match[1]) {
            const candidate = match[1];
            if (!reservedKeywords.has(candidate)) {
              funcName = candidate;
              break;
            }
          }
        }
      }

      if (!funcName) continue;

      const startLine = i + 1;
      const endLine = findBraceBlockEnd(lines, i);

      // Find enclosing container (class, prototype, or object literal)
      let enclosingClass = classes.find(
        (c) => startLine >= c.startLine && endLine <= c.endLine
      );

      // If Foo.prototype.bar was used and explicitClassName was detected
      if (!enclosingClass && explicitClassName) {
        enclosingClass = classes.find(
          (c) => c.name === explicitClassName || c.name === `${explicitClassName}.prototype`
        );
        if (!enclosingClass) {
          // Synthesize a prototype container for Foo
          enclosingClass = {
            name: `${explicitClassName}.prototype`,
            startLine,
            endLine,
            loc: Math.max(endLine - startLine + 1, 1),
            methods: [],
            kind: 'prototype',
          };
          classes.push(enclosingClass);
        } else {
          // Expand container range
          enclosingClass.endLine = Math.max(enclosingClass.endLine, endLine);
          enclosingClass.loc = Math.max(enclosingClass.endLine - enclosingClass.startLine + 1, 1);
        }
      }

      const methodObj: MethodInfo = {
        name: `${funcName}()`,
        startLine,
        endLine,
        loc: Math.max(endLine - startLine + 1, 1),
      };

      methods.push(methodObj);
      enclosingClass?.methods.push(methodObj);

      if (endLine > startLine + 1) {
        i = endLine - 1;
      }
    }

    // Filter out trivial object literals that don't contain methods and are small
    const significantClasses = classes.filter((c) => {
      if (c.kind === 'class' || c.kind === 'prototype') return true;
      // Object literal: keep if it contains at least 1 method or has >= 40 LOC
      return c.methods.length > 0 || c.loc >= 40;
    });

    return { classes: significantClasses, methods };
  }
}
