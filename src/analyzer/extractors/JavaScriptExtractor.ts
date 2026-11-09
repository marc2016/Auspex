import type { ClassInfo, MethodInfo } from '../types';
import {
  type LanguageStructureExtractor,
  type ExtractedStructure,
  findBraceBlockEnd,
  isCommentOrEmpty,
} from './types';

interface EnclosingScope {
  name: string;
  /**
   * 'anonymous' marks an anonymous function expression (e.g. a callback). It is never emitted,
   * but it rebinds `this`, so this-assignments directly inside it do not create methods.
   */
  kind: 'class' | 'object_literal' | 'prototype' | 'module' | 'component' | 'function' | 'anonymous';
  startLine: number;
  endLine: number;
  classRef?: ClassInfo;
  methodRef?: MethodInfo;
  /** Plain function name (without "parent > " prefix) for function/component scopes. */
  baseName?: string;
  /** Local variables bound to `this` in this function (e.g. `var self = this`). */
  thisAliases?: Set<string>;
  /** True for methods of a class, prototype or object literal container. */
  isContainerMethod?: boolean;
  /** True for methods created from `this.x = function` assignments. */
  isThisMethod?: boolean;
}

const THIS_BINDING_KINDS = new Set<EnclosingScope['kind']>(['function', 'component', 'anonymous']);

