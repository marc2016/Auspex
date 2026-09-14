import { describe, it, expect } from 'vitest';
import { GenericBraceExtractor } from '../src/analyzer/extractors/GenericBraceExtractor';

describe('GenericBraceExtractor', () => {
  const extractor = new GenericBraceExtractor();

  it('supports java, csharp, go, rust, c, and cpp', () => {
    expect(extractor.supportedLanguages).toEqual(
      expect.arrayContaining(['java', 'csharp', 'go', 'rust', 'c', 'cpp'])
    );
  });

  describe('Namespace / Package Extraction', () => {
    it('extracts Java package declaration', () => {
      const lines = [
        '// Header comment',
        'package com.example.service;',
        '',
        'public class ExampleService {}',
      ];
      expect(extractor.extractNamespace(lines)).toBe('com.example.service');
    });

    it('extracts C# namespace declaration', () => {
      const lines = [
        'using System;',
        'namespace Company.Product.Feature',
        '{',
        '    public class Worker {}',
        '}',
      ];
      expect(extractor.extractNamespace(lines)).toBe('Company.Product.Feature');
    });

    it('extracts Go package declaration', () => {
      const lines = [
        '// Package auth handles authentication',
        'package auth',
        '',
        'func Login() {}',
      ];
      expect(extractor.extractNamespace(lines)).toBe('auth');
    });

    it('returns undefined when no package or namespace is present', () => {
      const lines = ['int main() { return 0; }'];
      expect(extractor.extractNamespace(lines)).toBeUndefined();
    });
  });

  describe('Java Structure Extraction', () => {
    it('extracts Java classes, interfaces, and methods', () => {
      const lines = [
        'package com.auspex;',
        '',
        'public class PaymentProcessor {',
        '    private int retryCount;',
        '',
        '    public PaymentProcessor() {',
        '        this.retryCount = 3;',
        '    }',
        '',
        '    public boolean processTransaction(String account, double amount) {',
        '        if (amount <= 0) return false;',
        '        return true;',
        '    }',
        '}',
      ];

      const { classes, methods } = extractor.extractStructures(lines, 'java');

      expect(classes).toHaveLength(1);
      expect(classes[0].name).toBe('PaymentProcessor');
      expect(classes[0].methods).toHaveLength(2);
      expect(classes[0].methods.map((m) => m.name)).toContain('processTransaction()');

      expect(methods).toHaveLength(2);
      expect(methods.map((m) => m.name)).toContain('processTransaction()');
    });

    it('extracts Java records and interfaces', () => {
      const lines = [
        'public interface DataService {',
        '    void sync();',
        '}',
        'public record UserDto(String id, String name) {',
        '    public String displayName() {',
        '        return name.toUpperCase();',
        '    }',
        '}',
      ];

      const { classes, methods } = extractor.extractStructures(lines, 'java');
      expect(classes.map((c) => c.name)).toContain('DataService');
      expect(classes.map((c) => c.name)).toContain('UserDto');
      expect(methods.map((m) => m.name)).toContain('displayName()');
    });
  });

  describe('C# Structure Extraction', () => {
    it('extracts C# classes, methods, and virtual/override members', () => {
      const lines = [
        'namespace App {',
        '    public class BaseHandler {',
        '        public virtual void HandleRequest() {',
        '            Console.WriteLine("Handling");',
        '        }',
        '    }',
        '    public class CustomHandler : BaseHandler {',
        '        public override void HandleRequest() {',
        '            base.HandleRequest();',
        '        }',
        '        public async Task<int> CalculateAsync() {',
        '            return await Task.FromResult(42);',
        '        }',
        '    }',
        '}',
      ];

      const { classes, methods } = extractor.extractStructures(lines, 'csharp');
      expect(classes).toHaveLength(2);
      expect(classes[0].name).toBe('BaseHandler');
      expect(classes[1].name).toBe('CustomHandler');

      const customHandler = classes.find((c) => c.name === 'CustomHandler');
      expect(customHandler?.methods.map((m) => m.name)).toEqual([
        'HandleRequest()',
        'CalculateAsync()',
      ]);
      expect(methods.length).toBe(3);
    });
  });

  describe('Go Structure Extraction', () => {
    it('extracts Go standalone functions and method receivers', () => {
      const lines = [
        'package main',
        '',
        'func StandaloneHelper(x int) int {',
        '    return x * 2',
        '}',
        '',
        'func (s *Server) StartListening(port int) error {',
        '    return nil',
        '}',
      ];

      const { methods } = extractor.extractStructures(lines, 'go');
      expect(methods.map((m) => m.name)).toEqual([
        'StandaloneHelper()',
        'StartListening()',
      ]);
    });
  });

  describe('Rust Structure Extraction', () => {
    it('extracts Rust fn and pub async fn definitions', () => {
      const lines = [
        'pub struct Router {',
        '    routes: Vec<String>,',
        '}',
        '',
        'impl Router {',
        '    pub async fn dispatch(&self, path: &str) -> bool {',
        '        path == "/"',
        '    }',
        '}',
        '',
        'fn helper() {',
        '    println!("hello");',
        '}',
      ];

      const { classes, methods } = extractor.extractStructures(lines, 'rust');
      expect(classes).toHaveLength(1);
      expect(classes[0].name).toBe('Router');
      expect(methods.map((m) => m.name)).toContain('dispatch()');
      expect(methods.map((m) => m.name)).toContain('helper()');
    });
  });

  describe('C / C++ Structure Extraction', () => {
    it('extracts C and C++ functions', () => {
      const lines = [
        '#include <stdio.h>',
        '',
        'int calculate_checksum(const char* buffer, int len) {',
        '    int sum = 0;',
        '    for (int i = 0; i < len; i++) { sum += buffer[i]; }',
        '    return sum;',
        '}',
        '',
        'void execute_job() {',
        '    printf("Done\\n");',
        '}',
      ];

      const { methods } = extractor.extractStructures(lines, 'c');
      expect(methods.map((m) => m.name)).toEqual([
        'calculate_checksum()',
        'execute_job()',
      ]);
    });
  });
});
