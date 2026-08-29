import { describe, expect, it } from 'vitest';
import { chunkText, extractText } from './ingestion.service';

describe('ingestion text utilities', () => {
  it('chunks with overlap and strips markdown links', async () => {
    const text = await extractText(Buffer.from('# Title\nRead [docs](https://example.test) now'), 'doc.md');
    expect(text).toContain('Title');
    expect(text).toContain('docs');
    const chunks = chunkText('abcdefghijklmnopqrstuvwxyz', 10, 2);
    expect(chunks.map((c) => c.content)).toEqual(['abcdefghij', 'ijklmnopqr', 'qrstuvwxyz']);
  });
});