/** `recv.prop = <function value>` on a single line (function expression, async function or arrow). */
const MEMBER_FUNCTION_ASSIGNMENT =
  /^\s*([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/;

/** `recv.prop = (` / `recv.prop = async (` whose arrow parameter list continues on following lines. */
const MEMBER_ARROW_ASSIGNMENT_START = /^\s*([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*$/;

/** `var|let|const name = this` */
const THIS_ALIAS_DECLARATION = /^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*this\s*[;,]?\s*$/;

/** Anonymous function expression start, e.g. `forEach(function (x) {` or `define([...], function (A) {`. */
const ANONYMOUS_FUNCTION = /(^|[^\w$.])function\s*\(/;

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
        regex: /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)(?:\s*:\s*[^=]+)?\s*=\s*(?:\(\s*)?(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
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

    /** Nearest scope whose `this` applies at the current position (arrows are transparent). */
    const findThisBindingScope = (): EnclosingScope | undefined => {
      for (let s = scopeStack.length - 1; s >= 0; s--) {
        if (THIS_BINDING_KINDS.has(scopeStack[s].kind)) return scopeStack[s];
      }
      return undefined;
    };

    /** Scope that owns the `this` referenced by `receiver` (`this` itself or a declared alias). */
    const findReceiverScope = (receiver: string): EnclosingScope | undefined => {
      if (receiver === 'this') return findThisBindingScope();
      for (let s = scopeStack.length - 1; s >= 0; s--) {
        if (scopeStack[s].thisAliases?.has(receiver)) return scopeStack[s];
      }
      return undefined;
    };

    /**
     * Turns a plain named function scope into a constructor container (or returns the existing one).
     * Returns undefined if the scope cannot be a constructor (anonymous, container method, this-method).
     */
    const promoteToConstructor = (scope: EnclosingScope): ClassInfo | undefined => {
      if (scope.kind === 'anonymous' || scope.isContainerMethod || scope.isThisMethod || !scope.baseName) {
        return undefined;
      }
      if (scope.classRef?.kind === 'constructor') {
        return scope.classRef;
      }

      const scopeIdx = scopeStack.indexOf(scope);

      // Enclosing "components" around a constructor are module wrappers (IIFE / factory), not components.
      for (let s = 0; s < scopeIdx; s++) {
        const outer = scopeStack[s];
        if (outer.kind === 'component' && outer.classRef?.kind === 'component') {
          const idx = classes.indexOf(outer.classRef);
          if (idx >= 0) classes.splice(idx, 1);
          outer.classRef = undefined;
        }
      }

      let cls: ClassInfo;
      if (scope.classRef && scope.classRef.kind === 'component') {
        cls = scope.classRef;
        cls.kind = 'constructor';
      } else {
        cls = {
          name: scope.baseName,
          startLine: scope.startLine,
          endLine: scope.endLine,
          loc: Math.max(scope.endLine - scope.startLine + 1, 1),
          methods: [],
          kind: 'constructor',
        };
        classes.push(cls);
        scope.classRef = cls;
      }

      // A promoted nested function's body becomes the constructor body method `Name()`.
      if (scope.methodRef && scope.methodRef.isNested) {
        scope.methodRef.name = `${scope.baseName}()`;
        delete scope.methodRef.parentMethod;
        scope.methodRef.isNested = false;
        scope.name = scope.baseName;
      }
      constructorBodies.set(cls, scope.methodRef);
      return cls;
    };

    /** Returns `{ receiver, prop }` if the line assigns a function value to a member. */
    const matchMemberFunctionAssignment = (i: number): { receiver: string; prop: string } | null => {
      const line = lines[i];
      const single = line.match(MEMBER_FUNCTION_ASSIGNMENT);
      if (single) return { receiver: single[1], prop: single[2] };

      // Arrow function whose parameter list spans several lines: `this.x = (\n a,\n b\n) => {`
      const start = line.match(MEMBER_ARROW_ASSIGNMENT_START);
      if (!start) return null;
      let combined = line;
      for (let k = 1; k <= 15 && i + k < lines.length; k++) {
        const next = lines[i + k].trim();
        if (isCommentOrEmpty(next)) continue;
        combined += ' ' + next;
        if (next.includes('=>')) {
          return /\)\s*(?::\s*[^=]+)?=>/.test(combined) ? { receiver: start[1], prop: start[2] } : null;
        }
        if (next.includes(';') || next.includes('{')) return null;
      }
      return null;
    };

    const constructorBodies = new Map<ClassInfo, MethodInfo | undefined>();

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

      // 0a. `var self = this` - remember the alias on the scope that owns this `this`
      const aliasMatch = line.match(THIS_ALIAS_DECLARATION);
      if (aliasMatch) {
        const owner = findThisBindingScope();
        if (owner) {
          owner.thisAliases = owner.thisAliases ?? new Set<string>();
          owner.thisAliases.add(aliasMatch[1]);
        }
        continue;
      }

      // 0b. `this.x = function` / `self.x = () =>` - method of a constructor function
      const memberAssign = matchMemberFunctionAssignment(i);
      if (memberAssign) {
        const ownerScope = findReceiverScope(memberAssign.receiver);
        const ctor = ownerScope ? promoteToConstructor(ownerScope) : undefined;
        if (ctor) {
          const startLine = currentLine;
          const endLine = findBraceBlockEnd(lines, i);
          const methodObj: MethodInfo = {
            name: `${memberAssign.prop}()`,
            startLine,
            endLine,
            loc: Math.max(endLine - startLine + 1, 1),
          };
          methods.push(methodObj);
          ctor.methods.push(methodObj);
          scopeStack.push({
            name: memberAssign.prop,
            kind: 'function',
            startLine,
            endLine,
            methodRef: methodObj,
            baseName: memberAssign.prop,
            isThisMethod: true,
          });
          continue;
        }
        // Otherwise fall through: handled like before (nested helper / property assignment).
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

        const isPotentialMultiLineDeclaration =
          !line.includes(';') &&
          !line.includes('{') &&
          !line.includes('=>') &&
          (
            /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/.test(line) ||
            /^\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)(?:\s*:\s*[^=]+)?\s*=\s*(?:\(\s*)?(?:async\s*)?\(/.test(line) ||
            /^\s*(?:(?:public|private|protected|static|async|get|set|readonly|override)\s+)+([a-zA-Z0-9_$]+)\s*\(/.test(line) ||
            (insideClassOrObject && /^\s*([a-zA-Z0-9_$]+)\s*\(/.test(line) && !line.includes('='))
          );

        // Multi-line signature lookahead (e.g. multi-line parameter lists or brace on next line)
        if (!funcName && isPotentialMultiLineDeclaration) {
          let combinedLine = line;
          let foundBodyStart = false;
          for (let lookahead = 1; lookahead <= 15 && i + lookahead < lines.length; lookahead++) {
            const nextRaw = lines[i + lookahead];
            const nextTrimmed = nextRaw.trim();
            if (isCommentOrEmpty(nextTrimmed)) continue;
            if (nextTrimmed.includes(';')) {
              break;
            }
            combinedLine += ' ' + nextTrimmed;
            if (nextTrimmed.includes('{') || nextTrimmed.includes('=>')) {
              foundBodyStart = true;
              break;
            }
          }

          if (foundBodyStart) {
            for (const pattern of generalFunctionPatterns) {
              if (pattern.isMethodShorthand && !insideClassOrObject && !combinedLine.includes('return {')) {
                continue;
              }

              const match = combinedLine.match(pattern.regex);
              if (match) {
                const candidate = pattern.getName(match);
                if (candidate && !reservedKeywords.has(candidate)) {
                  funcName = candidate;
                  break;
                }
              }
            }
          }
        }
      }

      // Member assignment of an arrow function that is not a constructor method
      // (e.g. inside an ES6 class constructor): treat it like other member assignments.
      if (!funcName && memberAssign) {
        funcName = memberAssign.prop;
      }

      if (!funcName) {
        // Anonymous function expression (callback, AMD factory, IIFE): track it so that `this`
        // inside it is not attributed to the enclosing function. Never emitted as a method.
        const anon = ANONYMOUS_FUNCTION.exec(line);
        if (anon) {
          const startCol = anon.index + anon[1].length;
          const endLine = findBraceBlockEnd(lines, i, 5000, startCol);
          if (endLine > currentLine) {
            scopeStack.push({ name: '<anonymous>', kind: 'anonymous', startLine: currentLine, endLine });
          }
        }
        continue;
      }

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
          baseName: funcName,
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
            baseName: funcName,
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
            baseName: funcName,
            isContainerMethod: !!enclosingClass,
          });
        }
      }
    }

    // A constructor's members are all functions inside its range except its own body method.
    for (const [cls, body] of constructorBodies) {
      cls.methods = methods.filter(
        (m) => m !== body && m.startLine >= cls.startLine && m.endLine <= cls.endLine
      );
    }

    // Filter out trivial object literals and empty components
    const significantClasses = classes.filter((c) => {
      if (c.kind === 'class' || c.kind === 'prototype' || c.kind === 'module' || c.kind === 'constructor') {
        return true;
      }
      if (c.kind === 'component') return c.methods.length > 0 || c.loc >= 40;
      // Object literal: keep if it contains at least 1 method or has >= 40 LOC
      return c.methods.length > 0 || c.loc >= 40;
    });

    return { classes: significantClasses, methods };
  }
}
