import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { isTauri, invoke } from '@tauri-apps/api/core';

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: Error | null;
  user?: {
    name?: string;
    email?: string;
    picture?: string;
    sub?: string;
  } | null;
  loginWithRedirect: () => Promise<void>;
  loginWithPopup: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: false,
  error: null,
  user: null,
  loginWithRedirect: async () => {},
  loginWithPopup: async () => {},
  logout: async () => {},
  getAccessToken: async () => null,
});

export const useAuth = (): AuthContextType => {
  return useContext(AuthContext);
};

export interface DesktopAuthSession {
  accessToken: string;
  idToken?: string;
  user: {
    name?: string;
    email?: string;
    picture?: string;
    sub?: string;
  };
  expiresAt: number;
}

export function parseJwtPayload(jwt: string): any {
  try {
    const base64Url = jwt.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function parseAuthUrlParams(urlStr: string): { [key: string]: string } {
  const params: { [key: string]: string } = {};
  try {
    const parsed = new URL(urlStr);
    parsed.searchParams.forEach((val, key) => {
      params[key] = val;
    });
    if (parsed.hash && parsed.hash.startsWith('#')) {
      const hashParams = new URLSearchParams(parsed.hash.substring(1));
      hashParams.forEach((val, key) => {
        params[key] = val;
      });
    }
  } catch {
    const hashIdx = urlStr.indexOf('#');
    if (hashIdx !== -1) {
      const hashParams = new URLSearchParams(urlStr.substring(hashIdx + 1));
      hashParams.forEach((val, key) => {
        params[key] = val;
      });
    }
  }
  return params;
}

interface Auth0BridgeProps {
  children: React.ReactNode;
  authError: string | null;
  onClearAuthError: () => void;
  onSetAuthError: (err: string) => void;
}

const Auth0Bridge: React.FC<Auth0BridgeProps> = ({ children, authError, onClearAuthError, onSetAuthError }) => {
  const auth0 = useAuth0();
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [desktopSession, setDesktopSession] = useState<DesktopAuthSession | null>(() => {
    if (typeof window !== 'undefined' && isTauri()) {
      try {
        const saved = localStorage.getItem('statikor_desktop_auth');
        if (saved) {
          const parsed = JSON.parse(saved) as DesktopAuthSession;
          if (parsed.expiresAt > Date.now()) {
            return parsed;
          }
          localStorage.removeItem('statikor_desktop_auth');
        }
      } catch {}
    }
    return null;
  });

  const [browserHandoffEmail, setBrowserHandoffEmail] = useState<string | null>(null);

  const handleDesktopAuthCallback = (callbackUrl: string) => {
    const params = parseAuthUrlParams(callbackUrl);
    if (params.error || params.error_description) {
      const msg = `Auth0 Error: ${params.error_description || params.error}`;
      console.error('[Auth0 Desktop]', msg);
      onSetAuthError(msg);
      return;
    }

    const accessToken = params.access_token;
    const idToken = params.id_token;
    const expiresIn = params.expires_in ? parseInt(params.expires_in, 10) : 86400;
    const state = params.state;

    if (accessToken) {
      let user = null;
      if (idToken) {
        const decoded = parseJwtPayload(idToken);
        if (decoded) {
          user = {
            name: decoded.name || decoded.nickname || decoded.email,
            email: decoded.email,
            picture: decoded.picture,
            sub: decoded.sub,
          };
        }
      }
      const session: DesktopAuthSession = {
        accessToken,
        idToken,
        user: user || { sub: 'auth0_user' },
        expiresAt: Date.now() + expiresIn * 1000,
      };

      // In browser mode (Chrome), relay tokens to local sidecar and server for desktop consumption
      if (!isTauri()) {
        const payload = {
          accessToken,
          idToken,
          user: session.user,
          expiresIn,
        };

        const relayEndpoints = [
          'http://127.0.0.1:41420/api/auth/relay',
          'http://127.0.0.1:8000/api/auth/relay',
        ];
        if (state) {
          relayEndpoints.push(`http://127.0.0.1:41420/api/auth/session/${state}`);
          relayEndpoints.push(`http://127.0.0.1:8000/api/auth/session/${state}`);
        }

        relayEndpoints.forEach((url) => {
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).catch(() => {});
        });

        setBrowserHandoffEmail(session.user?.email || session.user?.name || 'User');
      }

      setDesktopSession(session);
      try {
        localStorage.setItem('statikor_desktop_auth', JSON.stringify(session));
      } catch {}
    }
  };

  useEffect(() => {
    if (isTauri()) {
      let isSubscribed = true;
      let unlistenFn: (() => void) | null = null;

      import('@tauri-apps/api/event').then(({ listen }) => {
        if (!isSubscribed) return;
        listen<string>('auth-callback', (event) => {
          handleDesktopAuthCallback(event.payload);
        }).then((unlisten) => {
          if (!isSubscribed) {
            unlisten();
          } else {
            unlistenFn = unlisten;
          }
        });
      }).catch(() => {});

      return () => {
        isSubscribed = false;
        if (unlistenFn) {
          unlistenFn();
        }
      };
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('access_token')) {
      handleDesktopAuthCallback(window.location.href);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const checkDesktopSessionOnce = async (stateId: string = 'latest'): Promise<boolean> => {
    const candidateUrls = [
      `http://127.0.0.1:41420/api/auth/session/${stateId}`,
      `http://127.0.0.1:8000/api/auth/session/${stateId}`,
    ];

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'ok' && data.session && data.session.accessToken) {
            const sess = data.session;
            const session: DesktopAuthSession = {
              accessToken: sess.accessToken,
              idToken: sess.idToken,
              user: sess.user || { sub: 'auth0_user' },
              expiresAt: Date.now() + (sess.expiresIn || 7200) * 1000,
            };
            setDesktopSession(session);
            try {
              localStorage.setItem('statikor_desktop_auth', JSON.stringify(session));
            } catch {}

            if (isTauri()) {
              try {
                import('@tauri-apps/api/window')
                  .then(({ getCurrentWindow }) => {
                    const win = getCurrentWindow();
                    win.setFocus().catch(() => {});
                    win.unminimize().catch(() => {});
                  })
                  .catch(() => {});
              } catch {}
            }
            return true;
          }
        }
      } catch {}
    }
    return false;
  };

  const pollForDesktopSession = (stateId: string) => {
    let cancelled = false;
    const startTime = Date.now();
    const interval = setInterval(async () => {
      if (cancelled || Date.now() - startTime > 90000) {
        clearInterval(interval);
        return;
      }
      const success = await checkDesktopSessionOnce(stateId);
      if (success) {
        clearInterval(interval);
      }
    }, 1200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  };

  const handleTauriLogin = async () => {
    if (!domain || !clientId) return;
    const nonce = Math.random().toString(36).substring(2);
    const stateId = 'statikor_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const authUrl = `https://${domain}/authorize?client_id=${encodeURIComponent(
      clientId
    )}&response_type=token%20id_token&redirect_uri=${encodeURIComponent(
      window.location.origin
    )}&state=${encodeURIComponent(stateId)}&scope=openid%20profile%20email${
      audience ? `&audience=${encodeURIComponent(audience)}` : ''
    }&nonce=${nonce}`;

    // Start background poll to receive token from browser callback
    pollForDesktopSession(stateId);

    try {
      await invoke('open_browser_url', { url: authUrl });
    } catch (err) {
      console.warn('[Auth0] Tauri open_browser_url failed, falling back to popup:', err);
      await auth0?.loginWithPopup();
    }
  };

  const isDesktopAuthenticated = isTauri() && desktopSession !== null && desktopSession.expiresAt > Date.now();

  const contextValue = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: isDesktopAuthenticated || (auth0?.isAuthenticated ?? false),
      isLoading: auth0?.isLoading ?? false,
      error: auth0?.error || null,
      user: isDesktopAuthenticated
        ? desktopSession!.user
        : auth0?.user
        ? {
            name: auth0.user.name,
            email: auth0.user.email,
            picture: auth0.user.picture,
            sub: auth0.user.sub,
          }
        : null,
      loginWithRedirect: async () => {
        if (isTauri()) {
          await handleTauriLogin();
          return;
        }
        try {
          await auth0?.loginWithRedirect();
        } catch (err) {
          console.error('[Auth0] loginWithRedirect failed:', err);
          throw err;
        }
      },
      loginWithPopup: async () => {
        if (isTauri()) {
          await handleTauriLogin();
          return;
        }
        try {
          await auth0?.loginWithPopup();
        } catch (err) {
          console.error('[Auth0] loginWithPopup failed:', err);
          throw err;
        }
      },
      logout: async () => {
        if (isTauri()) {
          setDesktopSession(null);
          try {
            localStorage.removeItem('statikor_desktop_auth');
          } catch {}
          return;
        }
        await auth0?.logout({
          logoutParams: { returnTo: window.location.origin },
        });
      },
      getAccessToken: async () => {
        if (isTauri() && desktopSession) {
          if (desktopSession.expiresAt > Date.now()) {
            return desktopSession.accessToken;
          }
          setDesktopSession(null);
          try {
            localStorage.removeItem('statikor_desktop_auth');
          } catch {}
          return null;
        }
        try {
          return (await auth0?.getAccessTokenSilently()) ?? null;
        } catch {
          return null;
        }
      },
    }),
    [
      isDesktopAuthenticated,
      desktopSession,
      auth0?.isAuthenticated,
      auth0?.isLoading,
      auth0?.error,
      auth0?.user,
      auth0?.loginWithRedirect,
      auth0?.loginWithPopup,
      auth0?.logout,
      auth0?.getAccessTokenSilently,
      domain,
      clientId,
      audience,
    ]
  );

  if (browserHandoffEmail) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center text-white font-sans p-6 select-none">
        <div className="bg-[#1e1e1e] border border-[#333333] rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-16 h-16 bg-[#00ffaa]/15 text-[#00ffaa] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#00ffaa]/30">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold mb-2 text-white">Signed in to Statikor</h1>
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            Authenticated as <span className="text-[#00ffaa] font-medium">{browserHandoffEmail}</span>. You can safely close this tab and return to the Statikor app.
          </p>
          <button
            onClick={() => window.close()}
            className="w-full bg-[#00ffaa] hover:bg-[#00e699] text-black font-semibold py-2.5 px-4 rounded-xl transition cursor-pointer"
          >
            Close Tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {authError && (
        <div className="bg-[#ff0055]/20 border-b border-[#ff0055]/50 px-4 py-1 text-xs text-[#ff6699] flex justify-between items-center font-mono select-none z-50">
          <span>⚠️ {authError}</span>
          <button onClick={onClearAuthError} className="ml-2 hover:text-white font-bold">
            ✕
          </button>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};

export interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      const errDesc = params.get('error_description');
      if (err || errDesc) {
        const fullMsg = `Auth0 Error: ${errDesc || err}`;
        console.error('[Auth0 Callback Error]', fullMsg);
        setAuthError(fullMsg);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  if (!domain || !clientId) {
    const devContext: AuthContextType = {
      isAuthenticated: false,
      isLoading: false,
      error: null,
      user: null,
      loginWithRedirect: async () => {
        console.info('[Auth0] VITE_AUTH0_DOMAIN or VITE_AUTH0_CLIENT_ID not configured in .env');
      },
      loginWithPopup: async () => {
        console.info('[Auth0] VITE_AUTH0_DOMAIN or VITE_AUTH0_CLIENT_ID not configured in .env');
      },
      logout: async () => {},
      getAccessToken: async () => null,
    };

    return <AuthContext.Provider value={devContext}>{children}</AuthContext.Provider>;
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(audience ? { audience } : {}),
        scope: 'openid profile email',
      }}
      useRefreshTokens={true}
      cacheLocation="localstorage"
    >
      <Auth0Bridge
        authError={authError}
        onClearAuthError={() => setAuthError(null)}
        onSetAuthError={(err) => setAuthError(err)}
      >
        {children}
      </Auth0Bridge>
    </Auth0Provider>
  );
};
