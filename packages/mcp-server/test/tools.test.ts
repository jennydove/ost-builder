import { describe, it, expect, vi } from 'vitest';
import { listTreesTool } from '../src/tools/listTrees.js';
import { getTreeTool } from '../src/tools/getTree.js';
import { getTreeJsonTool } from '../src/tools/getTreeJson.js';
import { createTreeTool } from '../src/tools/createTree.js';
import { updateTreeTool } from '../src/tools/updateTree.js';
import { deleteTreeTool } from '../src/tools/deleteTree.js';
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
    expect(body.items[0].link).toBeUndefined();
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

describe('create_tree', () => {
  it('POSTs /api/trees with body and returns id + full URL', async () => {
    const fetchImpl = mockFetch({ id: 'new-1', link: '/s/new-1' });
    const tool = createTreeTool(AUTH, fetchImpl);
    const result = await tool.handler({
      markdown: '# Tree\n## [Outcome] Goal',
      name: 'Brand new',
      visibility: 'restricted',
    });
    const { url, opts } = lastCall(fetchImpl);
    expect(url).toBe('https://api.example.com/api/trees');
    expect(opts.method).toBe('POST');
    expect((opts.headers as Headers).get('Authorization')).toBe('Bearer ost_pat_test');
    const sentBody = JSON.parse(opts.body as string);
    expect(sentBody.markdown).toBe('# Tree\n## [Outcome] Goal');
    expect(sentBody.name).toBe('Brand new');
    expect(sentBody.visibility).toBe('restricted');
    const body = JSON.parse(result.content[0].text);
    expect(body.id).toBe('new-1');
    expect(body.url).toBe('https://api.example.com/s/new-1');
  });

  it('omits optional fields from the request body when not provided', async () => {
    const fetchImpl = mockFetch({ id: 'new-2', link: '/s/new-2' });
    const tool = createTreeTool(AUTH, fetchImpl);
    await tool.handler({ markdown: '# Min' });
    const { opts } = lastCall(fetchImpl);
    const sentBody = JSON.parse(opts.body as string);
    expect(sentBody).toEqual({ markdown: '# Min' });
  });

  it('returns isError on 401', async () => {
    const fetchImpl = mockFetch({ error: 'Invalid token' }, { status: 401 });
    const tool = createTreeTool(AUTH, fetchImpl);
    const result = await tool.handler({ markdown: '# x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/PAT may be revoked/);
  });
});

describe('update_tree', () => {
  it('PATCHes /api/trees/:id with only the provided fields', async () => {
    const fetchImpl = mockFetch({ id: 's1', visibility: 'link-public', updatedAt: 123 });
    const tool = updateTreeTool(AUTH, fetchImpl);
    const result = await tool.handler({ id: 's1', markdown: '# Updated' });
    const { url, opts } = lastCall(fetchImpl);
    expect(url).toBe('https://api.example.com/api/trees/s1');
    expect(opts.method).toBe('PATCH');
    const sentBody = JSON.parse(opts.body as string);
    expect(sentBody).toEqual({ markdown: '# Updated' });
    const body = JSON.parse(result.content[0].text);
    expect(body.id).toBe('s1');
    expect(body.updatedAt).toBe(123);
  });

  it('rejects updates with no fields provided', async () => {
    const fetchImpl = mockFetch({});
    const tool = updateTreeTool(AUTH, fetchImpl);
    const result = await tool.handler({ id: 's1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No changes specified/);
    // and never hits the network
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });

  it('returns isError on 403 (viewer or editor-without-visibility)', async () => {
    const fetchImpl = mockFetch({ error: 'Forbidden' }, { status: 403 });
    const tool = updateTreeTool(AUTH, fetchImpl);
    const result = await tool.handler({ id: 's1', visibility: 'restricted' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Forbidden');
  });
});

describe('delete_tree', () => {
  it('DELETEs /api/trees/:id and reports success on 204', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const tool = deleteTreeTool(AUTH, fetchImpl);
    const result = await tool.handler({ id: 's1', confirm: true });
    const { url, opts } = lastCall(fetchImpl);
    expect(url).toBe('https://api.example.com/api/trees/s1');
    expect(opts.method).toBe('DELETE');
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Tree s1 deleted.');
  });

  it('returns isError on 403 (non-owner)', async () => {
    const fetchImpl = mockFetch({ error: 'Forbidden' }, { status: 403 });
    const tool = deleteTreeTool(AUTH, fetchImpl);
    const result = await tool.handler({ id: 's1', confirm: true });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Forbidden');
  });
});
