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
        className="flex items-center space-x-1.5 px-2 py-0.5 rounded hover:bg-[#091728] text-hud-text hover:text-[#00c8e6] transition-colors text-xs font-mono"
      >
        {user.picture ? (
          <img src={user.picture} alt={user.name || 'User'} className="w-4 h-4 rounded-full" />
        ) : (
          <UserIcon className="w-3.5 h-3.5 text-[#00c8e6]" />
        )}
        <span className="max-w-[120px] truncate">{user.name || user.email || 'Account'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-[#071322] border border-[#0e2236] rounded shadow-2xl py-1 text-hud-text z-50 text-xs font-mono">
          <div className="px-3 py-2 border-b border-[#0e2236]">
            <p className="font-semibold text-[#00c8e6] truncate">{user.name || 'Structural Engineer'}</p>
            {user.email && <p className="text-[10px] text-[#44596d] truncate">{user.email}</p>}
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
