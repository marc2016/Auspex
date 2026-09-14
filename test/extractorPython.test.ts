import { describe, it, expect } from 'vitest';
import { PythonExtractor } from '../src/analyzer/extractors/PythonExtractor';

describe('PythonExtractor', () => {
  const extractor = new PythonExtractor();

  it('supports python', () => {
    expect(extractor.supportedLanguages).toEqual(['python']);
  });

  it('extracts Python classes and methods by indentation', () => {
    const lines = [
      'class DataPipeline:',
      '    """Main pipeline for ingestion."""',
      '',
      '    def __init__(self, config):',
      '        self.config = config',
      '',
      '    def process_records(self, records):',
      '        results = []',
      '        for r in records:',
      '            results.append(r)',
      '        return results',
      '',
      'def standalone_helper(x):',
      '    return x + 1',
    ];

    const { classes, methods } = extractor.extractStructures(lines, 'python');

    expect(classes).toHaveLength(1);
    expect(classes[0].name).toBe('DataPipeline');
    expect(classes[0].methods.map((m) => m.name)).toEqual([
      '__init__()',
      'process_records()',
    ]);

    expect(methods.map((m) => m.name)).toEqual([
      '__init__()',
      'process_records()',
      'standalone_helper()',
    ]);
  });

  it('handles async def functions and multiple classes', () => {
    const lines = [
      'class AsyncService:',
      '    async def fetch_data(self, url):',
      '        return await fetch(url)',
      '',
      'class Worker:',
      '    def run(self):',
      '        pass',
      '',
      'async def run_server():',
      '    pass',
    ];

    const { classes, methods } = extractor.extractStructures(lines, 'python');

    expect(classes).toHaveLength(2);
    expect(classes[0].name).toBe('AsyncService');
    expect(classes[1].name).toBe('Worker');

    expect(classes[0].methods.map((m) => m.name)).toEqual(['fetch_data()']);
    expect(classes[1].methods.map((m) => m.name)).toEqual(['run()']);

    expect(methods.map((m) => m.name)).toEqual([
      'fetch_data()',
      'run()',
      'run_server()',
    ]);
  });

  it('correctly calculates method end lines when comments or blank lines follow', () => {
    const lines = [
      'def compute():',
      '    total = 0',
      '    # comment in body',
      '    total += 10',
      '    return total',
      '',
      '',
      '# Trailing comment outside',
      'def next_func():',
      '    pass',
    ];

    const { methods } = extractor.extractStructures(lines, 'python');
    expect(methods).toHaveLength(2);
    expect(methods[0].name).toBe('compute()');
    expect(methods[0].startLine).toBe(1);
    expect(methods[0].endLine).toBe(8);
    expect(methods[1].name).toBe('next_func()');
  });
});
