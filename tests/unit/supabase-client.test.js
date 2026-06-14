import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@supabase/supabase-js');
  vi.resetModules();
  vi.unstubAllEnvs();
});

async function importSupabaseClient({
  url = 'https://example.supabase.co',
  key = 'publishable-key',
  getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
} = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', url);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key);

  const createClient = vi.fn(() => ({ auth: { getUser } }));
  vi.doMock('@supabase/supabase-js', () => ({ createClient }));

  const clientModule = await import('../../src/infrastructure/supabase-client.js');
  return { ...clientModule, createClient, getUser };
}

describe('supabase-client', () => {
  it('does not create a client when Supabase env is missing', async () => {
    const { createClient, getCurrentUser, supabase, supabaseConfigured } = await importSupabaseClient({
      url: '',
      key: '',
    });

    expect(supabaseConfigured).toBe(false);
    expect(supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('creates a configured client and returns the authenticated user', async () => {
    const { createClient, getCurrentUser, supabase, supabaseConfigured } = await importSupabaseClient();

    expect(supabaseConfigured).toBe(true);
    expect(supabase).toEqual({ auth: { getUser: expect.any(Function) } });
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'publishable-key');
    await expect(getCurrentUser()).resolves.toEqual({ id: 'user-1' });
  });

  it('returns null when Supabase reports an auth error', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: { message: 'bad token' } });
    const { getCurrentUser } = await importSupabaseClient({ getUser });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('returns null when Supabase auth lookup throws or returns malformed data', async () => {
    const throwingGetUser = vi.fn().mockRejectedValue(new Error('network down'));
    const throwingClient = await importSupabaseClient({ getUser: throwingGetUser });
    await expect(throwingClient.getCurrentUser()).resolves.toBeNull();

    const malformedGetUser = vi.fn().mockResolvedValue({ data: null, error: null });
    const malformedClient = await importSupabaseClient({ getUser: malformedGetUser });
    await expect(malformedClient.getCurrentUser()).resolves.toBeNull();
  });
});
