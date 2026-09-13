import type {
  ClassInfo,
  MethodInfo,
  BiomarkerFinding,
  CodeHealthResult,
} from './types';

export class CodeHealthAnalyzer {
  /**
   * Analyzes the code health of a single file and its methods/classes.
   * Returns a 1.0 to 10.0 score along with detected biomarkers.
   */
  analyzeFile(
    lines: string[],
    methods: MethodInfo[],
    classes: ClassInfo[],
    lang: string
  ): CodeHealthResult {
    const biomarkers: BiomarkerFinding[] = [];
    const totalLoc = lines.length;

    // 1. File-level & Class-level checks (Brain Class / God File)
    if (totalLoc >= 400) {
      biomarkers.push({
        type: 'brain_class',
        severity: totalLoc >= 800 ? 'high' : 'medium',
        details: `File is large (${totalLoc} LOC), indicating concentrated responsibilities.`,
      });
    }

    for (const cls of classes) {
      if (cls.loc > 500 || cls.methods.length > 15) {
        biomarkers.push({
          type: 'brain_class',
          severity: 'high',
          startLine: cls.startLine,
          endLine: cls.endLine,
          details: `Class '${cls.name}' has ${cls.loc} LOC and ${cls.methods.length} methods (God Class smell).`,
        });
      }
    }

    // 2. Method-level analysis
    for (const method of methods) {
      const methodFindings = this.analyzeMethod(lines, method, lang);
      biomarkers.push(...methodFindings);

      // Compute individual method Code Health
      let methodDeductions = 0;
      for (const f of methodFindings) {
        if (f.severity === 'high') methodDeductions += 2.0;
        else if (f.severity === 'medium') methodDeductions += 1.0;
        else methodDeductions += 0.5;
      }
      method.codeHealth = Math.max(1.0, Math.min(10.0, Number((10.0 - methodDeductions).toFixed(1))));
      method.biomarkers = methodFindings;
    }

    // If no methods were extracted in a non-trivial file, analyze top-level body for complexity
    if (methods.length === 0 && totalLoc >= 50) {
      const topLevelPseudoMethod: MethodInfo = {
        name: 'Top-Level Script',
        startLine: 1,
        endLine: totalLoc,
        loc: totalLoc,
      };
      const topLevelFindings = this.analyzeMethod(lines, topLevelPseudoMethod, lang);
      biomarkers.push(...topLevelFindings);
    }

    // 3. Compute overall file score
    let totalDeductions = 0;
    for (const b of biomarkers) {
      if (b.severity === 'high') totalDeductions += 2.0;
      else if (b.severity === 'medium') totalDeductions += 1.0;
      else totalDeductions += 0.5;
    }

    // Density normalization for files with many methods
    if (methods.length > 8) {
      totalDeductions = totalDeductions * (8 / Math.sqrt(methods.length * 8));
    }

    totalDeductions = Math.min(9.0, totalDeductions);
    const finalScore = Math.max(1.0, Math.min(10.0, Number((10.0 - totalDeductions).toFixed(1))));

    return {
      score: finalScore,
      biomarkers,
    };
  }

  /**
   * Analyzes an individual method/function for biomarkers:
   * Brain Method, Bumpy Road, Nested Complexity, Complex Conditionals, Excess Parameters.
   */
  public analyzeMethod(lines: string[], method: MethodInfo, lang: string): BiomarkerFinding[] {
    const findings: BiomarkerFinding[] = [];
    const startIdx = Math.max(0, method.startLine - 1);
    const endIdx = Math.min(lines.length - 1, method.endLine - 1);
    const methodLines = lines.slice(startIdx, endIdx + 1);
    const methodLoc = methodLines.length;

    // A. Excess Parameters
    const signatureLine = methodLines[0] || '';
    const paramMatch = signatureLine.match(/\(([^)]*)\)/);
    if (paramMatch && paramMatch[1]) {
      const params = paramMatch[1]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      if (params.length >= 5) {
        findings.push({
          type: 'excess_parameters',
          severity: 'low',
          functionName: method.name,
          startLine: method.startLine,
          endLine: method.endLine,
          details: `Function '${method.name}' has ${params.length} parameters (recommended: max 4).`,
        });
      }
    }

    // B. Large Method
    if (methodLoc >= 70) {
      findings.push({
        type: 'large_method',
        severity: methodLoc >= 120 ? 'high' : 'medium',
        functionName: method.name,
        startLine: method.startLine,
        endLine: method.endLine,
        details: `Function '${method.name}' exceeds standard length with ${methodLoc} LOC.`,
      });
    }

    // C. Nesting, Complexity & Bumpy Road analysis
    let maxNesting = 0;
    let currentNesting = 0;
    let cyclomaticComplexity = 1;
    let complexConditionalsCount = 0;

