import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

export const UserMenu: React.FC = () => {
  const { isAuthenticated, isLoading, user, loginWithPopup, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setLoginError(null);
    try {
      await loginWithPopup();
    } catch (err) {
      console.error('[Auth0] Sign In failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setLoginError(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  if (isLoading || isSigningIn) {
    return (
      <div className="flex items-center space-x-1 px-2 py-0.5 text-xs text-[#44596d] font-mono">
        <span className="animate-pulse">{isSigningIn ? 'Signing In...' : 'Loading...'}</span>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center space-x-2">
        {loginError && (
          <span className="text-[10px] text-[#ff0055] font-mono max-w-[150px] truncate" title={loginError}>
            {loginError}
          </span>
        )}
        <button
          onClick={handleSignIn}
          className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 text-[#00c8e6] border border-[#00f0ff]/30 transition-colors text-xs font-mono"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Sign In</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        data-testid="user-menu-btn"
        aria-label="User Profile"
        title={user.email || user.name || 'User Profile'}
        className="flex items-center justify-center p-1 rounded hover:bg-[#091728] transition-colors cursor-pointer"
      >
        <div className="w-5 h-5 rounded-full bg-[#00e5a3]/10 border border-[#00e5a3]/40 flex items-center justify-center hover:border-[#00e5a3] transition-colors">
          <UserIcon className="w-3.5 h-3.5 text-[#00e5a3]" />
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-[#071322] border border-[#0e2236] rounded shadow-2xl py-1 text-hud-text z-50 text-xs font-mono">
          <div className="px-3 py-2 border-b border-[#0e2236]">
            {user.email && <p className="font-semibold text-[#ccd8e4] truncate">{user.email}</p>}
            {user.name && user.name !== user.email && (
              <p className="text-[10px] text-[#7e9bb4] truncate mt-0.5">{user.name}</p>
            )}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#ff0055]/10 hover:text-[#ff0055] flex items-center space-x-2 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
};
