import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StoredShareOpen from '@/pages/TreeOpen';
import * as treeApi from '@/lib/treeApi';

vi.mock('@/lib/treeApi');
vi.mock('@/components/ost/OSTBuilder', () => ({
  OSTBuilder: () => <div data-testid="ost-builder">builder</div>,
}));

describe('StoredShareOpen route', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the OST builder in place on successful load (no redirect)', async () => {
    vi.spyOn(treeApi, 'getTree').mockResolvedValue({
      id: 'abc',
      name: 'My Tree',
      markdown: '# My Tree\n',
      visibility: 'restricted',
      collapsedIds: [],
      createdAt: 0,
      updatedAt: 0,
      role: 'owner',
    });

    render(
      <MemoryRouter initialEntries={['/s/abc']}>
        <Routes>
          <Route path="/s/:id" element={<StoredShareOpen />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ost-builder')).toBeInTheDocument();
    });
  });

  it('shows "Access Denied" on 403', async () => {
    const err = Object.assign(new Error('forbidden'), {
      status: 403,
      payload: { reason: 'forbidden' },
    });
    vi.spyOn(treeApi, 'getTree').mockRejectedValue(err);

    render(
      <MemoryRouter initialEntries={['/s/abc']}>
        <Routes>
          <Route path="/s/:id" element={<StoredShareOpen />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
    });
  });

  it('shows "Private Share" sign-in on 401', async () => {
    const err = Object.assign(new Error('auth required'), { status: 401, payload: {} });
    vi.spyOn(treeApi, 'getTree').mockRejectedValue(err);

    render(
      <MemoryRouter initialEntries={['/s/abc']}>
        <Routes>
          <Route path="/s/:id" element={<StoredShareOpen />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Private Share/i)).toBeInTheDocument();
    });
  });
});
