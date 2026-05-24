import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_MARKDOWN_BYTES = 256 * 1024; // 256 KB

export type RateLimitConfig = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
};

// Calls the consume_rate_limit() Postgres function (see
// supabase/migrations/0002_rate_limits.sql). On any infra error,
// fails open with a console.warn — we don't want a misconfigured
// rate-limits table to take the API down.
export async function checkRateLimit(
  supabase: SupabaseClient,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_key: config.key,
    p_limit: config.limit,
    p_window_seconds: config.windowSeconds,
  });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    if (error) console.warn('rate_limit_check_failed', error.message);
    return { allowed: true, retryAfter: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row.allowed),
    retryAfter: Number(row.retry_after_seconds ?? 0),
  };
}

export function rateLimitResponse(retryAfter: number): Response {
  return Response.json(
    { error: 'Too many requests', retryAfter },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, retryAfter)) },
    },
  );
}

export type PayloadCheck = { ok: true } | { ok: false; response: Response };

// Byte-counted check (NOT character count — multi-byte chars hit the cap sooner).
export function checkMarkdownSize(markdown: unknown): PayloadCheck {
  if (typeof markdown !== 'string') return { ok: true };
  const bytes = new TextEncoder().encode(markdown).length;
  if (bytes > MAX_MARKDOWN_BYTES) {
    return {
      ok: false,
      response: Response.json(
        {
          error: 'Markdown payload too large',
          bytes,
          maxBytes: MAX_MARKDOWN_BYTES,
        },
        { status: 413 },
      ),
    };
  }
  return { ok: true };
}
