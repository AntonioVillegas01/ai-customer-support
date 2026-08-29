import { describe, expect, it } from 'vitest';
import { parseHexColor, readableTextColor } from '../src/app/dom';

describe('readableTextColor', () => {
  it('returns white text on dark backgrounds', () => {
    expect(readableTextColor('#1e293b')).toBe('#ffffff');
    expect(readableTextColor('#2563eb')).toBe('#ffffff');
    expect(readableTextColor('000000')).toBe('#ffffff');
  });

  it('returns black text on light backgrounds', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000');
    expect(readableTextColor('#fef9c3')).toBe('#000000');
    expect(readableTextColor('#facc15')).toBe('#000000');
  });

  it('falls back to white for unparseable colors', () => {
    expect(readableTextColor('not-a-color')).toBe('#ffffff');
    expect(readableTextColor('#fff')).toBe('#ffffff');
  });
});

describe('parseHexColor', () => {
  it('parses six-digit hex with or without hash', () => {
    expect(parseHexColor('#2563eb')).toEqual({ r: 37, g: 99, b: 235 });
    expect(parseHexColor('FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('rejects invalid input', () => {
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor('javascript:alert(1)')).toBeNull();
  });
});