    // For Bumpy Road detection: record nesting depth per line
    const nestingLevels: number[] = [];

    const isPython = lang === 'python';
    let baseIndent = 0;
    if (isPython && methodLines.length > 0) {
      const match = methodLines[0].match(/^\s*/);
      baseIndent = match ? match[0].length : 0;
    }

    for (let i = 0; i < methodLines.length; i++) {
      const line = methodLines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
        nestingLevels.push(currentNesting);
        continue;
      }

      if (isPython) {
        let indent = 0;
        while (indent < line.length && (line.charCodeAt(indent) === 32 || line.charCodeAt(indent) === 9)) {
          indent++;
        }
        currentNesting = Math.max(0, Math.floor((indent - baseIndent) / 4));
      } else {
        // Brace languages: count { and } without regex allocation
        let openBraces = 0;
        let closeBraces = 0;
        for (let c = 0; c < line.length; c++) {
          const ch = line.charCodeAt(c);
          if (ch === 123) openBraces++;       // '{'
          else if (ch === 125) closeBraces++; // '}'
        }
        currentNesting = Math.max(0, currentNesting + openBraces - closeBraces);
      }

      if (currentNesting > maxNesting) {
        maxNesting = currentNesting;
      }
      nestingLevels.push(currentNesting);

      // Branching statements for cyclomatic complexity
      if (
        /\b(if|else\s+if|elif|for|while|switch|case|catch)\b/.test(trimmed) ||
        (trimmed.includes('?') && /\?\s*[^:]+\s*:/.test(trimmed)) // quick ternary pre-check
      ) {
        cyclomaticComplexity++;
      }

      // Complex conditionals (3+ operators or chained && / ||) without regex allocation
      let opCount = 0;
      if (trimmed.includes('&') || trimmed.includes('|')) {
        for (let c = 0; c < trimmed.length - 1; c++) {
          const code = trimmed.charCodeAt(c);
          if (
            (code === 38 && trimmed.charCodeAt(c + 1) === 38) ||
            (code === 124 && trimmed.charCodeAt(c + 1) === 124)
          ) {
            opCount++;
            c++;
          }
        }
      }
      if (opCount >= 2) {
        complexConditionalsCount++;
      }
    }

    // D. Nested Complexity & Deep Nesting
    if (maxNesting >= 4) {
      findings.push({
        type: 'nested_complexity',
        severity: maxNesting >= 5 ? 'high' : 'medium',
        functionName: method.name,
        startLine: method.startLine,
        endLine: method.endLine,
        details: `Function '${method.name}' has a max nesting depth of ${maxNesting} levels (recommended: max 3).`,
      });
    }

    if (maxNesting >= 5) {
      findings.push({
        type: 'deep_nesting',
        severity: maxNesting >= 6 ? 'high' : 'medium',
        functionName: method.name,
        startLine: method.startLine,
        endLine: method.endLine,
        details: `Deep Nesting detected: Maximum control-flow nesting depth of ${maxNesting} levels reached (threshold: 5).`,
      });
    }

    // E. Complex Conditionals
    if (complexConditionalsCount >= 2) {
      findings.push({
        type: 'complex_conditional',
        severity: 'medium',
        functionName: method.name,
        startLine: method.startLine,
        endLine: method.endLine,
        details: `Function '${method.name}' contains ${complexConditionalsCount} complex conditional expressions.`,
      });
    }

    // F. Bumpy Road (Multiple separate sections of nested conditionals)
    let bumps = 0;
    let insideBump = false;
    for (const depth of nestingLevels) {
      if (depth >= 2) {
        if (!insideBump) {
          bumps++;
          insideBump = true;
        }
      } else if (depth <= 1) {
        insideBump = false;
      }
    }

    if (bumps >= 3 && methodLoc >= 30) {
      findings.push({
        type: 'bumpy_road',
        severity: bumps >= 5 ? 'high' : 'medium',
        functionName: method.name,
        startLine: method.startLine,
        endLine: method.endLine,
        details: `Bumpy Road detected: '${method.name}' contains ${bumps} distinct deeply nested sections, indicating fragmented logic.`,
      });
    }

    // G. Brain Method (God Function)
    // Combines high LOC, high cyclomatic complexity, and nesting
    if (methodLoc >= 50 && cyclomaticComplexity >= 8 && maxNesting >= 3) {
      findings.push({
        type: 'brain_method',
        severity: 'high',
        functionName: method.name,
        startLine: method.startLine,
        endLine: method.endLine,
        details: `Brain Method detected: '${method.name}' centralizes excessive complexity (${methodLoc} LOC, CC=${cyclomaticComplexity}, nesting=${maxNesting}).`,
      });
    }

    return findings;
  }
}
