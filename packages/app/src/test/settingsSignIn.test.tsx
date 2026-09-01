import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { getSession, onAuthStateChange, configured } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: () => {} } },
  })),
  configured: { value: true },
}));

vi.mock('@/lib/supabaseClient', () => ({
  get supabaseConfigured() { return configured.value; },
  get supabase() {
    return configured.value
      ? { auth: { getSession, onAuthStateChange, signInWithOAuth: vi.fn() } }
      : null;
  },
}));

import Settings from '@/pages/Settings';

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe('Settings sign-in affordance', () => {
  beforeEach(() => {
    configured.value = true;
    getSession.mockResolvedValue({ data: { session: null } });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('offers sign-in instead of dead-ending when signed out', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText(/sign in to set up ai access/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with email/i })).toBeInTheDocument();
  });

  it('hides the sign-in buttons when Supabase is not configured', async () => {
    // supabase is null in this build; a button that throws on click is worse
    // than no button.
    configured.value = false;

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText(/sign in to set up ai access/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to app/i })).toBeInTheDocument();
  });
});
