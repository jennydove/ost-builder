import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  stripCrLf,
  composeCommentEmail,
} from '../../../../netlify/functions/_emailUtils.mts';

describe('escapeHtml', () => {
  it('escapes the five HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("it's & it works")).toBe('it&#39;s &amp; it works');
  });

  it('does not double-escape ampersands', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('stripCrLf', () => {
  it('collapses CR/LF runs into a single space', () => {
    expect(stripCrLf('foo\r\nBcc: attacker@example.com')).toBe(
      'foo Bcc: attacker@example.com',
    );
    expect(stripCrLf('line1\nline2\rline3')).toBe('line1 line2 line3');
  });

  it('leaves CR-LF-free text alone', () => {
    expect(stripCrLf('plain subject')).toBe('plain subject');
  });
});

describe('composeCommentEmail', () => {
  const base = {
    to: 'owner@example.com',
    from: 'OST <noreply@example.com>',
    commenterName: 'Alice',
    shareName: 'My OST',
    shareId: 'share123',
    body: 'Looks good',
    appUrl: 'https://mozost.netlify.app',
  };

  it('escapes HTML in commenterName and shareName', () => {
    const payload = composeCommentEmail({
      ...base,
      commenterName: '<img src=x onerror=alert(1)>',
      shareName: '<b>bold</b>',
    });
    expect(payload.html).not.toContain('<img src=x');
    expect(payload.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(payload.html).not.toContain('<b>bold</b>');
    expect(payload.html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('escapes HTML in the body preview', () => {
    const payload = composeCommentEmail({
      ...base,
      body: '<script>steal()</script>',
    });
    expect(payload.html).not.toContain('<script>steal()</script>');
    expect(payload.html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
  });

  it('strips CR/LF from the subject to defeat header injection', () => {
    const payload = composeCommentEmail({
      ...base,
      commenterName: 'evil\r\nBcc: attacker@example.com',
    });
    expect(payload.subject).not.toContain('\n');
    expect(payload.subject).not.toContain('\r');
    expect(payload.subject).toContain('Bcc:');
  });

  it('preserves the comment preview text for short bodies', () => {
    const payload = composeCommentEmail({ ...base, body: 'Short comment' });
    expect(payload.html).toContain('Short comment');
    expect(payload.html).not.toContain('View full comment');
  });

  it('truncates body to ~500 chars and adds a "View full comment" link', () => {
    const longBody = 'x'.repeat(600);
    const payload = composeCommentEmail({ ...base, body: longBody });
    expect(payload.html).toContain('View full comment');
    expect(payload.html).toContain('xxxxx…');
    expect(payload.html).not.toContain('x'.repeat(550));
  });

  it('linkifies the share URL using the provided shareId and appUrl', () => {
    const payload = composeCommentEmail({
      ...base,
      shareId: 'abc def',
      appUrl: 'https://mozost.netlify.app',
    });
    expect(payload.html).toContain('https://mozost.netlify.app/s/abc%20def');
  });

  it('renders newlines in body as <br>', () => {
    const payload = composeCommentEmail({ ...base, body: 'line1\nline2' });
    expect(payload.html).toContain('line1<br>line2');
  });
});
