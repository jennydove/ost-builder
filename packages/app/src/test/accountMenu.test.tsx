import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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

import { AccountMenuAction } from '@/components/ost/header/actions/AccountMenuAction';

function renderMenu() {
  return render(
    <MemoryRouter>
      <AccountMenuAction />
    </MemoryRouter>,
  );
}

const SESSION = {
  user: { id: 'user-1', email: 'jenny@example.com', user_metadata: {} },
} as unknown as Session;

function emit(event: AuthChangeEvent, session: Session | null) {
  return act(async () => {
    for (const cb of authCallbacks) cb(event, session);
    await Promise.resolve();
  });
}

describe('AccountMenuAction signed-out affordance', () => {
  beforeEach(() => {
    authCallbacks.length = 0;
    getSession.mockResolvedValue({ data: { session: null } });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a labelled "Sign in" button when signed out', async () => {
    renderMenu();

    const button = await screen.findByRole('button', { name: /sign in/i });
    expect(button).toBeInTheDocument();
    // The anonymous avatar menu is not the only way in.
    expect(screen.queryByRole('button', { name: /account menu/i })).not.toBeInTheDocument();
  });

  it('opens the sign-in dialog when the button is clicked', async () => {
    renderMenu();

    fireEvent.click(await screen.findByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /sign in with email/i })).toBeInTheDocument();
  });

  it('shows the avatar account menu when signed in', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { email: 'jenny@example.com', user_metadata: {} } } },
    });

    renderMenu();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it('restores the sign-in button when the user signs out', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION } });
    renderMenu();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
    });

    await emit('SIGNED_OUT', null);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /account menu/i })).not.toBeInTheDocument();
  });
});
