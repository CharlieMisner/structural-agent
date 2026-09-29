import React, { useState, useRef, useEffect } from 'react';
import {
  Folder16,
  FolderOpen16,
  FileGeneric16,
  FileAssembly16,
  FileDocument16,
  FileSpreadsheet16,
  FilePdf16,
} from '@weave-design/icons';
import { FileEntry, ProjectState } from '../types/fs';
import {
  FolderSearch,
  FolderPlus,
  FilePlus,
  ChevronDown,
  ChevronRight,
  Plus,
  Wrench,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { AddToolDialog } from './AddToolDialog';

interface FileTreeProps {
  project: ProjectState;
  onSelectFile: (file: FileEntry) => void;
  onOpenFolderDialog: () => void;
  onCreateFile?: (targetDir: string, name: string) => Promise<boolean>;
  onCreateFolder?: (targetDir: string, name: string) => Promise<boolean>;
  onDeletePath?: (targetPath: string) => Promise<boolean>;
  onRefresh?: () => Promise<void>;
}

export const FileTree: React.FC<FileTreeProps> = ({
  project,
  onSelectFile,
  onOpenFolderDialog,
  onCreateFile,
  onCreateFolder,
  onDeletePath,
  onRefresh,
}) => {
  const [isFolderOpen, setIsFolderOpen] = useState<boolean>(true);
  const [isToolsOpen, setIsToolsOpen] = useState<boolean>(true);
  const [isAddToolOpen, setIsAddToolOpen] = useState<boolean>(false);

  // File & Folder inline creation state
  const [creationMode, setCreationMode] = useState<'file' | 'folder' | null>(null);
  const [creationTargetDir, setCreationTargetDir] = useState<string>('');
  const [creationName, setCreationName] = useState<string>('');
  const creationInputRef = useRef<HTMLInputElement>(null);

  // Folder expansion state
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetItem?: FileEntry | null;
  } | null>(null);

  // Vertical resizing for the Tools pane (defaults to 50% split)
  const [toolsHeight, setToolsHeight] = useState<number | null>(null);
  const [isResizingTools, setIsResizingTools] = useState<boolean>(false);
  const dragStartYRef = useRef<number>(0);
  const dragStartHeightRef = useRef<number>(300);
  const sidebarContainerRef = useRef<HTMLElement>(null);

  const startResizingTools = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingTools(true);
    dragStartYRef.current = e.clientY;
    const currentH =
      toolsHeight !== null
        ? toolsHeight
        : sidebarContainerRef.current
        ? Math.round(sidebarContainerRef.current.clientHeight * 0.5)
        : 300;
    dragStartHeightRef.current = currentH;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingTools) return;
      const deltaY = dragStartYRef.current - e.clientY;
      const totalH = sidebarContainerRef.current?.clientHeight || 600;
      const minH = 75;
      const maxH = Math.max(minH, totalH - 130);
      const nextH = Math.max(minH, Math.min(maxH, dragStartHeightRef.current + deltaY));
      setToolsHeight(Math.round(nextH));
    };

    const handleMouseUp = () => {
      setIsResizingTools(false);
    };

    if (isResizingTools) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingTools]);

  // Close context menu on outside click or escape
  useEffect(() => {
    const handleOutside = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  // Autofocus inline creation input when mode activates
  useEffect(() => {
    if (creationMode && creationInputRef.current) {
      creationInputRef.current.focus();
      creationInputRef.current.select();
    }
  }, [creationMode]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleStartCreate = (mode: 'file' | 'folder', targetDir?: string) => {
    if (!project.rootPath) {
      onOpenFolderDialog();
      return;
    }
    setIsFolderOpen(true);
    const destination =
      targetDir ||
      (project.selectedFile?.isDirectory ? project.selectedFile.path : project.rootPath);

    setCreationTargetDir(destination);
    setCreationName('');
    setCreationMode(mode);

    // Expand destination folder if creating inside a subfolder
    if (destination && destination !== project.rootPath) {
      setExpandedFolderIds((prev) => new Set(prev).add(destination));
    }
  };

  const handleConfirmCreate = async () => {
    const name = creationName.trim();
    const mode = creationMode;
    const targetDir = creationTargetDir || project.rootPath || '';

    setCreationMode(null);
    setCreationName('');

    if (!name || !mode) return;

    if (mode === 'file' && onCreateFile) {
      await onCreateFile(targetDir, name);
    } else if (mode === 'folder' && onCreateFolder) {
      await onCreateFolder(targetDir, name);
    }
  };

  const handleCancelCreate = () => {
    setCreationMode(null);
    setCreationName('');
  };

  const handleContextMenu = (e: React.MouseEvent, item?: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 170),
      y: Math.min(e.clientY, window.innerHeight - 180),
      targetItem: item || null,
    });
  };

  const getFileIcon = (file: FileEntry, isExpanded?: boolean) => {
    if (file.isDirectory) {
      return isExpanded ? <FolderOpen16 /> : <Folder16 />;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (['edb', '$et', 'sdb', '$2k', 'rvt', 'r3d', 'std'].includes(ext)) {
      return <FileAssembly16 />;
    }
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      return <FileSpreadsheet16 />;
    }
    if (ext === 'pdf') {
      return <FilePdf16 />;
    }
    if (['doc', 'docx', 'md', 'txt'].includes(ext)) {
      return <FileDocument16 />;
    }
    return <FileGeneric16 />;
  };

  // Render recursive file tree nodes with tight, exact spacing
  const renderTreeNodes = (
    items: FileEntry[],
    level: number = 0,
    parentPath: string = project.rootPath || ''
  ): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const isTargetHere =
      creationMode !== null &&
      (creationTargetDir === parentPath || (!creationTargetDir && parentPath === project.rootPath));

    // Prepend inline new line at the destination location
    if (isTargetHere) {
      nodes.push(
        <div
          key="__statikor_new_entry__"
          style={{ paddingLeft: `${level * 10 + 4}px` }}
          className="h-[21px] flex items-center pr-1.5 text-[11px] font-mono leading-none bg-[#07172b]/70 border-l-2 border-[#00c8e6] shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow slot spacer (12px + 4px margin) to align icon with all other items */}
          <span className="w-3 h-3 mr-1 shrink-0" aria-hidden="true" />
          <span className="shrink-0 mr-1.5 text-[#00c8e6] scale-90">
            {creationMode === 'folder' ? <Folder16 /> : <FileGeneric16 />}
          </span>
          <input
            ref={creationInputRef}
            type="text"
            value={creationName}
            onChange={(e) => setCreationName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirmCreate();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelCreate();
              }
            }}
            onBlur={() => {
              if (creationName.trim()) {
                handleConfirmCreate();
              } else {
                handleCancelCreate();
              }
            }}
            placeholder=""
            className="flex-1 bg-[#061220] border border-[#00c8e6] rounded px-1 py-0 h-[17px] text-[#00c8e6] text-[11px] font-mono outline-none min-w-0"
            autoFocus
          />
        </div>
      );
    }

    items.forEach((item) => {
      const isSelected = project.selectedFile?.id === item.id;
      const isExpanded = expandedFolderIds.has(item.id);
      const isChildTarget = creationMode !== null && creationTargetDir === item.path;

      nodes.push(
        <div key={item.id} className="flex flex-col">
          {/* Item Row */}
          <div
            style={{ paddingLeft: `${level * 10 + 4}px` }}
            onClick={(e) => {
              e.stopPropagation();
              if (item.isDirectory) {
                toggleFolder(item.id);
              }
              onSelectFile(item);
            }}
            onContextMenu={(e) => handleContextMenu(e, item)}
            className={`h-[21px] flex items-center pr-1.5 rounded-sm cursor-pointer group select-none text-[11px] font-mono leading-none truncate transition-colors ${
              isSelected
                ? 'bg-[#00f0ff]/15 text-[#00c8e6] font-medium'
                : 'hover:bg-[#08182b] text-hud-text hover:text-[#00c8e6]'
            }`}
          >
            {/* Arrow slot: always exactly 12px width + 4px margin */}
            {item.isDirectory ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(item.id);
                }}
                className="w-3 h-3 mr-1 flex items-center justify-center shrink-0 text-[#546b82] group-hover:text-hud-text transition-colors"
              >
                <ChevronRight
                  className={`w-3 h-3 transition-transform duration-100 ${
                    isExpanded ? 'rotate-90 text-hud-text' : ''
                  }`}
                />
              </button>
            ) : (
              /* For files: identical 12px spacer + 4px margin so icons align */
              <span className="w-3 h-3 mr-1 shrink-0" aria-hidden="true" />
            )}

            {/* File / Folder Icon */}
            <span
              className={`shrink-0 mr-1.5 scale-90 transition-colors ${
                isSelected ? 'text-[#00c8e6]' : 'text-[#44596d] group-hover:text-[#00c8e6]'
              }`}
            >
              {getFileIcon(item, isExpanded)}
            </span>

            {/* Item Name */}
            <span className="truncate flex-1">{item.name}</span>

            {/* Quick action buttons on hover */}
            {item.isDirectory ? (
              <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-0.5 shrink-0 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartCreate('file', item.path);
                  }}
                  title={`New file in ${item.name}`}
                  className="p-0.5 rounded hover:bg-[#0e2840] text-[#546b82] hover:text-[#00c8e6] transition-colors"
                >
                  <FilePlus className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartCreate('folder', item.path);
                  }}
                  title={`New folder in ${item.name}`}
                  className="p-0.5 rounded hover:bg-[#0e2840] text-[#546b82] hover:text-[#00c8e6] transition-colors"
                >
                  <FolderPlus className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : onDeletePath ? (
              <div className="opacity-0 group-hover:opacity-100 flex items-center shrink-0 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${item.name}"?`)) {
                      onDeletePath(item.path);
                    }
                  }}
                  title={`Delete ${item.name}`}
                  className="p-0.5 rounded hover:bg-red-500/20 text-[#546b82] hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : null}
          </div>

          {/* Children: render when folder is expanded, or when this folder is target of new file creation */}
          {item.isDirectory && (isExpanded || isChildTarget) && (
            <div className="flex flex-col">
              {renderTreeNodes(item.children || [], level + 1, item.path)}
            </div>
          )}
        </div>
      );
    });

    return nodes;
  };

  const isOnlyToolsOpen = !isFolderOpen && isToolsOpen;

  return (
    <>
      <aside
        ref={sidebarContainerRef}
        className="w-full h-full flex flex-col bg-[#050d18] text-hud-text select-none overflow-hidden"
      >
        {/* Sidebar Header: EXPLORE */}
        <div className="h-9 px-3 border-b border-[#0e2236] flex items-center justify-between bg-[#03070d] shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-hud-text font-mono">
            Explore
          </span>
          <div className="flex items-center space-x-1">
            {project.projectName && (
              <>
                <button
                  onClick={() => handleStartCreate('file')}
                  title="New File"
                  className="p-1 rounded hover:bg-[#091728] text-[#546b82] hover:text-[#00c8e6] transition-colors"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleStartCreate('folder')}
                  title="New Folder"
                  className="p-1 rounded hover:bg-[#091728] text-[#546b82] hover:text-[#00c8e6] transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onRefresh?.()}
                  title="Refresh Explorer"
                  className="p-1 rounded hover:bg-[#091728] text-[#546b82] hover:text-[#00c8e6] transition-colors"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={onOpenFolderDialog}
              title={project.projectName ? 'Change Project Folder' : 'Open Project Folder'}
              className="p-1 rounded hover:bg-[#091728] text-[#44596d] hover:text-[#00c8e6] transition-colors"
            >
              <FolderSearch className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Panel 1: Current Folder / Open A Folder (Collapsible) */}
        <div
          className={`flex flex-col overflow-hidden transition-all duration-150 ${
            isFolderOpen
              ? isToolsOpen
                ? 'flex-1 min-h-[100px]'
                : 'flex-1'
              : 'shrink-0'
          }`}
        >
          {/* Panel 1 Header */}
          <div
            onClick={() => setIsFolderOpen((prev) => !prev)}
            className="h-8 px-2.5 flex items-center justify-between bg-[#06101d] hover:bg-[#091728] border-b border-[#0e2236] cursor-pointer transition-colors shrink-0 group"
          >
            <div className="flex items-center space-x-1.5 truncate">
              {isFolderOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#546b82] group-hover:text-hud-text transition-colors shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#546b82] group-hover:text-hud-text transition-colors shrink-0" />
              )}
              {project.projectName ? (
                <span className="text-[10.5px] font-semibold text-hud-text font-mono truncate uppercase tracking-wider">
                  {project.projectName}
                </span>
              ) : (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenFolderDialog();
                  }}
                  className="text-[10.5px] italic text-[#7ba5c6] hover:text-[#00c8e6] transition-colors cursor-pointer"
                  title="Click to select project folder"
                >
                  Open A Folder
                </span>
              )}
            </div>

            {project.projectName && (
              <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartCreate('file');
                  }}
                  title="New File"
                  className="p-0.5 rounded hover:bg-[#0f243b] text-[#546b82] hover:text-[#00c8e6] transition-all"
                >
                  <FilePlus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartCreate('folder');
                  }}
                  title="New Folder"
                  className="p-0.5 rounded hover:bg-[#0f243b] text-[#546b82] hover:text-[#00c8e6] transition-all"
                >
                  <FolderPlus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefresh?.();
                  }}
                  title="Refresh Explorer"
                  className="p-0.5 rounded hover:bg-[#0f243b] text-[#546b82] hover:text-[#00c8e6] transition-all"
                >
                  <RotateCw className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Panel 1 Body (File Tree or Open Folder State) */}
          {isFolderOpen && (
            <div
              onContextMenu={(e) => handleContextMenu(e)}
              className="flex-1 overflow-y-auto py-1 px-0.5 flex flex-col"
            >
              {project.files.length === 0 && !creationMode ? (
                <div className="h-full min-h-[100px] flex flex-col items-center justify-center text-center p-4 text-[#44596d]">
                  <div className="w-9 h-9 rounded-lg bg-[#071322] border border-[#0e2236] flex items-center justify-center mb-2 text-[#44596d]">
                    <FolderOpen16 />
                  </div>
                  <p className="text-xs mb-3 text-[#44596d] font-mono italic">
                    {project.rootPath ? 'Empty folder' : 'No folder open'}
                  </p>
                  <button
                    onClick={onOpenFolderDialog}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#071322] hover:bg-[#0b1c2e] border border-[#0e2236] hover:border-[#00f0ff]/20 text-hud-text hover:text-[#00c8e6] text-xs font-mono transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-[#00c8e6]/70" />
                    <span>{project.rootPath ? 'Open Another Folder' : 'Open Folder'}</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col w-full">
                  {renderTreeNodes(project.files)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Draggable Splitter Handle above Tools Pane (when both panels are open) */}
        {isFolderOpen && isToolsOpen && (
          <div
            onMouseDown={startResizingTools}
            className="h-[5px] w-full cursor-row-resize select-none relative flex items-center justify-center group shrink-0 bg-[#071322] border-t border-b border-[#0e2236] hover:bg-[#00c8e6]/20 transition-colors z-20"
            title="Drag to resize Tools panel"
          >
            {/* Expanded hit area so dragging is easy to engage */}
            <div className="absolute inset-x-0 -top-1.5 -bottom-1.5 z-30 cursor-row-resize" />

            {/* Subtle horizontal grip indicator */}
            <div
              className={`h-[2px] w-8 rounded-full transition-colors pointer-events-none ${
                isResizingTools
                  ? 'bg-[#00c8e6] shadow-[0_0_6px_#00c8e6]'
                  : 'bg-[#2e4760] group-hover:bg-[#00c8e6]'
              }`}
            />
          </div>
        )}

        {/* Panel 2: Tools (Collapsible & Draggable - Defaults to 50% height) */}
        <div
          style={
            isFolderOpen && isToolsOpen && toolsHeight !== null
              ? { height: `${toolsHeight}px` }
              : undefined
          }
          className={`flex flex-col overflow-hidden transition-all duration-150 ${
            isOnlyToolsOpen
              ? 'flex-1'
              : isToolsOpen
              ? toolsHeight !== null
                ? 'shrink-0'
                : 'flex-1 min-h-[75px]'
              : 'shrink-0 border-t border-[#0e2236]'
          }`}
        >
          {/* Panel 2 Header */}
          <div
            onClick={() => setIsToolsOpen((prev) => !prev)}
            className="h-8 px-2.5 flex items-center justify-between bg-[#06101d] hover:bg-[#091728] border-b border-[#0e2236] cursor-pointer transition-colors shrink-0 group"
          >
            <div className="flex items-center space-x-1.5 truncate">
              {isToolsOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#546b82] group-hover:text-hud-text transition-colors shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#546b82] group-hover:text-hud-text transition-colors shrink-0" />
              )}
              <span className="text-[10.5px] font-semibold text-hud-text font-mono uppercase tracking-wider">
                Tools
              </span>
            </div>
          </div>

          {/* Panel 2 Body */}
          {isToolsOpen && (
            <div className="flex-1 p-3 flex flex-col space-y-2.5 overflow-y-auto">
              <button
                type="button"
                onClick={() => setIsAddToolOpen(true)}
                className="w-full flex items-center justify-center space-x-2 py-1.5 px-3 rounded bg-[#00c8e6]/10 hover:bg-[#00c8e6]/20 border border-[#00c8e6]/30 hover:border-[#00c8e6]/60 text-[#00c8e6] text-xs font-mono font-medium transition-all group shadow-sm shrink-0"
              >
                <Plus className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                <span>Add Tool</span>
              </button>

              <div className="py-2 px-2 rounded border border-dashed border-[#0e2236] bg-[#030914]/50 text-center">
                <div className="flex items-center justify-center space-x-1.5 text-[#44596d] mb-1">
                  <Wrench className="w-3 h-3 text-[#44596d]" />
                  <span className="text-[11px] font-mono">Engineering Tools</span>
                </div>
                <p className="text-[10px] text-[#3b4e61] font-mono leading-tight">
                  Connect structural software to automate member design and analysis.
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Right-Click HUD Context Menu */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 min-w-[150px] py-1 bg-[#061220] border border-[#0e2840] rounded shadow-2xl text-xs font-mono select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const targetDir = contextMenu.targetItem?.isDirectory
                ? contextMenu.targetItem.path
                : contextMenu.targetItem
                ? contextMenu.targetItem.path.substring(0, contextMenu.targetItem.path.lastIndexOf('/'))
                : project.rootPath || '';
              handleStartCreate('file', targetDir);
              setContextMenu(null);
            }}
            className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-[#0e2840] text-hud-text hover:text-[#00c8e6] transition-colors text-left"
          >
            <FilePlus className="w-3.5 h-3.5 text-[#00c8e6]" />
            <span>New File</span>
          </button>
          <button
            onClick={() => {
              const targetDir = contextMenu.targetItem?.isDirectory
                ? contextMenu.targetItem.path
                : contextMenu.targetItem
                ? contextMenu.targetItem.path.substring(0, contextMenu.targetItem.path.lastIndexOf('/'))
                : project.rootPath || '';
              handleStartCreate('folder', targetDir);
              setContextMenu(null);
            }}
            className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-[#0e2840] text-hud-text hover:text-[#00c8e6] transition-colors text-left"
          >
            <FolderPlus className="w-3.5 h-3.5 text-[#00c8e6]" />
            <span>New Folder</span>
          </button>
          <div className="h-[1px] bg-[#0e2840] my-1" />
          <button
            onClick={() => {
              onRefresh?.();
              setContextMenu(null);
            }}
            className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-[#0e2840] text-hud-text hover:text-[#00c8e6] transition-colors text-left"
          >
            <RotateCw className="w-3.5 h-3.5 text-[#546b82]" />
            <span>Refresh</span>
          </button>
          {contextMenu.targetItem && onDeletePath && (
            <>
              <div className="h-[1px] bg-[#0e2840] my-1" />
              <button
                onClick={() => {
                  const item = contextMenu.targetItem!;
                  if (confirm(`Delete "${item.name}"?`)) {
                    onDeletePath(item.path);
                  }
                  setContextMenu(null);
                }}
                className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-red-500/20 text-red-400 transition-colors text-left"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Add Tool Modal Dialog */}
      <AddToolDialog
        isOpen={isAddToolOpen}
        onClose={() => setIsAddToolOpen(false)}
      />
    </>
  );
};
