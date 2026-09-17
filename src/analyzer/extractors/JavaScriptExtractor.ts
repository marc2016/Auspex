import type { ClassInfo, MethodInfo } from '../types';
import {
  type LanguageStructureExtractor,
  type ExtractedStructure,
  findBraceBlockEnd,
  isCommentOrEmpty,
} from './types';

interface EnclosingScope {
  name: string;
  kind: 'class' | 'object_literal' | 'prototype' | 'module' | 'component' | 'function';
  startLine: number;
  endLine: number;
  classRef?: ClassInfo;
  methodRef?: MethodInfo;
}

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
    const classes: ClassInfo[] = [];
    const methods: MethodInfo[] = [];
    const scopeStack: EnclosingScope[] = [];

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

    const generalFunctionPatterns: {
      regex: RegExp;
      getName: (match: RegExpMatchArray) => string | null;
      isMethodShorthand?: boolean;
    }[] = [
      // function foo(...)
      {
        regex: /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)\s*\(/,
        getName: (m) => m[1],
      },
      // const foo = (...) => or const foo = ((...) =>
      {
        regex: /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:\(\s*)?(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
        getName: (m) => m[1],
      },
      // const foo = function(...) or const foo = (function(...)
      {
        regex: /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:\(\s*)?(?:async\s+)?function(?:\s+[a-zA-Z0-9_$]+)?\s*\(/,
        getName: (m) => m[1],
      },
      // Class field arrow: foo = () =>
      {
        regex: /^\s*(?:(?:public|private|protected|readonly|static)\s+)*([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
        getName: (m) => m[1],
      },
      // Object literal method: foo: function(...)
      {
        regex: /^\s*([a-zA-Z0-9_$]+)\s*:\s*(?:async\s+)?function(?:\s+[a-zA-Z0-9_$]+)?\s*\(/,
        getName: (m) => m[1],
      },
      // Object literal method: foo: (...) =>
      {
        regex: /^\s*([a-zA-Z0-9_$]+)\s*:\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
        getName: (m) => m[1],
      },
      // ES6 method shorthand: foo(...) {
      {
        regex: /^\s*(?:(?:public|private|protected|static|async|get|set|readonly)\s+)*([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/,
        getName: (m) => {
          const params = m[2] || '';
          // Disallow function calls with string literals, callbacks, or arrows
          if (
            params.includes("'") ||
            params.includes('"') ||
            params.includes('`') ||
            params.includes('=>') ||
            params.includes('function')
          ) {
            return null;
          }
          return m[1];
        },
        isMethodShorthand: true,
      },
      // Property assignment: Foo.bar = function(...)
      {
        regex: /(?:[a-zA-Z0-9_$]+\.)+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?function/,
        getName: (m) => m[1],
      },
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
      'describe',
      'it',
      'test',
      'beforeEach',
      'afterEach',
      'beforeAll',
      'afterAll',
      'setTimeout',
      'setInterval',
      'setImmediate',
      'expect',
      'assert',
    ]);

    const isPascalCase = (name: string) =>
      /^[A-Z][a-zA-Z0-9_$]*$/.test(name) && !/^[A-Z0-9_]+$/.test(name);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (isCommentOrEmpty(trimmed)) {
        continue;
      }

      const currentLine = i + 1;

      // Pop scopes that ended before current line
      while (scopeStack.length > 0 && scopeStack[scopeStack.length - 1].endLine < currentLine) {
        scopeStack.pop();
      }

      // 1. Check ES6 Class
      const classMatch = line.match(es6ClassPattern);
      if (classMatch && classMatch[1]) {
        const className = classMatch[1];
        const startLine = currentLine;
        const endLine = findBraceBlockEnd(lines, i);

        const cls: ClassInfo = {
          name: className,
          startLine,
          endLine,
          loc: Math.max(endLine - startLine + 1, 1),
          methods: [],
          kind: 'class',
        };
        classes.push(cls);
        scopeStack.push({
          name: className,
          kind: 'class',
          startLine,
          endLine,
          classRef: cls,
        });
      } else {
        // 2. Check Prototype Object Assignment (e.g. Foo.prototype = { ... })
        const protoMatch = line.match(prototypeObjectPattern);
        if (protoMatch && protoMatch[1]) {
          const className = protoMatch[1];
          const startLine = currentLine;
          const endLine = findBraceBlockEnd(lines, i);

          const cls: ClassInfo = {
            name: `${className}.prototype`,
            startLine,
            endLine,
            loc: Math.max(endLine - startLine + 1, 1),
            methods: [],
            kind: 'prototype',
          };
          classes.push(cls);
          scopeStack.push({
            name: `${className}.prototype`,
            kind: 'prototype',
            startLine,
            endLine,
            classRef: cls,
          });
        } else {
          // 3. Check Object Literals (var Foo = { ... } or window.Foo = { ... })
          const objMatch = line.match(objectLiteralPattern) || line.match(globalObjectPattern);
          if (objMatch && objMatch[1] && line.includes('{')) {
            const objName = objMatch[1];
            if (!reservedKeywords.has(objName)) {
              const startLine = currentLine;
              const endLine = findBraceBlockEnd(lines, i);

              // Only treat multi-line object definitions as container candidates
              if (endLine > startLine) {
                const cls: ClassInfo = {
                  name: objName,
                  startLine,
                  endLine,
                  loc: Math.max(endLine - startLine + 1, 1),
                  methods: [],
                  kind: 'object_literal',
                };
                classes.push(cls);
                scopeStack.push({
                  name: objName,
                  kind: 'object_literal',
                  startLine,
                  endLine,
                  classRef: cls,
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
        const activeScope = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : undefined;
        const insideClassOrObject =
          activeScope &&
          (activeScope.kind === 'class' ||
            activeScope.kind === 'object_literal' ||
            activeScope.kind === 'prototype');

        for (const pattern of generalFunctionPatterns) {
          // Shorthand methods foo() {} are only valid in class/object containers or return objects
          if (pattern.isMethodShorthand && !insideClassOrObject && !line.includes('return {')) {
            continue;
          }

          const match = line.match(pattern.regex);
          if (match) {
            const candidate = pattern.getName(match);
            if (candidate && !reservedKeywords.has(candidate)) {
              funcName = candidate;
              break;
            }
          }
        }
      }

      if (!funcName) continue;

      const startLine = currentLine;
      const endLine = findBraceBlockEnd(lines, i);
      const loc = Math.max(endLine - startLine + 1, 1);

      // Find enclosing class/object container (from scope stack or classes)
      const enclosingClassScope = [...scopeStack].reverse().find((s) => s.classRef);
      let enclosingClass =
        enclosingClassScope?.classRef ||
        classes.find((c) => startLine >= c.startLine && endLine <= c.endLine);

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
            loc,
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

      // Check if enclosed in a function/method (nested function / closure / helper)
      const enclosingFuncScope = [...scopeStack]
        .reverse()
        .find((s) => s.kind === 'function' || s.kind === 'component');

      if (enclosingFuncScope) {
        // Nested function inside another function/component
        const parentMethod = enclosingFuncScope.name;
        const fullName = `${parentMethod} > ${funcName}()`;

        const methodObj: MethodInfo = {
          name: fullName,
          startLine,
          endLine,
          loc,
          parentMethod,
          isNested: true,
        };

        methods.push(methodObj);
        enclosingClass?.methods.push(methodObj);

        scopeStack.push({
          name: `${parentMethod} > ${funcName}`,
          kind: 'function',
          startLine,
          endLine,
          methodRef: methodObj,
        });
      } else {
        // Top-level function or direct method of a class/object
        if (isPascalCase(funcName) && !enclosingClass) {
          // React / Frontend Component container
          const compClass: ClassInfo = {
            name: funcName,
            startLine,
            endLine,
            loc,
            methods: [],
            kind: 'component',
          };
          classes.push(compClass);

          const methodObj: MethodInfo = {
            name: `${funcName}()`,
            startLine,
            endLine,
            loc,
          };
          methods.push(methodObj);

          scopeStack.push({
            name: funcName,
            kind: 'component',
            startLine,
            endLine,
            classRef: compClass,
            methodRef: methodObj,
          });
        } else {
          const methodObj: MethodInfo = {
            name: `${funcName}()`,
            startLine,
            endLine,
            loc,
          };

          methods.push(methodObj);
          enclosingClass?.methods.push(methodObj);

          scopeStack.push({
            name: funcName,
            kind: 'function',
            startLine,
            endLine,
            methodRef: methodObj,
          });
        }
      }
    }

    // Filter out trivial object literals and empty components
    const significantClasses = classes.filter((c) => {
      if (c.kind === 'class' || c.kind === 'prototype' || c.kind === 'module') return true;
      if (c.kind === 'component') return c.methods.length > 0 || c.loc >= 40;
      // Object literal: keep if it contains at least 1 method or has >= 40 LOC
      return c.methods.length > 0 || c.loc >= 40;
    });

    return { classes: significantClasses, methods };
  }
}
