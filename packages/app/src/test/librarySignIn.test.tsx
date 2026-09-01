import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

const { getSession, onAuthStateChange, authCallbacks } = vi.hoisted(() => {
  const callbacks: AuthCallback[] = [];
  return {
    authCallbacks: callbacks,
    getSession: vi.fn(),
    onAuthStateChange: vi.fn((cb: AuthCallback) => {
      callbacks.push(cb);
      return { data: { subscription: { unsubscribe: () => {} } } };
    }),
  };
});

vi.mock('@/lib/supabaseClient', () => ({
  supabaseConfigured: true,
  supabase: { auth: { getSession, onAuthStateChange, signInWithOAuth: vi.fn() } },
}));
vi.mock('@/lib/treeApi', () => ({
  listTrees: vi.fn(async () => ({ items: [] })),
  getTree: vi.fn(),
  deleteTree: vi.fn(),
}));

import Library from '@/pages/Library';
import { listTrees } from '@/lib/treeApi';

const SESSION = {
  user: { id: 'user-1', email: 'jenny@example.com', user_metadata: {} },
} as unknown as Session;

function emit(event: AuthChangeEvent, session: Session | null) {
  return act(async () => {
    for (const cb of authCallbacks) cb(event, session);
    // The handler defers its reload with setTimeout(0); let it run and settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderLibrary() {
  return render(
    <MemoryRouter>
      <Library />
    </MemoryRouter>,
  );
}

describe('Library sign-in affordance', () => {
  beforeEach(() => {
    window.localStorage.clear();
    authCallbacks.length = 0;
    getSession.mockResolvedValue({ data: { session: null } });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('offers a sign-in button when signed out', async () => {
    renderLibrary();

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in to sync to cloud/i)).toBeInTheDocument();
  });

  it('loads the cloud library exactly once on mount despite the INITIAL_SESSION event', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION } });

    renderLibrary();
    await waitFor(() => expect(screen.getByText(/signed in as/i)).toBeInTheDocument());

    // auth-js replays INITIAL_SESSION to every new subscriber.
    await emit('INITIAL_SESSION', SESSION);

    expect(listTrees).toHaveBeenCalledTimes(1);
  });

  it('does not blank the page when the same session is re-emitted (tab refocus, token refresh)', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION } });

    renderLibrary();
    await waitFor(() => expect(screen.getByText(/signed in as/i)).toBeInTheDocument());
    await emit('INITIAL_SESSION', SESSION);

    // Hidden -> visible re-emits SIGNED_IN with the existing session; the
    // hourly autorefresh emits TOKEN_REFRESHED. Neither is a new sign-in.
    await emit('SIGNED_IN', SESSION);
    await emit('TOKEN_REFRESHED', SESSION);

    expect(screen.queryByText(/loading library/i)).not.toBeInTheDocument();
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    expect(listTrees).toHaveBeenCalledTimes(1);
  });

  it('drops the signed-in chrome and restores the sign-in button on sign-out', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION } });

    renderLibrary();
    await waitFor(() => expect(screen.getByText(/signed in as/i)).toBeInTheDocument());
    await emit('INITIAL_SESSION', SESSION);

    getSession.mockResolvedValue({ data: { session: null } });
    await emit('SIGNED_OUT', null);

    await waitFor(() => {
      expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('picks up the cloud library when a user signs in on the page', async () => {
    renderLibrary();
    await screen.findByRole('button', { name: /sign in/i });

    getSession.mockResolvedValue({ data: { session: SESSION } });
    await emit('SIGNED_IN', SESSION);

    await waitFor(() => expect(screen.getByText(/signed in as/i)).toBeInTheDocument());
    expect(listTrees).toHaveBeenCalledTimes(1);
  });
});
