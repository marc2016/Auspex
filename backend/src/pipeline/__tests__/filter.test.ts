import { describe, it, expect } from 'vitest';
import {
  isPathIgnored,
  DEFAULT_IGNORE_PATTERNS,
} from '../stages/03_ast_structure_analyzer';

describe('Ignore Pattern & Lockfile Filtering', () => {
  it('correctly filters lockfiles', () => {
    expect(isPathIgnored('package-lock.json', 'package-lock.json', DEFAULT_IGNORE_PATTERNS)).toBe(
      true
    );
    expect(isPathIgnored('package-lock.json', 'frontend/package-lock.json', DEFAULT_IGNORE_PATTERNS)).toBe(
      true
    );
    expect(isPathIgnored('yarn.lock', 'yarn.lock', DEFAULT_IGNORE_PATTERNS)).toBe(true);
    expect(isPathIgnored('pnpm-lock.yaml', 'pnpm-lock.yaml', DEFAULT_IGNORE_PATTERNS)).toBe(true);
    expect(isPathIgnored('Cargo.lock', 'src/Cargo.lock', DEFAULT_IGNORE_PATTERNS)).toBe(true);
  });

  it('correctly filters minified files and sourcemaps with wildcards', () => {
    expect(isPathIgnored('bundle.min.js', 'dist/bundle.min.js', DEFAULT_IGNORE_PATTERNS)).toBe(
      true
    );
    expect(isPathIgnored('index.js.map', 'dist/index.js.map', DEFAULT_IGNORE_PATTERNS)).toBe(true);
    expect(isPathIgnored('styles.min.css', 'styles.min.css', DEFAULT_IGNORE_PATTERNS)).toBe(true);
  });

  it('correctly filters images, media and fonts', () => {
    expect(isPathIgnored('logo.png', 'public/logo.png', DEFAULT_IGNORE_PATTERNS)).toBe(true);
    expect(isPathIgnored('icon.svg', 'src/assets/icon.svg', DEFAULT_IGNORE_PATTERNS)).toBe(true);
    expect(isPathIgnored('font.woff2', 'assets/font.woff2', DEFAULT_IGNORE_PATTERNS)).toBe(true);
  });

  it('correctly ignores internal directories', () => {
    expect(isPathIgnored('node_modules', 'node_modules', DEFAULT_IGNORE_PATTERNS)).toBe(true);
    expect(isPathIgnored('index.js', 'node_modules/lodash/index.js', DEFAULT_IGNORE_PATTERNS)).toBe(
      true
    );
    expect(isPathIgnored('dist', 'dist', DEFAULT_IGNORE_PATTERNS)).toBe(true);
  });

  it('allows valid source code files', () => {
    expect(isPathIgnored('server.ts', 'src/server.ts', DEFAULT_IGNORE_PATTERNS)).toBe(false);
    expect(isPathIgnored('App.tsx', 'frontend/src/App.tsx', DEFAULT_IGNORE_PATTERNS)).toBe(false);
    expect(isPathIgnored('UserService.java', 'src/main/java/UserService.java', DEFAULT_IGNORE_PATTERNS)).toBe(
      false
    );
    expect(isPathIgnored('package.json', 'package.json', DEFAULT_IGNORE_PATTERNS)).toBe(false);
  });
});
