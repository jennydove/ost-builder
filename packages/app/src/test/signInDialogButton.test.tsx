import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

const { onAuthStateChange, authCallbacks, configured } = vi.hoisted(() => {
  const callbacks: AuthCallback[] = [];
  return {
    authCallbacks: callbacks,
    configured: { value: true },
    onAuthStateChange: vi.fn((cb: AuthCallback) => {
      callbacks.push(cb);
      return { data: { subscription: { unsubscribe: () => {} } } };
    }),
  };
});

vi.mock('@/lib/supabaseClient', () => ({
  get supabaseConfigured() { return configured.value; },
  get supabase() {
    return configured.value
      ? { auth: { onAuthStateChange, getSession: vi.fn(), signInWithOAuth: vi.fn() } }
      : null;
  },
}));

import { SignInDialogButton } from '@/components/auth/SignInDialogButton';

const SESSION = {
  user: { id: 'user-1', email: 'jenny@example.com', user_metadata: {} },
} as unknown as Session;

function emit(event: AuthChangeEvent, session: Session | null) {
  return act(async () => {
    for (const cb of authCallbacks) cb(event, session);
    await Promise.resolve();
  });
}

describe('SignInDialogButton', () => {
  beforeEach(() => {
    authCallbacks.length = 0;
    configured.value = true;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens the sign-in dialog when clicked', async () => {
    render(<SignInDialogButton />);

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });
  });

  it('closes itself once a session arrives, without the parent unmounting it', async () => {
    // Email/password sign-in resolves in place — nothing reloads the page and
    // nothing here unmounts the button, so the dialog has to close itself.
    render(<SignInDialogButton />);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });

    await emit('SIGNED_IN', SESSION);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
    });
  });

  it('stays open on auth events that carry no session', async () => {
    render(<SignInDialogButton />);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });

    await emit('SIGNED_OUT', null);

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('renders nothing when Supabase is not configured', () => {
    configured.value = false;

    const { container } = render(<SignInDialogButton />);

    expect(container).toBeEmptyDOMElement();
    expect(onAuthStateChange).not.toHaveBeenCalled();
  });
});
