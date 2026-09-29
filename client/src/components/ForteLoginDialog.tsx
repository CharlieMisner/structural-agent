import React, { useState, useEffect } from 'react';
import { X, Lock, KeyRound, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { ToolConfig } from '../types/fs';

interface ForteLoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string | null;
  initialUsername?: string;
  onSuccess: (tool: ToolConfig) => void;
}

interface ForteAuthResult {
  access_token?: string;
  accessToken?: string;
  token_type?: string;
  tokenType?: string;
  expires_in?: number;
  expiresIn?: number;
  username?: string;
  userName?: string;
}

export const ForteLoginDialog: React.FC<ForteLoginDialogProps> = ({
  isOpen,
  onClose,
  projectPath,
  initialUsername = '',
  onSuccess,
}) => {
  const [username, setUsername] = useState<string>(initialUsername);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUsername(initialUsername);
      setPassword('');
      setErrorMessage(null);
      setIsLoading(false);
    }
  }, [isOpen, initialUsername]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setErrorMessage('Please enter both your Forte User Name and Password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      let authResult: ForteAuthResult;

      if (isTauri()) {
        authResult = await invoke<ForteAuthResult>('authenticate_forteweb', {
          username: cleanUser,
          password,
        });
      } else {
        const res = await fetch('http://127.0.0.1:41420/api/tools/forte/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cleanUser, password }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ detail: 'Authentication failed' }));
          throw new Error(errData.detail || 'Authentication failed');
        }
        authResult = await res.json();
      }

      const token = authResult.access_token || authResult.accessToken;
      if (!token) {
        console.error('Forte Auth Result missing access token:', authResult);
        throw new Error('No access token received from Forte server.');
      }

      // 1. Calculate expiration (default 24h if missing)
      const expiresInSec = authResult.expires_in ?? authResult.expiresIn ?? 86400;
      const tokenExpiresAt = Date.now() + expiresInSec * 1000;
      const authedUsername = authResult.username ?? authResult.userName ?? cleanUser;

      // 2. Store access token into OS Keychain
      if (isTauri()) {
        await invoke('store_keychain_secret', {
          service: 'com.statikor.forteweb',
          account: authedUsername,
          secret: token,
        }).catch((err) => {
          console.warn('Keychain save warning:', err);
        });
      }

      // 3. Build tool metadata (without the raw secret token)
      const toolConfig: ToolConfig = {
        id: 'forteweb',
        name: 'ForteWEB',
        authenticated: true,
        username: authedUsername,
        tokenExpiresAt,
        addedAt: Date.now(),
      };

      // 4. Update project.json if a project is loaded
      if (projectPath) {
        if (isTauri()) {
          await invoke('save_project_tool', {
            projectPath,
            tool: toolConfig,
          });
        } else {
          await fetch('http://127.0.0.1:41420/api/project/tool/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath, tool: toolConfig }),
          });
        }
      }

      onSuccess(toolConfig);
      onClose();
    } catch (err: unknown) {
      console.error('Forte authentication error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => {
        if (!isLoading) onClose();
      }}
    >
      <div
        className="w-full max-w-md bg-[#050d18] border border-[#00c8e6]/40 rounded-xl shadow-[0_0_30px_rgba(0,200,230,0.15)] overflow-hidden flex flex-col text-hud-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 px-4 border-b border-[#0e2236] flex items-center justify-between bg-[#03070d] shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded bg-[#00c8e6]/10 border border-[#00c8e6]/30 flex items-center justify-center text-[#00c8e6]">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold font-mono text-hud-text tracking-wider uppercase">
                Sign into ForteWEB
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded text-[#546b82] hover:text-white hover:bg-[#0e2236] transition-colors disabled:opacity-50"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col space-y-4">
          <p className="text-[11px] text-[#71879c] font-mono leading-relaxed">
            Sign into your Weyerhaeuser ForteWEB account to authenticate this project.
          </p>

          {errorMessage && (
            <div className="p-2.5 rounded bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-mono flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {/* Forte User Name */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono font-medium text-hud-text">
              Forte User Name
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              placeholder="e.g. engineer@company.com"
              autoFocus
              className="w-full bg-[#071322] border border-[#0e2840] focus:border-[#00c8e6] focus:shadow-[0_0_8px_rgba(0,200,230,0.3)] rounded px-3 py-1.5 text-xs font-mono text-hud-text outline-none transition-all placeholder-[#3b4f63]"
            />
          </div>

          {/* Forte Password */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono font-medium text-hud-text">
              Forte Password
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                placeholder="••••••••••••"
                className="w-full bg-[#071322] border border-[#0e2840] focus:border-[#00c8e6] focus:shadow-[0_0_8px_rgba(0,200,230,0.3)] rounded px-3 py-1.5 pr-9 text-xs font-mono text-hud-text outline-none transition-all placeholder-[#3b4f63]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 text-[#546b82] hover:text-[#00c8e6] transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Keychain Note */}
          <div className="flex items-center space-x-1.5 text-[10px] text-[#4a6177] font-mono">
            <KeyRound className="w-3 h-3 text-[#00c8e6]/70 shrink-0" />
            <span>Credentials are authenticated via OAuth and stored in your OS Keychain.</span>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-[#0e2236]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-3 py-1.5 rounded text-xs font-mono text-[#71879c] hover:text-white hover:bg-[#0e2236] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-[#00c8e6] hover:bg-[#00e5ff] text-[#03070d] text-xs font-mono font-semibold transition-all shadow-[0_0_12px_rgba(0,200,230,0.3)] disabled:opacity-50"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isLoading ? 'Signing In...' : 'Sign In'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
