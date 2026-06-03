import { describe, it, expect, vi } from 'vitest';
import { listTreesTool } from '../src/tools/listTrees.js';
import { getTreeTool } from '../src/tools/getTree.js';
import { getTreeJsonTool } from '../src/tools/getTreeJson.js';
import type { ResolvedAuth } from '../src/auth.js';

const AUTH: ResolvedAuth = { token: 'ost_pat_test', apiBase: 'https://api.example.com' };

function mockFetch(body: unknown, init: { status?: number; errorBody?: unknown } = {}) {
  return vi.fn(async (url: RequestInfo | URL, opts?: RequestInit) => {
    const status = init.status ?? 200;
    const responseBody = status >= 400 ? init.errorBody ?? body : body;
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function lastCall(spy: typeof fetch): { url: string; opts: RequestInit } {
  // vi.fn was upcast — read via the underlying mock
  const calls = (spy as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }).mock.calls;
  const [url, opts] = calls[calls.length - 1];
  return { url: typeof url === 'string' ? url : url.toString(), opts: opts ?? {} };
}

describe('list_trees', () => {
  it('GETs /api/trees with Bearer token and returns items with url', async () => {
    const fetchImpl = mockFetch({
      items: [
        { id: 's1', name: 'One', visibility: 'link-public', createdAt: 1, updatedAt: 2, link: '/s/s1' },
      ],
      page: 1,
      pageSize: 50,
      total: 1,
    });
    const tool = listTreesTool(AUTH, fetchImpl);
    const result = await tool.handler();
    const { url, opts } = lastCall(fetchImpl);
    expect(url).toBe('https://api.example.com/api/trees');
    expect((opts.headers as Headers).get('Authorization')).toBe('Bearer ost_pat_test');
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].url).toBe('https://api.example.com/s/s1');
  });

  it('returns isError on 401', async () => {
    const fetchImpl = mockFetch({ error: 'Invalid token' }, { status: 401 });
    const tool = listTreesTool(AUTH, fetchImpl);
    const result = await tool.handler();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/PAT may be revoked/);
  });

  it('returns isError with upstream message on other errors', async () => {
    const fetchImpl = mockFetch({ error: 'Rate limited' }, { status: 429 });
    const tool = listTreesTool(AUTH, fetchImpl);
    const result = await tool.handler();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Rate limited');
  });
});

describe('get_tree', () => {
  it('GETs /api/trees/:id with encoded id and returns full payload', async () => {
    const payload = {
      id: 'abc 123',
      name: 'My Tree',
      markdown: '# Tree\n## [Outcome] Goal\n',
      visibility: 'link-public',
      settings: null,
      collapsedIds: [],
      createdAt: 1,
      updatedAt: 2,
      role: 'owner',
    };
    const fetchImpl = mockFetch(payload);
    const tool = getTreeTool(AUTH, fetchImpl);
    const result = await tool.handler({ id: 'abc 123' });
    const { url } = lastCall(fetchImpl);
    expect(url).toBe('https://api.example.com/api/trees/abc%20123');
    const body = JSON.parse(result.content[0].text);
    expect(body.markdown).toBe(payload.markdown);
    expect(body.role).toBe('owner');
  });

  it('returns isError on 404', async () => {
    const fetchImpl = mockFetch({ error: 'Not found' }, { status: 404 });
    const tool = getTreeTool(AUTH, fetchImpl);
    const result = await tool.handler({ id: 'missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Not found');
  });
});

describe('get_tree_json', () => {
  it('parses markdown to OSTTree with typed cards', async () => {
    const markdown = [
      '# My Tree',
      '## [Outcome] Increase activation',
      'Goal description',
      '### [Opportunity] Onboarding friction',
      '#### [Solution] Add tooltip',
      '##### [Experiment] A/B tooltip variant',
    ].join('\n');
    const fetchImpl = mockFetch({
      id: 's1',
      name: 'My Tree',
      markdown,
      visibility: 'link-public',
      role: 'owner',
    });
    const tool = getTreeJsonTool(AUTH, fetchImpl);
    const result = await tool.handler({ id: 's1' });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.id).toBe('s1');
    expect(body.tree).toBeDefined();
    expect(body.tree.cards).toBeDefined();
    const cards = Object.values(body.tree.cards) as Array<{ type: string }>;
    const types = new Set(cards.map((c) => c.type));
    expect(types.has('outcome')).toBe(true);
    expect(types.has('opportunity')).toBe(true);
    expect(types.has('solution')).toBe(true);
    expect(types.has('experiment')).toBe(true);
  });

  it('returns isError on 401', async () => {
    const fetchImpl = mockFetch({ error: 'Sign in to view' }, { status: 401 });
    const tool = getTreeJsonTool(AUTH, fetchImpl);
    const result = await tool.handler({ id: 's1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/PAT may be revoked/);
  });
});
