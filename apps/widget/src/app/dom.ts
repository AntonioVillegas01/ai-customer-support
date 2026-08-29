/** DOM helpers: safe rendering and accessible color handling. */

/** All customer/AI content is rendered via textContent — never innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * WCAG-aware text color for a configurable brand background:
 * picks black/white by relative luminance contrast (4.5:1 target).
 */
export function readableTextColor(background: string): '#000000' | '#ffffff' {
  const rgb = parseHexColor(background);
  if (rgb === null) return '#ffffff';
  const luminance = relativeLuminance(rgb);
  const contrastWhite = 1.05 / (luminance + 0.05);
  const contrastBlack = (luminance + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? '#ffffff' : '#000000';
}

export function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  const hex = match?.[1];
  if (hex === undefined) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}
