import { describe, expect, it } from 'vitest';
import { isAllowedWidgetMessage } from '../src/embed/embed';

const WIDGET_ORIGIN = 'http://localhost:3002';

describe('isAllowedWidgetMessage', () => {
  it('accepts acs-namespaced messages from the widget origin', () => {
    expect(isAllowedWidgetMessage({ origin: WIDGET_ORIGIN, data: { type: 'acs:close' } }, WIDGET_ORIGIN)).toBe(true);
    expect(isAllowedWidgetMessage({ origin: WIDGET_ORIGIN, data: { type: 'acs:ready' } }, WIDGET_ORIGIN)).toBe(true);
  });

  it('rejects messages from other origins', () => {
    expect(isAllowedWidgetMessage({ origin: 'https://evil.example', data: { type: 'acs:close' } }, WIDGET_ORIGIN)).toBe(false);
    expect(isAllowedWidgetMessage({ origin: 'http://localhost:30022', data: { type: 'acs:close' } }, WIDGET_ORIGIN)).toBe(false);
  });

  it('rejects messages outside the acs namespace or malformed payloads', () => {
    expect(isAllowedWidgetMessage({ origin: WIDGET_ORIGIN, data: { type: 'evil:steal' } }, WIDGET_ORIGIN)).toBe(false);
    expect(isAllowedWidgetMessage({ origin: WIDGET_ORIGIN, data: 'acs:close' }, WIDGET_ORIGIN)).toBe(false);
    expect(isAllowedWidgetMessage({ origin: WIDGET_ORIGIN, data: null }, WIDGET_ORIGIN)).toBe(false);
    expect(isAllowedWidgetMessage({ origin: WIDGET_ORIGIN, data: { type: 42 } }, WIDGET_ORIGIN)).toBe(false);
  });
});
