import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadingOverlay, CanvasMessage } from '../webview/src/components/LoadingOverlay';
import { CallDiagramViewer } from '../webview/src/components/CallDiagramViewer';
import { WEBVIEW_STRINGS } from '../webview/src/i18n';

const en = WEBVIEW_STRINGS.en.callDiagram;
const de = WEBVIEW_STRINGS.de.callDiagram;

/** Visible text of the markup (without tags, inline styles and the style element). */
const textOf = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');

describe('LoadingOverlay', () => {
  it('shows step 3 with the function count and no percentage', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoadingOverlay, { step: 3, stepText: en.stageLayout, functionCount: 3000, startedAt: Date.now(), strings: en })
    );
    expect(html).toContain('Step 3 of 3');
    expect(html).toContain(en.stageLayout);
    expect(html).toContain('3,000 functions');
    expect(html).toContain('Elapsed: 0 s');
    expect(textOf(html)).not.toContain('%');
  });

  it('uses the German number format and labels', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoadingOverlay, { step: 3, stepText: de.stageLayout, functionCount: 3000, startedAt: Date.now(), strings: de })
    );
    expect(html).toContain('Schritt 3 von 3');
    expect(html).toContain('3.000 Funktionen');
    expect(html).toContain('Laufzeit: 0 s');
  });

  it('shows no function count in step 1', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoadingOverlay, { step: 1, stepText: en.waiting, startedAt: Date.now(), strings: en })
    );
    expect(html).toContain('Step 1 of 3');
    expect(html).toContain(en.waiting);
    expect(textOf(html)).not.toMatch(/functions?\b/);
  });

  it('counts the elapsed time from the start of the load', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoadingOverlay, { step: 3, stepText: en.stageLayout, startedAt: Date.now() - 65_000, strings: en })
    );
    expect(html).toContain('Elapsed: 1:05 min');
  });

  it('does not block the mouse and dims only when asked to', () => {
    const plain = renderToStaticMarkup(
      React.createElement(LoadingOverlay, { step: 2, stepText: en.stageModel, startedAt: Date.now(), strings: en })
    );
    expect(plain).toContain('pointer-events:none');
    expect(plain).not.toContain('opacity:0.6');
    expect(plain).toContain('prefers-reduced-motion');
  });

  it('stays hidden until the delay has passed', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoadingOverlay, { step: 3, stepText: en.stageLayout, startedAt: Date.now(), delayMs: 300, dim: true, strings: en })
    );
    expect(html).toBe('');
  });
});

describe('CanvasMessage', () => {
  it('renders the message without blocking the mouse', () => {
    const html = renderToStaticMarkup(React.createElement(CanvasMessage, null, en.empty));
    expect(html).toContain(en.empty);
    expect(html).toContain('pointer-events:none');
  });
});

describe('CallDiagramViewer without data', () => {
  const vscode = { postMessage: () => {}, getState: () => undefined, setState: () => {} };

  it('shows step 1 in the canvas and not the empty state', () => {
    const html = renderToStaticMarkup(React.createElement(CallDiagramViewer, { language: 'en', vscode: vscode as never }));
    expect(html).toContain('Step 1 of 3');
    expect(html).toContain(en.waiting);
    expect(html).not.toContain(en.empty);
    // the indicator sits inside the canvas, after the svg
    expect(html.indexOf('Step 1 of 3')).toBeGreaterThan(html.indexOf('<svg'));
  });
});
