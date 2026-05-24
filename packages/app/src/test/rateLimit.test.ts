import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkMarkdownSize,
  checkRateLimit,
  MAX_MARKDOWN_BYTES,
  rateLimitResponse,
} from '../../../../netlify/functions/_rateLimit.mts';

function mockSupabase(rpcResult: {
  data: unknown;
  error: { message: string } | null;
}): SupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as unknown as SupabaseClient;
}

describe('checkMarkdownSize', () => {
  it('allows non-string values (validation handles them elsewhere)', () => {
    expect(checkMarkdownSize(undefined)).toEqual({ ok: true });
    expect(checkMarkdownSize(null)).toEqual({ ok: true });
  });

  it('allows small markdown', () => {
    expect(checkMarkdownSize('# Hi').ok).toBe(true);
  });

  it('allows exactly MAX_MARKDOWN_BYTES', () => {
    const exact = 'a'.repeat(MAX_MARKDOWN_BYTES);
    expect(checkMarkdownSize(exact).ok).toBe(true);
  });

  it('rejects payloads above MAX_MARKDOWN_BYTES with 413', async () => {
    const oversized = 'a'.repeat(MAX_MARKDOWN_BYTES + 1);
    const result = checkMarkdownSize(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
      const json = (await result.response.json()) as { bytes: number; maxBytes: number };
      expect(json.bytes).toBe(MAX_MARKDOWN_BYTES + 1);
      expect(json.maxBytes).toBe(MAX_MARKDOWN_BYTES);
    }
  });

  it('counts bytes not characters (rejects multi-byte payload that exceeds limit)', async () => {
    // '😀' is 4 bytes UTF-8; repeat it enough to exceed the byte cap.
    const oversized = '😀'.repeat(MAX_MARKDOWN_BYTES / 4 + 1);
    const result = checkMarkdownSize(oversized);
    expect(result.ok).toBe(false);
  });
});

describe('checkRateLimit', () => {
  it('returns allowed=true when RPC reports allowed', async () => {
    const supabase = mockSupabase({
      data: [{ allowed: true, count: 3, retry_after_seconds: 0 }],
      error: null,
    });
    const result = await checkRateLimit(supabase, { key: 'k', limit: 10, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBe(0);
  });

  it('returns allowed=false with retryAfter when RPC reports denied', async () => {
    const supabase = mockSupabase({
      data: [{ allowed: false, count: 11, retry_after_seconds: 42 }],
      error: null,
    });
    const result = await checkRateLimit(supabase, { key: 'k', limit: 10, windowSeconds: 60 });
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(42);
  });

  it('fails open on RPC error (does not block API on infra failure)', async () => {
    const supabase = mockSupabase({
      data: null,
      error: { message: 'RPC blew up' },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await checkRateLimit(supabase, { key: 'k', limit: 10, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('fails open on empty data', async () => {
    const supabase = mockSupabase({ data: [], error: null });
    const result = await checkRateLimit(supabase, { key: 'k', limit: 10, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
  });

  it('handles RPC returning a single object instead of array', async () => {
    const supabase = mockSupabase({
      data: { allowed: false, count: 11, retry_after_seconds: 12 },
      error: null,
    });
    const result = await checkRateLimit(supabase, { key: 'k', limit: 10, windowSeconds: 60 });
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(12);
  });
});

describe('rateLimitResponse', () => {
  it('returns 429 with Retry-After header', () => {
    const res = rateLimitResponse(30);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
  });

  it('clamps Retry-After to at least 1 second', () => {
    const res = rateLimitResponse(0);
    expect(res.headers.get('Retry-After')).toBe('1');
  });
});
