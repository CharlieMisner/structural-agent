import React, { useState, useRef, useEffect } from 'react';
import statikorLogo from '../assets/logo.png';

interface TopNavProps {
  onOpenFolder: () => void;
  onClearChat?: () => void;
  onToggleSidebar?: () => void;
}

type MenuKey = 'File' | 'Edit' | 'View' | 'Window' | 'Help' | null;

export const TopNav: React.FC<TopNavProps> = ({
  onOpenFolder,
  onClearChat,
  onToggleSidebar,
}) => {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (menu: MenuKey) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  const handleMenuHover = (menu: MenuKey) => {
    if (openMenu !== null) {
      setOpenMenu(menu);
    }
  };

  const executeAction = (action: () => void) => {
    action();
    setOpenMenu(null);
  };

  return (
    <header
      ref={menuBarRef}
      className="h-8 bg-[#050d18] border-b border-[#0e2236] flex items-center px-2 select-none shrink-0 text-xs z-50 relative"
    >
      {/* Brand: Logo & Statikor */}
      <div className="flex items-center space-x-2 mr-3 pr-2.5 border-r border-[#0e2236]">
        <img
          src={statikorLogo}
          alt="Statikor"
          className="w-4 h-4 rounded-sm object-contain"
        />
        <span className="font-bold tracking-widest text-hud-text text-xs uppercase font-mono">
          Statikor
        </span>
      </div>

      {/* Desktop App Menu Items */}
      <div className="flex items-center space-x-0.5 font-mono">
        {/* File Menu */}
        <div className="relative">
          <button
            onClick={() => handleMenuClick('File')}
            onMouseEnter={() => handleMenuHover('File')}
            className={`px-2.5 py-0.5 rounded text-hud-text hover:text-[#00c8e6] transition-colors ${
              openMenu === 'File' ? 'bg-[#091f35] text-[#00c8e6]' : 'hover:bg-[#091728]'
            }`}
          >
            File
          </button>
          {openMenu === 'File' && (
            <div className="absolute top-full left-0 mt-0.5 w-52 bg-[#071322] border border-[#0e2236] rounded shadow-2xl py-1 text-hud-text z-50">
              <button
                onClick={() => executeAction(onOpenFolder)}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Open Project Folder...</span>
                <span className="text-[10px] text-[#44596d] font-mono">⌘O</span>
              </button>
              <div className="my-1 border-t border-[#0e2236]" />
              <button
                onClick={() => executeAction(() => window.location.reload())}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Reload Window</span>
                <span className="text-[10px] text-[#44596d] font-mono">⌘R</span>
              </button>
            </div>
          )}
        </div>

        {/* Edit Menu */}
        <div className="relative">
          <button
            onClick={() => handleMenuClick('Edit')}
            onMouseEnter={() => handleMenuHover('Edit')}
            className={`px-2.5 py-0.5 rounded text-hud-text hover:text-[#00c8e6] transition-colors ${
              openMenu === 'Edit' ? 'bg-[#091f35] text-[#00c8e6]' : 'hover:bg-[#091728]'
            }`}
          >
            Edit
          </button>
          {openMenu === 'Edit' && (
            <div className="absolute top-full left-0 mt-0.5 w-44 bg-[#071322] border border-[#0e2236] rounded shadow-2xl py-1 text-hud-text z-50">
              <button
                onClick={() => executeAction(() => document.execCommand('undo'))}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Undo</span>
                <span className="text-[10px] text-[#44596d] font-mono">⌘Z</span>
              </button>
              <button
                onClick={() => executeAction(() => document.execCommand('redo'))}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Redo</span>
                <span className="text-[10px] text-[#44596d] font-mono">⇧⌘Z</span>
              </button>
              <div className="my-1 border-t border-[#0e2236]" />
              <button
                onClick={() => executeAction(() => document.execCommand('cut'))}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Cut</span>
                <span className="text-[10px] text-[#44596d] font-mono">⌘X</span>
              </button>
              <button
                onClick={() => executeAction(() => document.execCommand('copy'))}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Copy</span>
                <span className="text-[10px] text-[#44596d] font-mono">⌘C</span>
              </button>
              <button
                onClick={() => executeAction(() => document.execCommand('paste'))}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Paste</span>
                <span className="text-[10px] text-[#44596d] font-mono">⌘V</span>
              </button>
            </div>
          )}
        </div>

        {/* View Menu */}
        <div className="relative">
          <button
            onClick={() => handleMenuClick('View')}
            onMouseEnter={() => handleMenuHover('View')}
            className={`px-2.5 py-0.5 rounded text-hud-text hover:text-[#00c8e6] transition-colors ${
              openMenu === 'View' ? 'bg-[#091f35] text-[#00c8e6]' : 'hover:bg-[#091728]'
            }`}
          >
            View
          </button>
          {openMenu === 'View' && (
            <div className="absolute top-full left-0 mt-0.5 w-48 bg-[#071322] border border-[#0e2236] rounded shadow-2xl py-1 text-hud-text z-50">
              <button
                onClick={() => executeAction(() => onToggleSidebar && onToggleSidebar())}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Toggle File Tree</span>
                <span className="text-[10px] text-[#44596d] font-mono">⌘B</span>
              </button>
              <button
                onClick={() => executeAction(() => onClearChat && onClearChat())}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Clear Conversation</span>
                <span className="text-[10px] text-[#44596d] font-mono">⌘K</span>
              </button>
            </div>
          )}
        </div>

        {/* Window Menu */}
        <div className="relative">
          <button
            onClick={() => handleMenuClick('Window')}
            onMouseEnter={() => handleMenuHover('Window')}
            className={`px-2.5 py-0.5 rounded text-hud-text hover:text-[#00c8e6] transition-colors ${
              openMenu === 'Window' ? 'bg-[#091f35] text-[#00c8e6]' : 'hover:bg-[#091728]'
            }`}
          >
            Window
          </button>
          {openMenu === 'Window' && (
            <div className="absolute top-full left-0 mt-0.5 w-44 bg-[#071322] border border-[#0e2236] rounded shadow-2xl py-1 text-hud-text z-50">
              <button
                onClick={() => executeAction(() => {})}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Minimize</span>
                <span className="text-[10px] text-[#44596d] font-mono">⌘M</span>
              </button>
              <button
                onClick={() => executeAction(() => {})}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>Zoom</span>
              </button>
            </div>
          )}
        </div>

        {/* Help Menu */}
        <div className="relative">
          <button
            onClick={() => handleMenuClick('Help')}
            onMouseEnter={() => handleMenuHover('Help')}
            className={`px-2.5 py-0.5 rounded text-hud-text hover:text-[#00c8e6] transition-colors ${
              openMenu === 'Help' ? 'bg-[#091f35] text-[#00c8e6]' : 'hover:bg-[#091728]'
            }`}
          >
            Help
          </button>
          {openMenu === 'Help' && (
            <div className="absolute top-full left-0 mt-0.5 w-44 bg-[#071322] border border-[#0e2236] rounded shadow-2xl py-1 text-hud-text z-50">
              <button
                onClick={() => executeAction(() => alert('Statikor v0.1.0\nStructural Engineering Desktop Assistant'))}
                className="w-full text-left px-3 py-1.5 hover:bg-[#00f0ff]/10 hover:text-[#00c8e6] flex items-center justify-between transition-colors"
              >
                <span>About Statikor</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
