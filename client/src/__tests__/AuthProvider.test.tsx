import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, renderHook, act } from '@testing-library/react';

const mockUseAuth0 = vi.fn();
const mockAuth0Provider = vi.fn(({ children }: any) => <div data-testid="auth0-wrapper">{children}</div>);

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => mockUseAuth0(),
  Auth0Provider: (props: any) => mockAuth0Provider(props),
}));

const mockIsTauri = vi.fn().mockReturnValue(false);
const mockInvoke = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => mockIsTauri(),
  invoke: (cmd: string, args: any) => mockInvoke(cmd, args),
}));

let eventCallback: ((event: any) => void) | null = null;
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_name: string, cb: any) => {
    eventCallback = cb;
    return Promise.resolve(() => {
      eventCallback = null;
    });
  }),
}));

import { AuthProvider, useAuth } from '../auth/AuthProvider';

describe('AuthProvider & useAuth hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    eventCallback = null;
    vi.unstubAllEnvs();
    mockIsTauri.mockReturnValue(false);
    mockUseAuth0.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      loginWithRedirect: vi.fn(),
      loginWithPopup: vi.fn(),
      logout: vi.fn(),
      getAccessTokenSilently: vi.fn().mockResolvedValue(null),
    });
  });

  it('provides dev fallback context when Auth0 environment variables are not set', async () => {
    vi.stubEnv('VITE_AUTH0_DOMAIN', '');
    vi.stubEnv('VITE_AUTH0_CLIENT_ID', '');

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeNull();

    await act(async () => {
      await result.current.loginWithRedirect();
      await result.current.loginWithPopup();
      await result.current.logout();
      const token = await result.current.getAccessToken();
      expect(token).toBeNull();
    });
  });

  it('renders children properly inside AuthProvider', () => {
    vi.stubEnv('VITE_AUTH0_DOMAIN', '');
    vi.stubEnv('VITE_AUTH0_CLIENT_ID', '');

    render(
      <AuthProvider>
        <div data-testid="child">Test Child</div>
      </AuthProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('uses Auth0 SDK in web mode when domain and clientId are configured', async () => {
    vi.stubEnv('VITE_AUTH0_DOMAIN', 'test.auth0.com');
    vi.stubEnv('VITE_AUTH0_CLIENT_ID', 'client123');
    vi.stubEnv('VITE_AUTH0_AUDIENCE', 'https://api.statikor.com');

    const mockLoginWithRedirect = vi.fn();
    const mockLoginWithPopup = vi.fn();
    const mockLogout = vi.fn();
    const mockGetAccessTokenSilently = vi.fn().mockResolvedValue('access_token_123');

    mockUseAuth0.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: {
        name: 'Alice Smith',
        email: 'alice@example.com',
        picture: 'https://example.com/alice.png',
        sub: 'auth0|alice',
      },
      loginWithRedirect: mockLoginWithRedirect,
      loginWithPopup: mockLoginWithPopup,
      logout: mockLogout,
      getAccessTokenSilently: mockGetAccessTokenSilently,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.name).toBe('Alice Smith');
    expect(result.current.user?.email).toBe('alice@example.com');

    await act(async () => {
      await result.current.loginWithRedirect();
      await result.current.loginWithPopup();
      await result.current.logout();
      const token = await result.current.getAccessToken();
      expect(token).toBe('access_token_123');
    });

    expect(mockLoginWithRedirect).toHaveBeenCalled();
    expect(mockLoginWithPopup).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin },
    });

    // Test getAccessToken error fallback
    mockGetAccessTokenSilently.mockRejectedValueOnce(new Error('Silent token error'));
    await act(async () => {
      const errToken = await result.current.getAccessToken();
      expect(errToken).toBeNull();
    });
  });

  it('uses open_browser_url and polling in Tauri desktop mode and falls back to popup on error', async () => {
    mockIsTauri.mockReturnValue(true);
    vi.stubEnv('VITE_AUTH0_DOMAIN', 'test.auth0.com');
    vi.stubEnv('VITE_AUTH0_CLIENT_ID', 'client123');
    vi.stubEnv('VITE_AUTH0_AUDIENCE', 'https://api.statikor.com');

    mockUseAuth0.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      loginWithRedirect: vi.fn(),
      loginWithPopup: vi.fn(),
      logout: vi.fn(),
      getAccessTokenSilently: vi.fn().mockResolvedValue(null),
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await act(async () => {
      await result.current.loginWithPopup();
    });

    expect(mockInvoke).toHaveBeenCalledWith('open_browser_url', expect.objectContaining({
      url: expect.stringContaining('https://test.auth0.com/authorize'),
    }));

    // Test fallback when open_browser_url fails
    mockInvoke.mockRejectedValueOnce(new Error('Browser opener failed'));
    await act(async () => {
      await result.current.loginWithRedirect();
    });

    expect(mockUseAuth0().loginWithPopup).toHaveBeenCalled();
  });

  it('correctly parses JWT payload and URL parameters', async () => {
    const { parseJwtPayload, parseAuthUrlParams } = await import('../auth/AuthProvider');

    // Test parseJwtPayload
    const payload = { sub: 'auth0|123', email: 'test@example.com', name: 'Test User' };
    const base64Payload = btoa(JSON.stringify(payload));
    const fakeJwt = `header.${base64Payload}.signature`;

    expect(parseJwtPayload(fakeJwt)).toEqual(payload);
    expect(parseJwtPayload('invalid_jwt')).toBeNull();

    // Test parseAuthUrlParams with hash
    const urlWithHash = 'http://localhost:1420/#access_token=tok123&id_token=id456&expires_in=3600';
    const parsed = parseAuthUrlParams(urlWithHash);
    expect(parsed.access_token).toBe('tok123');
    expect(parsed.id_token).toBe('id456');
    expect(parsed.expires_in).toBe('3600');

    // Test parseAuthUrlParams with error query
    const urlWithError = 'http://localhost:1420/?error=access_denied&error_description=Denied';
    const parsedErr = parseAuthUrlParams(urlWithError);
    expect(parsedErr.error).toBe('access_denied');
    expect(parsedErr.error_description).toBe('Denied');
  });

  it('restores desktop session from localStorage in Tauri mode', async () => {
    mockIsTauri.mockReturnValue(true);
    vi.stubEnv('VITE_AUTH0_DOMAIN', 'test.auth0.com');
    vi.stubEnv('VITE_AUTH0_CLIENT_ID', 'client123');

    const validSession = {
      accessToken: 'desktop_token_999',
      idToken: 'id_tok',
      user: { name: 'Desktop User', email: 'desk@example.com', sub: 'user_1' },
      expiresAt: Date.now() + 100000,
    };
    localStorage.setItem('statikor_desktop_auth', JSON.stringify(validSession));

    mockUseAuth0.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      loginWithRedirect: vi.fn(),
      loginWithPopup: vi.fn(),
      logout: vi.fn(),
      getAccessTokenSilently: vi.fn().mockResolvedValue(null),
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.name).toBe('Desktop User');
    const token = await result.current.getAccessToken();
    expect(token).toBe('desktop_token_999');

    // Logout clears desktop session
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('statikor_desktop_auth')).toBeNull();
  });

  it('handles auth-callback event with token and sets desktop session', async () => {
    mockIsTauri.mockReturnValue(true);
    vi.stubEnv('VITE_AUTH0_DOMAIN', 'test.auth0.com');
    vi.stubEnv('VITE_AUTH0_CLIENT_ID', 'client123');

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    // Wait for event listener to be registered
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(eventCallback).toBeDefined();

    const fakePayload = { name: 'Callback User', email: 'callback@test.com', sub: 'cb_1' };
    const fakeIdToken = `h.${btoa(JSON.stringify(fakePayload))}.s`;
    const callbackUrl = `http://localhost:1420/#access_token=cb_tok_123&id_token=${fakeIdToken}&expires_in=3600`;

    await act(async () => {
      eventCallback?.({ payload: callbackUrl });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.name).toBe('Callback User');
    expect(result.current.user?.email).toBe('callback@test.com');
    const token = await result.current.getAccessToken();
    expect(token).toBe('cb_tok_123');

    // Test callback error
    const errCallbackUrl = 'http://localhost:1420/?error=unauthorized&error_description=Access+denied';
    await act(async () => {
      eventCallback?.({ payload: errCallbackUrl });
    });
  });

  it('renders auth error banner from URL and allows dismissing it', async () => {
    vi.stubEnv('VITE_AUTH0_DOMAIN', 'test.auth0.com');
    vi.stubEnv('VITE_AUTH0_CLIENT_ID', 'client123');

    window.history.pushState({}, '', '/?error=access_denied&error_description=User+cancelled');

    render(
      <AuthProvider>
        <div data-testid="app-content">App Body</div>
      </AuthProvider>
    );

    expect(screen.getByText(/User cancelled/i)).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: '✕' });
    await act(async () => {
      closeBtn.click();
    });

    expect(screen.queryByText(/User cancelled/i)).not.toBeInTheDocument();
  });

  it('renders browser handoff success UI when redirected with statikor_ state in browser', async () => {
    mockIsTauri.mockReturnValue(false);
    vi.stubEnv('VITE_AUTH0_DOMAIN', 'test.auth0.com');
    vi.stubEnv('VITE_AUTH0_CLIENT_ID', 'client123');

    const fakePayload = { email: 'charlie@gmail.com', name: 'Charlie' };
    const fakeIdToken = `h.${btoa(JSON.stringify(fakePayload))}.s`;

    window.history.pushState(
      {},
      '',
      `/#access_token=tok_browser_1&id_token=${fakeIdToken}&state=statikor_xyz_123`
    );

    render(
      <AuthProvider>
        <div data-testid="app-content">App Body</div>
      </AuthProvider>
    );

    expect(screen.getByText(/Signed in to Statikor/i)).toBeInTheDocument();
    expect(screen.getByText(/charlie@gmail.com/i)).toBeInTheDocument();

    const closeMock = vi.fn();
    window.close = closeMock;

    const closeTabBtn = screen.getByRole('button', { name: /Close Tab/i });
    expect(closeTabBtn).toBeInTheDocument();
    closeTabBtn.click();
    expect(closeMock).toHaveBeenCalled();
  });
});
