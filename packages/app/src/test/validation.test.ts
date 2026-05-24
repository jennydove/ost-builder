import { describe, it, expect } from 'vitest';
import {
  CreateShareBodySchema,
  UpdateShareBodySchema,
  CreateCommentBodySchema,
  parseJsonBody,
} from '../../../../netlify/functions/_validation.mts';

describe('CreateShareBodySchema', () => {
  it('accepts a valid minimal payload', () => {
    const r = CreateShareBodySchema.safeParse({ markdown: '# Hi' });
    expect(r.success).toBe(true);
  });

  it('accepts the full set of fields', () => {
    const r = CreateShareBodySchema.safeParse({
      markdown: '# Hi',
      name: 'My OST',
      visibility: 'link-public',
      settings: { layoutDirection: 'vertical' },
      collapsedIds: ['a', 'b'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-string markdown (closes the audit-flagged any-string footgun)', () => {
    const r = CreateShareBodySchema.safeParse({ markdown: 12345 });
    expect(r.success).toBe(false);
  });

  it('rejects invalid visibility', () => {
    const r = CreateShareBodySchema.safeParse({ markdown: '# Hi', visibility: 'evil' });
    expect(r.success).toBe(false);
  });

  it('rejects non-object settings', () => {
    const r = CreateShareBodySchema.safeParse({ markdown: '# Hi', settings: ['evil'] });
    expect(r.success).toBe(false);
  });

  it('rejects unknown extra fields (strict)', () => {
    const r = CreateShareBodySchema.safeParse({ markdown: '# Hi', extra: 'nope' });
    expect(r.success).toBe(false);
  });

  it('rejects non-string collapsedIds entries', () => {
    const r = CreateShareBodySchema.safeParse({ markdown: '# Hi', collapsedIds: [1, 2] });
    expect(r.success).toBe(false);
  });
});

describe('UpdateShareBodySchema', () => {
  it('accepts an empty body (all fields optional)', () => {
    const r = UpdateShareBodySchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts a partial update', () => {
    const r = UpdateShareBodySchema.safeParse({ name: 'Updated' });
    expect(r.success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const r = UpdateShareBodySchema.safeParse({ visibility: 'link-public', injected: true });
    expect(r.success).toBe(false);
  });
});

describe('CreateCommentBodySchema', () => {
  it('accepts a valid comment', () => {
    const r = CreateCommentBodySchema.safeParse({ cardId: 'abc', body: 'hello' });
    expect(r.success).toBe(true);
  });

  it('rejects empty body', () => {
    const r = CreateCommentBodySchema.safeParse({ cardId: 'abc', body: '' });
    expect(r.success).toBe(false);
  });

  it('rejects body > 2000 chars', () => {
    const r = CreateCommentBodySchema.safeParse({
      cardId: 'abc',
      body: 'x'.repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty cardId', () => {
    const r = CreateCommentBodySchema.safeParse({ cardId: '', body: 'hello' });
    expect(r.success).toBe(false);
  });

  it('rejects missing fields', () => {
    const r = CreateCommentBodySchema.safeParse({ cardId: 'abc' });
    expect(r.success).toBe(false);
  });
});

describe('parseJsonBody', () => {
  it('returns 400 on malformed JSON', async () => {
    const req = new Request('https://example.com/api', {
      method: 'POST',
      body: '{not-json',
    });
    const result = await parseJsonBody(req, CreateCommentBodySchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const text = await result.response.text();
      expect(text).toContain('Invalid JSON');
    }
  });

  it('returns 400 with issue path when validation fails', async () => {
    const req = new Request('https://example.com/api', {
      method: 'POST',
      body: JSON.stringify({ cardId: '', body: 'hi' }),
    });
    const result = await parseJsonBody(req, CreateCommentBodySchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const json = (await result.response.json()) as { error: string; issues: { path: string }[] };
      expect(json.error).toBe('Validation failed');
      expect(json.issues.map((i) => i.path)).toContain('cardId');
    }
  });

  it('returns parsed data when validation succeeds', async () => {
    const req = new Request('https://example.com/api', {
      method: 'POST',
      body: JSON.stringify({ cardId: 'abc', body: 'ok' }),
    });
    const result = await parseJsonBody(req, CreateCommentBodySchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ cardId: 'abc', body: 'ok' });
    }
  });
});
